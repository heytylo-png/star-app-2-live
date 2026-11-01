#!/usr/bin/env bash
# L1 repro step 2: record environment, interpreter/library versions, script SHA-256s. Read-only.
# usage: step2_capture_env.sh <study_dir>
S="$1"
echo "date_local: $(date --iso-8601=seconds)"; echo "tz: $(date +%Z)"
echo "uname: $(uname -a)"; grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release
echo "python3: $(python3 --version 2>&1) at $(command -v python3)"
python3 - <<'PY'
import sys, platform, importlib
print("python_full:", sys.version.replace("\n", " "))
print("platform:", platform.platform(), platform.machine())
import numpy; print("numpy:", numpy.__version__)
try:
    numpy.show_config(mode="dicts") if False else None
except Exception: pass
for m in ("scipy", "pandas"):
    try: print(m + ":", importlib.import_module(m).__version__, "(installed; NOT imported by study scripts unless listed below)")
    except Exception as e: print(m + ": not installed")
PY
echo "bash: $(bash --version | head -1)"; echo "git: $(git --version)"; echo "sha256sum: $(sha256sum --version | head -1)"
echo "LANG=${LANG:-} LC_ALL=${LC_ALL:-} PYTHONHASHSEED=${PYTHONHASHSEED:-<unset>}"
echo "--- imports used by study scripts (grep) ---"; grep -h -E '^\s*(import|from) ' "$S"/scripts/*.py | sed 's/^\s*//' | sort | uniq -c | sort -rn
echo "--- study script SHA-256 ---"; (cd "$S" && sha256sum scripts/* )
