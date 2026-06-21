"""REST API · 契约见 docs/SPEC.md §3"""
import sqlite3
from pathlib import Path
from flask import Blueprint, jsonify, request, g

DB_PATH = Path(__file__).resolve().parent.parent / "db" / "radar.db"
api = Blueprint("api", __name__, url_prefix="/api")

# 维度标签映射（唯一定义，导出给 08_export_static.py 使用）
DIM_LABELS = {
    "d_teamfight":   "团战决策",
    "d_laning":      "线上压制",
    "d_macro":       "长线运营",
    "d_mechanics":   "操作上限",
    "d_consistency": "心态稳定",
    "d_meta_adapt":  "版本适应",
}

# 维度 key 白名单（防止 SQL 注入）
_VALID_DIM_KEYS = frozenset(DIM_LABELS.keys())

POSITION_LABELS = {
    "top": "上单", "jng": "打野", "mid": "中单",
    "bot": "下路", "sup": "辅助", "team": "队伍",
}


# --- DB 连接管理（请求级生命周期） ---

def get_db():
    """获取当前请求的 DB 连接（懒初始化）"""
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@api.teardown_app_request
def close_db(exc):
    """请求结束时关闭连接"""
    db = g.pop("db", None)
    if db is not None:
        db.close()


# --- 字典类 ---

@api.get("/leagues")
def list_leagues():
    rows = get_db().execute("SELECT * FROM leagues ORDER BY tier, id").fetchall()
    return jsonify([dict(r) for r in rows])


@api.get("/seasons")
def list_seasons():
    league = request.args.get("league_id")
    sql = "SELECT * FROM seasons"
    args = ()
    if league:
        sql += " WHERE league_id=?"
        args = (league,)
    sql += " ORDER BY year DESC, split"
    rows = get_db().execute(sql, args).fetchall()
    return jsonify([dict(r) for r in rows])


@api.get("/teams")
def list_teams():
    sid = request.args.get("season_id")
    db = get_db()
    if sid:
        rows = db.execute("""
          SELECT t.id, t.name, ts.text_score, ts.r_league, ts.total_in_league
          FROM teams t
          JOIN team_season ts ON ts.team_id=t.id
          WHERE ts.season_id=?
          ORDER BY ts.text_score DESC
        """, (sid,)).fetchall()
    else:
        rows = db.execute("SELECT * FROM teams ORDER BY name").fetchall()
    return jsonify([dict(r) for r in rows])


@api.get("/players")
def list_players():
    sid = request.args.get("season_id")
    pos = request.args.get("position")
    sql = """
      SELECT p.id, p.current_handle, ps.position, ps.team_id, t.name team_name,
             ps.text_score, ps.r_position, ps.total_in_pos
      FROM player_season ps
      JOIN players p ON p.id=ps.player_id
      LEFT JOIN teams t ON t.id=ps.team_id
      WHERE 1=1
    """
    args = []
    if sid:
        sql += " AND ps.season_id=?"
        args.append(sid)
    if pos:
        sql += " AND ps.position=?"
        args.append(pos)
    sql += " ORDER BY ps.text_score DESC"
    rows = get_db().execute(sql, args).fetchall()
    return jsonify([dict(r) for r in rows])


# --- RadarSubject 构造 ---

def build_dims(record, avg_record):
    """两条记录都是 sqlite3.Row，含 d_* 列。生成 dimensions 数组。"""
    out = []
    for key, label in DIM_LABELS.items():
        out.append({
            "key":   key,
            "label": label,
            "value": record[key] if record[key] is not None else 0,
            "avg":   round(avg_record[key]) if avg_record and avg_record[key] is not None else 60,
        })
    return out


def _dim_rank_sql(col, entity_col, table, where_clause):
    """构造维度排名 SQL（安全版：col 已通过白名单校验）"""
    return f"""
      WITH r AS (
        SELECT {entity_col},
               RANK() OVER (ORDER BY {col} DESC) rk,
               COUNT(*) OVER () cnt
        FROM {table}
        WHERE {where_clause} AND {col} IS NOT NULL
      )
      SELECT rk, cnt FROM r WHERE {entity_col}=?
    """


