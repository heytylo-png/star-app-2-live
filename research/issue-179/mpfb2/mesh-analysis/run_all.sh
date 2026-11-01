#!/usr/bin/env bash
# Reproduce: ./run_all.sh <path-to-mpfb2-root> [outdir]
# <root> must contain LICENSE*.md and src/mpfb/data/{3dobjs,rigs}/... (the 10 approved files, commit 6ff1eb35...).
# Read-only on <root>; writes only to outdir. Needs python3 + numpy.
set -euo pipefail
ROOT="${1:?mpfb2 root}"; OUT="${2:-$(pwd)}"
( cd "$ROOT" && sha256sum LICENSE.ASSETS.md LICENSE.md src/mpfb/data/3dobjs/base.obj src/mpfb/data/rigs/*/*.json ) > "$OUT/hashes_before.txt"
python3 "$(dirname "$0")/mpfb2_analysis.py" "$ROOT" "$OUT"
python3 "$(dirname "$0")/mpfb2_supplement.py" "$ROOT" "$OUT"
python3 "$(dirname "$0")/extra_check.py" "$ROOT" "$OUT" >/dev/null
( cd "$ROOT" && sha256sum LICENSE.ASSETS.md LICENSE.md src/mpfb/data/3dobjs/base.obj src/mpfb/data/rigs/*/*.json ) > "$OUT/hashes_after.txt"
cmp "$OUT/hashes_before.txt" "$OUT/hashes_after.txt" && echo "INPUT HASHES UNCHANGED"
