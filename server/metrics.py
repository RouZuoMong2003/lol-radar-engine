"""6 维度公式 · 唯一实现（ETL 与 API 都从这里 import）。
契约见 docs/SPEC.md §4。
"""
from __future__ import annotations
import math
from statistics import mean, pstdev
from typing import Iterable, Sequence

# --- 工具 ---

def clamp(v, lo=0, hi=100):
    return max(lo, min(hi, v))

def normalize_range(v, lo, hi):
    """线性映射 [lo,hi] → [0,100]，超出夹紧。"""
    if v is None: return 50
    return clamp(round((v - lo) / (hi - lo) * 100))

def zscore_to_100(value, samples: Sequence[float]) -> int:
    """同组 z-score → 60 + z*15 → clamp[0,100]"""
    if value is None or not samples: return 60
    samples = [s for s in samples if s is not None]
    if not samples: return 60
    m = mean(samples)
    s = pstdev(samples) or 1.0
    return clamp(round(60 + (value - m) / s * 15))

# --- 选手维度（接收聚合后的 raw dict，返回原始分） ---
# raw 内字段命名见 SPEC §1.1 + scripts/04 输出

def player_dimensions(raw: dict) -> dict:
    """返回 6 个维度的"原始分"（未 z-score），后续在 05 步统一标准化。"""
    g = max(raw.get("games", 0), 1)
    K = raw.get("sum_kills", 0); D = raw.get("sum_deaths", 0); A = raw.get("sum_assists", 0)
    TK = raw.get("sum_teamkills", 0)
    kp_rate = (K + A) / TK if TK else 0
    kda     = (K + A) / max(D, 1)
    multikill = (raw.get("sum_double",0) + 2*raw.get("sum_triple",0)
                 + 3*raw.get("sum_quad",0) + 5*raw.get("sum_penta",0)) / g

    win_rate = raw.get("wins",0) / g
    comeback = raw.get("comeback_rate", 0) or 0
    death_stab = raw.get("death_stability", 0) or 0
    pool_breadth = min(raw.get("champion_pool", 0) / 12.0, 1.0)
    latest_wr = raw.get("latest_patch_winrate", win_rate) or 0
    new_champ = raw.get("new_champ_score", 0) or 0

    is_sup = raw.get("position") == "sup"
    gd_field = raw.get("avg_gd10") if is_sup else raw.get("avg_gd15")
    cd_field = raw.get("avg_csd10") if is_sup else raw.get("avg_csd15")
    xpd_field = raw.get("avg_xpd15") or 0

    first_resource = raw.get("first_resource_rate", 0) or 0
    first_tower    = raw.get("first_tower_rate", 0) or 0

    # 这些是要做 z-score 的"二级原始值"，返给 05 步分组标准化
    return {
        # 团战
        "_kp": kp_rate * 100,
        "_mitig": raw.get("avg_mitig") or 0,        # damagemitigatedperminute
        "_first_res": first_resource * 100,
        # 线上
        "_gd": gd_field or 0,
        "_csd": cd_field or 0,
        "_xpd": xpd_field,
        # 长线
        "_vspm": raw.get("avg_vspm") or 0,
        "_wcpm": raw.get("avg_wcpm") or 0,
        "_egshare": raw.get("avg_egshare") or 0,
        "_first_tow": first_tower * 100,
        # 操作
        "_kda": min(kda, 10),                       # 截顶避免极值
        "_dpm": raw.get("avg_dpm") or 0,
        "_dshare": raw.get("avg_damageshare") or 0,
        "_multi": multikill,
        # 心态
        "_winrate": win_rate * 100,
        "_comeback": comeback * 100,
        "_dstab": death_stab * 100,
        # 版本
        "_pool": pool_breadth * 100,
        "_latest": latest_wr * 100,
        "_newchamp": new_champ * 100,
    }

PLAYER_DIM_FORMULA = {
    # dim_key: [(weight, raw_key), ...]
    "d_teamfight":   [(0.40, "_kp"),       (0.30, "_mitig_n"),  (0.30, "_first_res")],
    "d_laning":      [(0.50, "_gd_n"),     (0.30, "_csd_n"),    (0.20, "_xpd_n")],
    "d_macro":       [(0.35, "_vspm_n"),   (0.25, "_wcpm_n"),
                      (0.20, "_egshare_n"),(0.20, "_first_tow")],
    "d_mechanics":   [(0.40, "_kda_n"),    (0.30, "_dpm_n"),
                      (0.15, "_dshare_n"), (0.15, "_multi_n")],
    "d_consistency": [(0.50, "_winrate"),  (0.30, "_comeback"), (0.20, "_dstab")],
    "d_meta_adapt":  [(0.50, "_pool"),     (0.30, "_latest"),   (0.20, "_newchamp")],
}

# 哪些"原始项"需要做组内 z-score（标记 _n 后缀）
ZSCORE_FIELDS = ["_mitig", "_gd", "_csd", "_xpd", "_vspm", "_wcpm",
                 "_egshare", "_kda", "_dpm", "_dshare", "_multi"]

# --- 队伍维度 ---
# 按 SPEC §4.2：双源混合，gspd/gpr 直读

def team_dimensions(team_agg: dict, players_avg: dict) -> dict:
    """
    team_agg: 来自 position='team' 行的聚合（avg_gspd / avg_gpr / avg_ckpm / win_rate ...）
    players_avg: 该队 5 选手 d_* 的加权平均字典
    返回 6 个维度的最终 0-100 分（不再做 z-score；队伍间数据量小且 gspd 已是相对量）。
    """
    gspd = team_agg.get("avg_gspd") or 0     # 一般在 [-0.2, 0.2]
    gpr  = team_agg.get("avg_gpr")  or 0     # 一般在 [-1, 1]
    ckpm = team_agg.get("avg_ckpm") or 0     # 击杀节奏

    return {
        "d_teamfight":   round(0.5 * players_avg.get("d_teamfight",60)
                               + 0.5 * normalize_range(ckpm, 0.4, 0.9)),
        "d_laning":      round(players_avg.get("d_laning", 60)),
        # ★ 队伍长线运营 = 直接用 EGR 类 gspd + gpr + 选手 wcpm 加权
        "d_macro":       round(0.6 * normalize_range(gspd, -0.10, 0.10)
                               + 0.2 * normalize_range(gpr,  -0.50, 0.50)
                               + 0.2 * players_avg.get("d_macro", 60)),
        "d_mechanics":   round(players_avg.get("d_mechanics", 60)),
        "d_consistency": round(0.5 * (team_agg.get("win_rate", 0.5) * 100)
                               + 0.5 * players_avg.get("d_consistency", 60)),
        "d_meta_adapt":  round(players_avg.get("d_meta_adapt", 60)),
    }

# --- 综合评分 ---

def scores(d_values: Iterable[float], win_rate: float) -> tuple[int, int]:
    """text_score & season_rating（SPEC §4.4）"""
    avg6 = sum(d_values) / 6
    text = round(avg6 * 16 + win_rate * 40)
    season = round(text * (1 + (win_rate - 0.5) * 0.2))
    return text, season
