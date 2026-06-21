"""一键全量：依次执行 01→08，任一失败即停。

改进：直接 import 各步骤的 main()，共享进程，更快。
保留 subprocess 模式作为 fallback（用 --subprocess 参数触发）。
"""
import sys
import time
import importlib
from pathlib import Path

HERE = Path(__file__).resolve().parent

# 确保 server/ 在 sys.path 中（供 metrics 导入）
SERVER_DIR = str(HERE.parent / "server")
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

STEPS = [
    "01_init_db",
    "02_import_csv",
    "03_build_dims",
    "04_aggregate_player",
    "05_normalize",
    "06_aggregate_team",
    "07_league_avg",
    "08_export_static",
]


def run_inline():
    """直接 import + 调用 main()，共享进程、更快。"""
    # 确保 scripts/ 目录在 sys.path 中
    scripts_dir = str(HERE)
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)

    t0 = time.time()
    for step in STEPS:
        print(f"\n>>> running {step}")
        try:
            mod = importlib.import_module(step)
            mod.main()
        except Exception as e:
            print(f"!!! {step} failed: {e}", file=sys.stderr)
            sys.exit(1)
    print(f"\n=== ALL DONE in {time.time() - t0:.1f}s ===")


def run_subprocess():
    """子进程模式（旧版兼容）。"""
    import subprocess
    t0 = time.time()
    for step in STEPS:
        print(f"\n>>> running {step}.py")
        rc = subprocess.run([sys.executable, str(HERE / f"{step}.py")]).returncode
        if rc != 0:
            print(f"!!! {step} failed (exit {rc})", file=sys.stderr)
            sys.exit(rc)
    print(f"\n=== ALL DONE in {time.time() - t0:.1f}s ===")


def main():
    if "--subprocess" in sys.argv:
        run_subprocess()
    else:
        run_inline()


if __name__ == "__main__":
    main()
