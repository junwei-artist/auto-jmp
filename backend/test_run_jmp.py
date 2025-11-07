#!/usr/bin/env python3
"""
Simple CLI to test JMPRunner with a CSV and JSL on macOS.

Usage examples:
  python test_run_jmp.py \
    --folder /Users/lytech/Documents/service/auto-jmp/backend/tasks/task_20251030_145820

  python test_run_jmp.py \
    --csv /path/to/data.csv \
    --jsl /path/to/script.jsl \
    --wait 180 --delay 6
"""

import argparse
from pathlib import Path
from typing import Optional
import sys
import os

# Ensure we import from backend directory, not test directory
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from jmp_runner import JMPRunner


def find_first(path: Path, pattern: str) -> Optional[Path]:
    matches = sorted(path.glob(pattern))
    return matches[0] if matches else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Run JMPRunner test with CSV and JSL")
    parser.add_argument("--folder", type=str, default="/Users/lytech/Documents/service/auto-jmp/backend/tasks/task_20251030_145820",
                        help="Folder containing CSV and JSL (default: given task folder)")
    parser.add_argument("--csv", type=str, default=None, help="Path to CSV file (overrides --folder search)")
    parser.add_argument("--jsl", type=str, default=None, help="Path to JSL file (overrides --folder search)")
    parser.add_argument("--wait", type=int, default=120, help="Max wait time in seconds for completion (default: 120)")
    parser.add_argument("--delay", type=int, default=6, help="Delay after opening JMP before run (default: 6)")

    args = parser.parse_args()

    csv_path: Optional[Path]
    jsl_path: Optional[Path]

    if args.csv and args.jsl:
        csv_path = Path(args.csv)
        jsl_path = Path(args.jsl)
    else:
        folder = Path(args.folder)
        if not folder.exists():
            print(f"Folder not found: {folder}")
            return 2
        csv_path = find_first(folder, "*.csv")
        jsl_path = find_first(folder, "*.jsl")

    if not csv_path or not csv_path.exists():
        print(f"CSV not found. Resolved: {csv_path}")
        return 3
    if not jsl_path or not jsl_path.exists():
        print(f"JSL not found. Resolved: {jsl_path}")
        return 4

    print(f"Using CSV: {csv_path}")
    print(f"Using JSL: {jsl_path}")

    runner = JMPRunner(max_wait_time=args.wait, jmp_start_delay=args.delay)
    result = runner.run_csv_jsl(csv_path=str(csv_path), jsl_path=str(jsl_path))

    print("\n=== JMPRunner Result ===")
    for k, v in result.items():
        if isinstance(v, (list, dict)):
            print(f"{k}: {str(v)[:500]}")
        else:
            print(f"{k}: {v}")

    status = result.get("status")
    return 0 if status == "completed" else 1


if __name__ == "__main__":
    sys.exit(main())


