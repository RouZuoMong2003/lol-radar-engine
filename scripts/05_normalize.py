"""Step 05 · 同 (league, season, position) 组 z-score + 排名 + text_score
读取 04 step 落盘的 _stage_player_raw.pkl
"""
import sys, pickle
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
from collections import defaultdict
from _common import db, step_log, ROOT
import metrics as M

STAGE = ROOT / "db" / "_stage_player_raw.pkl"

def main():
    with step_log("05_normalize") as st:
        if not STAGE.exists():
            raise FileNotFoundError("先运行 04_aggregate_player.py")
        with open(STAGE, "rb") as f:
            raw_list = pickle.load(f)

        # 一、按 (league, season, position) 分组
        groups = defaultdict(list)
        for r in raw_list:
            league = r["season_id"].split("-", 1)[0]
            r["_league"] = league
            groups[(league, r["season_id"], r["position"])].append(r)

        # 二、每组对 ZSCORE_FIELDS 做 z-score → 写到 r["_dim_inputs"][k+"_n"]
        for grp_key, items in groups.items():
            for fld in M.ZSCORE_FIELDS:
                samples = [it["_dim_inputs"][fld] for it in items]
                for it in items:
                    v = it["_dim_inputs"][fld]
                    it["_dim_inputs"][fld + "_n"] = M.zscore_to_100(v, samples)

        # 三、按公式合成 6 维度 + 综合评分，写回 player_season
        c = db()
        for r in raw_list:
            di = r["_dim_inputs"]
            d = {}
            for dim_key, terms in M.PLAYER_DIM_FORMULA.items():
                d[dim_key] = round(sum(w * di[k] for w, k in terms))
                d[dim_key] = max(0, min(100, d[dim_key]))
            # LPL(partial) 缺分段差值 → 线上压制降级为赛区中性基线 60
            if not di.get("_laning_ok", True):
                d["d_laning"] = 60
            text, season_rating = M.scores(d.values(), r["win_rate"])

            c.execute("""
              UPDATE player_season SET
                d_teamfight=?, d_laning=?, d_macro=?, d_mechanics=?,
                d_consistency=?, d_meta_adapt=?,
                text_score=?, season_rating=?
              WHERE player_id=? AND season_id=?
            """, (
                d["d_teamfight"], d["d_laning"], d["d_macro"], d["d_mechanics"],
                d["d_consistency"], d["d_meta_adapt"],
                text, season_rating,
                r["player_id"], r["season_id"],
            ))

        # 四、排名（同 season+position 内按 text_score 排）
        c.execute("""
          WITH ranked AS (
            SELECT player_id, season_id,
                   RANK() OVER (PARTITION BY season_id, position ORDER BY text_score DESC) rk,
                   COUNT(*) OVER (PARTITION BY season_id, position) cnt
            FROM player_season
          )
          UPDATE player_season SET
            r_position = (SELECT rk  FROM ranked r
                          WHERE r.player_id=player_season.player_id AND r.season_id=player_season.season_id),
            total_in_pos = (SELECT cnt FROM ranked r
                            WHERE r.player_id=player_season.player_id AND r.season_id=player_season.season_id)
        """)
        c.commit()
        st["rows_out"] = len(raw_list)

        # 验证：LCK 中单 top5
        print("\n--- LCK 中单 text_score Top5 ---")
        for row in c.execute("""
          SELECT p.current_handle, ps.text_score, ps.r_position, ps.total_in_pos,
                 ps.d_teamfight, ps.d_laning, ps.d_macro, ps.d_mechanics, ps.d_consistency, ps.d_meta_adapt
          FROM player_season ps JOIN players p ON p.id=ps.player_id
          WHERE ps.position='mid' AND ps.season_id LIKE 'LCK-%'
          ORDER BY ps.text_score DESC LIMIT 5
        """):
            print(f"  {row['current_handle']:<10} score={row['text_score']:>4} #{row['r_position']}/{row['total_in_pos']}  "
                  f"team={row['d_teamfight']} lane={row['d_laning']} macro={row['d_macro']} "
                  f"mech={row['d_mechanics']} cons={row['d_consistency']} meta={row['d_meta_adapt']}")
        c.close()

if __name__ == "__main__":
    main()
