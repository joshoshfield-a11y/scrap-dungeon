#!/bin/bash
# SCRAP DUNGEON beta-tester suite — one command, full run.
# Uses the ML venv's Playwright (Chromium already downloaded there);
# falls back to system python3 if the venv is missing.
set -e
cd "$(dirname "$0")"
if [ -x "$HOME/workspace/venvs/ml-stack/bin/python" ]; then
  PY="$HOME/workspace/venvs/ml-stack/bin/python"
else
  PY="python3"
fi
exec "$PY" run_all.py "$@"
