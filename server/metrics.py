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
    def g0(key, d=0):
        """安全取数：键不存在或值为 None 都返回默认值。"""
        v = raw.get(key)
        return d if v is None else v
    g = max(g0("games", 0), 1)
    K = g0("sum_kills"); D = g0("sum_deaths"); A = g0("sum_assists")
    TK = g0("sum_teamkills")
    kp_rate = (K + A) / TK if TK else 0
    kda     = (K + A) / max(D, 1)
    multikill = (g0("sum_double") + 2*g0("sum_triple")
                 + 3*g0("sum_quad") + 5*g0("sum_penta")) / g

    win_rate = g0("wins") / g
    comeback = g0("comeback_rate")
    death_stab = g0("death_stability")
    pool_breadth = min(g0("champion_pool") / 12.0, 1.0)
    latest_wr = raw.get("latest_patch_winrate")
    latest_wr = win_rate if latest_wr is None else latest_wr
    new_champ = g0("new_champ_score")

    is_sup = raw.get("position") == "sup"
    gd_field = raw.get("avg_gd10") if is_sup else raw.get("avg_gd15")
    cd_field = raw.get("avg_csd10") if is_sup else raw.get("avg_csd15")
    xpd_field = g0("avg_xpd15")

    first_resource = g0("first_resource_rate")
    first_tower    = g0("first_tower_rate")

    # LPL(partial) 缺分段差值字段，标记 laning 数据是否可用
    laning_available = gd_field is not None

    # 这些是要做 z-score 的"二级原始值"，返给 05 步分组标准化
    return {
        # 团战
        "_kp": kp_rate * 100,
        "_mitig": g0("avg_mitig"),        # damagemitigatedperminute
        "_first_res": first_resource * 100,
        # 线上（缺失时给 None，05 步会用赛区基线兜底）
        "_gd": gd_field if gd_field is not None else 0,
        "_csd": cd_field if cd_field is not None else 0,
        "_xpd": xpd_field,
        "_laning_ok": laning_available,
        # 长线
        "_vspm": g0("avg_vspm"),
        "_wcpm": g0("avg_wcpm"),
        "_egshare": g0("avg_egshare"),
        "_first_tow": first_tower * 100,
        # 操作
        "_kda": min(kda, 10),                       # 截顶避免极值
        "_dpm": g0("avg_dpm"),
        "_dshare": g0("avg_damageshare"),
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


# ============================================================
# 维度展示元数据（前端字段名 + 计算原理）
# 第 3 点：六维图加上具体字段名
# 第 7 点：雷达图维度端点计算原理
# ============================================================
DIM_META = {
    "d_teamfight": {
        "label": "团战决策",
        "fields": "KP% · 减伤",
        "formula": "0.4×击杀参与率(KP%) + 0.3×减伤(damagemitigatedperminute) + 0.3×首资源参与率",
    },
    "d_laning": {
        "label": "线上压制",
        "fields": "金差@15 · 补刀差 · 经验差",
        "formula": "0.5×金币差@15(golddiffat15) + 0.3×补刀差@15(csdiffat15) + 0.2×经验差@15(xpdiffat15)",
    },
    "d_macro": {
        "label": "长线运营",
        "fields": "视野 · 控眼 · 经济占比",
        "formula": "0.35×视野/分(vspm) + 0.25×控眼/分(wcpm) + 0.2×经济占比(earnedgoldshare) + 0.2×首塔率",
    },
    "d_mechanics": {
        "label": "操作上限",
        "fields": "KDA · DPM · 输出占比",
        "formula": "0.4×KDA + 0.3×每分钟伤害(dpm) + 0.15×伤害占比(damageshare) + 0.15×多杀分",
    },
    "d_consistency": {
        "label": "心态稳定",
        "fields": "胜率 · 逆风胜率 · 死亡稳定",
        "formula": "0.5×胜率(result) + 0.3×逆风局胜率(15分落后>1k仍获胜) + 0.2×死亡数稳定性",
    },
    "d_meta_adapt": {
        "label": "版本适应",
        "fields": "英雄池 · 新版本胜率",
        "formula": "0.5×英雄池广度(champion) + 0.3×最近2补丁胜率(patch) + 0.2×新英雄使用分",
    },
}

# 队伍维度的字段名（部分直读 team 行二级数据）
TEAM_DIM_FIELDS = {
    "d_teamfight": "选手均值 · 击杀节奏(ckpm)",
    "d_laning":    "五人线上均值",
    "d_macro":     "经济差GSPD · 黄金比率GPR · 控眼",
    "d_mechanics": "五人操作均值",
    "d_consistency":"胜率 · 选手均值",
    "d_meta_adapt": "五人版本均值",
}

NORMALIZE_NOTE = (
    "所有维度端点为 0–100 整数：同赛区、同位置选手分组后做 z-score 标准化，"
    "再线性映射到 60±15（60 = 同位置赛区均值，即图中橙色基线）。"
    "队伍的长线运营直接采用 Oracle's Elixir 现成的队伍级经济差(GSPD)与黄金比率(GPR)。"
)
