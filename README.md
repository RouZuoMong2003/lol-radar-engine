# LoL Radar Engine

> 把 Oracle's Elixir 的 LoL 职业赛事 CSV，落库成 SQLite，经过一条多步聚合管线，
> 产出**选手 / 队伍**的赛季六维能力雷达，并用 Chart.js 在网页上渲染。

[![CI](https://github.com/RouZuoMong2003/lol-radar-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/RouZuoMong2003/lol-radar-engine/actions/workflows/ci.yml)
[![Deploy](https://github.com/RouZuoMong2003/lol-radar-engine/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/RouZuoMong2003/lol-radar-engine/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

🔗 **在线 Demo**：<https://rouzuomong2003.github.io/lol-radar-engine/>

---

## 技术栈

```
CSV ──Python ETL(01..08)──▶ SQLite(radar.db) ──┬─▶ Flask API ─▶ web/index.html (Chart.js)
                                               └─▶ 静态 JSON (web/data/) ─▶ GitHub Pages
```

- 纯本地、零外部服务依赖。
- ETL 管线只用 Python 标准库；Web/报告功能用 Flask / WeasyPrint。
- 前端同一套页面，左上角 **选手 / 队伍** 分段切换。

## 六维模型

| 维度 | 中文 | 说明 |
|------|------|------|
| Teamfight | 团战决策 | **新版重构**：参与 / 输出 / 生存 / 转化 / 节奏 |
| Laning | 线上压制 | GD@15 / CSD@15 / XPD@15 |
| Macro | 长线运营 | **新版重构**：视野 / 目标 / 经济 / 线转图 / 节奏 |
| Mechanics | 操作上限 | KDA / DPM / 输出占比 / 多杀 |
| Consistency | 心态稳定 | **新版重构**：高下限 / 中位影响 / 波动控制 / 死亡可靠 / 逆风韧性 |
| Adaptation | 版本适应 | 英雄池 / 近期版本胜率 / 新英雄 |

**重构思路**：`一级字段 → 二级指标 → 同赛季同位置经验分位归一化 → 按分路职责加权`。
三个标注「新版重构」的维度都从更多原始字段二次推导，弱化了纯 KP/胜率带来的偏差。
顶部两个评分：

- **Player Score** = 六维均值 + 最强两项上限 + 最低项下限 + 小幅胜率校正
- **Season Rating** = Player Score × 胜率结果系数 + Consistency 稳定性修正

完整公式见 [`server/metrics.py`](server/metrics.py) 与 [`docs/SPEC.md`](docs/SPEC.md)。

## 目录结构

```
lol-radar-engine/
├── README.md / LICENSE / requirements.txt
├── .github/workflows/        # CI + GitHub Pages 自动部署
├── docs/                     # SPEC / STRUCTURE / DATAFLOW + 设计 prompt
├── db/
│   ├── schema.sql            # DDL
│   └── radar.db              # 运行时数据库（gitignore，由 ETL 生成）
├── scripts/                  # ETL 管线 01..08 + run_all + _common
├── server/                   # app.py / api.py / metrics.py
├── web/                      # index.html + assets/ + data/(静态导出) + reports/
├── reports/                  # 生成的分析报告（HTML/PDF）
└── data/                     # 源 CSV 放这里（gitignore，见 data/README.md）
```

## 快速开始

```bash
# 1) 准备源 CSV（见 data/README.md），用环境变量指定最稳妥
export OE_CSV=/absolute/path/to/2026_LoL_esports_match_data_from_OraclesElixir.csv

# 2) 安装依赖（ETL 只需标准库；Web/报告需要下面这些）
pip install -r requirements.txt

# 3) 一键全量：落库 + 聚合 + 导出静态 JSON（约几秒）
python3 scripts/run_all.py

# 4a) 本地起 API + 网页
python3 server/app.py          # http://127.0.0.1:8080/

# 4b) 或直接用静态导出（web/ 可整目录托管到任意静态服务器）
```

## ETL 管线（scripts/）

| 步骤 | 作用 |
|------|------|
| `01_init_db.py` | 建表（schema.sql） |
| `02_import_csv.py` | CSV → match_rows（流式导入） |
| `03_build_dims.py` | 生成 leagues / seasons / teams / players |
| `04_aggregate_player.py` | 选手赛季聚合 + 维度原料 |
| `05_normalize.py` | 同位置归一化 + **新版三维重构** + 评分 + 排名 |
| `06_aggregate_team.py` | 队伍赛季聚合（含 GSPD/GPR 直读） |
| `07_league_avg.py` | 同赛区同位置均值（雷达橙色基线） |
| `08_export_static.py` | 导出静态 JSON 到 web/data/ |
| `run_all.py` | 依次执行 01→08 |

## 核心规则（节选自 SPEC）

1. **CSV 是唯一真源**，所有衍生数据都能一键重算。
2. **二级数据优先**：优先用 OE 已算好的衍生指标（gspd/gpr/dpm/vspm/cspm/damageshare/earnedgoldshare/wcpm…）。
3. **EGR/队伍专属直接用**：`gspd`、`gpr` 只在 `position='team'` 行，直接进队伍维度。
4. **维度端点统一 0–100**，同赛区同位置内部可比。
5. **接口字段沿用 CSV 列名**（小写、保留语义），导入导出可逆。

## 数据来源与免责声明

比赛数据来自 [Oracle's Elixir](https://oracleselixir.com/)。本项目为**非商业**的数据分析与可视化练习，
与 Oracle's Elixir、Riot Games 无隶属或背书关系。数据版权归原始来源所有。

## License

[MIT](LICENSE)
