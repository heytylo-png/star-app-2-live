#!/usr/bin/env bash
# usage: snapshot.sh <label>  -> logs/protected_<label>.txt  (sha256, size, mtime_ns, path) of protected trees + protected_paths.txt entries
set -euo pipefail
OUT=/workspace/blendbro/out/mpfb2_l1_repro_v1/logs/protected_$1.txt
{
 find /workspace/research/reflib_v1 -type f -print0 | sort -z
 find /workspace/blendbro/out -path /workspace/blendbro/out/mpfb2_l1_repro_v1 -prune -o -type f -print0 | sort -z
 grep -v '^$' /workspace/blendbro/out/mpfb2_l1_repro_v1/repo/research/reflib_v1/mpfb2_study/scripts/protected_paths.txt | tr '\n' '\0'
} | while IFS= read -r -d '' f; do
  if [ -f "$f" ]; then printf '%s  %s  %s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$(stat -c%s "$f")" "$(stat -c%y "$f")" "$f"; else printf 'MISSING  -  -  %s\n' "$f"; fi
done > "$OUT"
wc -l "$OUT"
sha256sum "$OUT"
