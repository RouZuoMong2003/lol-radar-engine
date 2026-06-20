# LoL Radar Engine

把 Oracle's Elixir 全年职业赛事 CSV（46MB / 165 列 / 70k 行）落库成 SQLite，
经过 8 步聚合管线产出选手与队伍的赛季快照，前端用 Chart.js 渲染雷达图，
左上角可在 **选手 / 队伍** 之间切换。

## 一句话技术栈

```
CSV ──Python ETL──▶ SQLite(radar.db) ──Flask API──▶ index.html(Chart.js)
```

- 全部本地、零外部服务；`projects/lol-radar` 静态原型保留作设计参照。
- Python 3.12 + Flask 3.1（已装），Node 22（仅备用，不强依赖）。

## 目录结构（见 docs/STRUCTURE.md）

```
lol-radar-engine/
├── README.md                项目入口
├── docs/
│   ├── SPEC.md              工程契约（数据标准 + 接口契约 + 维度公式）
│   ├── STRUCTURE.md         目录与文件清单
│   └── DATAFLOW.md          8 步管线 + 字段血缘
├── db/
│   ├── schema.sql           DDL：8 张表
│   └── radar.db             运行时数据库（gitignore）
├── scripts/                 ETL 脚本（命令行可独立跑）
│   ├── 01_init_db.py
│   ├── 02_import_csv.py
│   ├── 03_build_dims.py
│   ├── 04_aggregate_player.py
│   ├── 05_normalize.py
│   ├── 06_aggregate_team.py
│   ├── 07_league_avg.py
│   └── run_all.py           一键全量
├── server/
│   ├── app.py               Flask 入口
│   ├── api.py               REST 接口
│   └── metrics.py           6 维度公式（被 04/06 复用）
├── web/
│   ├── index.html           主页面（左上角 选手/队伍 切换）
│   └── assets/              抽出的 CSS/JS
└── data/
    └── (CSV 不在此处，统一从 /workspace/data/ 读)
```

## 一键跑通

```bash
cd /workspace/projects/lol-radar-engine
python3 scripts/run_all.py        # 落库 + 聚合（约 2 分钟）
python3 server/app.py             # 启动 API（默认 8080）
# 浏览器打开 http://127.0.0.1:8080/  即可看到雷达图
```

## 核心规则（节选自 SPEC）

1. **CSV 是唯一真源**：所有衍生数据都能由它一键重算，不存手工修改。
2. **二级数据优先**：6 维度计算优先使用 OE 已经算好的衍生指标
   （`gspd / gpr / dpm / vspm / cspm / damageshare / earnedgoldshare / kpm / wcpm`），
   只对必须的指标做二次推导。
3. **EGR/队伍专属直接用**：`gspd`、`gpr` 等只存在于 `position='team'` 行的字段，
   直接进入队伍维度，不再二次计算。
4. **同位置 z-score**：所有维度最终输出 0–100 整数，60 = 同位置同赛区均值。
5. **接口契约即 CSV 列名**：API 返回的字段命名沿用 CSV 列名（小写、保留语义），
   导入和导出可逆。

详见 `docs/SPEC.md`。
