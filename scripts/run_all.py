"""一键全量：依次跑 01→08，任一失败即停。"""
import subprocess, sys, time
from pathlib import Path

STEPS = [
    "01_init_db.py",
    "02_import_csv.py",
    "03_build_dims.py",
    "04_aggregate_player.py",
    "05_normalize.py",
    "06_aggregate_team.py",
    "07_league_avg.py",
    "08_export_static.py",
]

def main():
    here = Path(__file__).resolve().parent
    t0 = time.time()
    for step in STEPS:
        print(f"\n>>> running {step}")
        rc = subprocess.run([sys.executable, str(here / step)]).returncode
        if rc != 0:
            print(f"!!! {step} failed (exit {rc})", file=sys.stderr)
            sys.exit(rc)
    print(f"\n=== ALL DONE in {time.time()-t0:.1f}s ===")

if __name__ == "__main__":
    main()