@api.get("/player/<player_id>")
def player_radar(player_id):
    sid = request.args.get("season_id")
    if not sid:
        return jsonify(error="season_id required", code=400), 400

    db = get_db()
    ps = db.execute(
        "SELECT ps.*, p.current_handle, t.name team_name "
        "FROM player_season ps "
        "JOIN players p ON p.id=ps.player_id "
        "LEFT JOIN teams t ON t.id=ps.team_id "
        "WHERE ps.player_id=? AND ps.season_id=?",
        (player_id, sid)
    ).fetchone()

    if not ps:
        return jsonify(error="not found", code=404), 404

    league_id = sid.split("-", 1)[0]
    avg = db.execute(
        "SELECT * FROM league_average WHERE league_id=? AND season_id=? AND position=?",
        (league_id, sid, ps["position"])
    ).fetchone()

    dims = build_dims(ps, avg)

    # 各维度同位置排名（白名单校验 dim key）
    for d in dims:
        if d["key"] not in _VALID_DIM_KEYS:
            continue
        sql = _dim_rank_sql(
            d["key"], "player_id", "player_season",
            "season_id=? AND position=?"
        )
        r = db.execute(sql, (sid, ps["position"], player_id)).fetchone()
        if r:
            d["rank"] = r["rk"]
            d["total"] = r["cnt"]

    pos_label = POSITION_LABELS.get(ps["position"], ps["position"])
    return jsonify({
        "type": "player",
        "id": player_id,
        "name": ps["current_handle"],
        "season_id": sid,
        "tags": [
            {"label": league_id, "color": "blue"},
            {"label": pos_label, "color": "red"},
        ],
        "top_stats": {
            "text_score": {
                "value": ps["text_score"],
                "rank": ps["r_position"],
                "total": ps["total_in_pos"],
                "subtitle": "Player Score",
            },
            "season_rating": {
                "value": ps["season_rating"],
                "rank": ps["r_position"],
                "total": ps["total_in_pos"],
                "subtitle": "Season Rating",
            },
        },
        "dimensions": dims,
        "raw": {
            "team_name": ps["team_name"],
            "games": ps["games"],
            "wins": ps["wins"],
            "losses": ps["losses"],
            "win_rate": round(ps["win_rate"] or 0, 3),
            "kda": round(ps["kda"] or 0, 2),
            "avg_dpm": round(ps["avg_dpm"] or 0, 1),
            "avg_vspm": round(ps["avg_vspm"] or 0, 2),
            "avg_cspm": round(ps["avg_cspm"] or 0, 2),
            "avg_gd15": round(ps["avg_gd15"] or 0, 1),
            "avg_csd15": round(ps["avg_csd15"] or 0, 2),
            "champion_pool": ps["champion_pool"],
        },
    })


@api.get("/team/<path:team_id>")
def team_radar(team_id):
    sid = request.args.get("season_id")
    if not sid:
        return jsonify(error="season_id required", code=400), 400

    db = get_db()
    ts = db.execute(
        "SELECT ts.*, t.name team_name FROM team_season ts "
        "JOIN teams t ON t.id=ts.team_id "
        "WHERE ts.team_id=? AND ts.season_id=?",
        (team_id, sid)
    ).fetchone()

    if not ts:
        return jsonify(error="not found", code=404), 404

    league_id = ts["league_id"]
    avg = db.execute(
        "SELECT * FROM league_average WHERE league_id=? AND season_id=? AND position='team'",
        (league_id, sid)
    ).fetchone()

    dims = build_dims(ts, avg)

    for d in dims:
        if d["key"] not in _VALID_DIM_KEYS:
            continue
        sql = _dim_rank_sql(
            d["key"], "team_id", "team_season",
            "season_id=?"
        )
        r = db.execute(sql, (sid, team_id)).fetchone()
        if r:
            d["rank"] = r["rk"]
            d["total"] = r["cnt"]

    return jsonify({
        "type": "team",
        "id": team_id,
        "name": ts["team_name"],
        "season_id": sid,
        "tags": [
            {"label": league_id, "color": "blue"},
            {"label": "队伍", "color": "red"},
        ],
        "top_stats": {
            "text_score": {
                "value": ts["text_score"],
                "rank": ts["r_league"],
                "total": ts["total_in_league"],
                "subtitle": "Team Power",
            },
            "season_rating": {
                "value": ts["season_rating"],
                "rank": ts["r_league"],
                "total": ts["total_in_league"],
                "subtitle": "Season Rating",
            },
        },
        "dimensions": dims,
        "raw": {
            "games": ts["games"],
            "wins": ts["wins"],
            "losses": ts["losses"],
            "win_rate": round(ts["win_rate"] or 0, 3),
            "avg_game_length": round((ts["avg_game_length"] or 0) / 60, 1),
            "avg_gspd": round(ts["avg_gspd"] or 0, 3),
            "avg_gpr": round(ts["avg_gpr"] or 0, 3),
            "avg_ckpm": round(ts["avg_ckpm"] or 0, 2),
            "avg_dragons": round(ts["avg_dragons"] or 0, 2),
            "avg_barons": round(ts["avg_barons"] or 0, 2),
            "first_blood_rate": round(ts["first_blood_rate"] or 0, 3),
            "first_tower_rate": round(ts["first_tower_rate"] or 0, 3),
        },
    })
