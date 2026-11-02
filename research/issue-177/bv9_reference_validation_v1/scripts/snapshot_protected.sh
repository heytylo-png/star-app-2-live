#!/usr/bin/env bash
# usage: snapshot_protected.sh <label>  -> logs/protected_<label>.txt  (sha256  size  path), sorted by path. Read-only.
set -euo pipefail
OUT=/workspace/blendbro/out/bv9_reference_validation_v1/logs/protected_$1.txt
{
 find /workspace/blender/star_rai -type f
 find /workspace/artifacts/spine_requests /workspace/blendbro/references /workspace/research/reflib_v1 /workspace/notes /workspace/star-rai-canon-refs -type f
 find /workspace/blendbro/out -path /workspace/blendbro/out/bv9_reference_validation_v1 -prune -o -type f -print
 awk '{ $1=""; sub(/^ +/,""); print }' /workspace/notes/issue178_asset_compat_20261031/input_hash_manifest.sha256
 awk '{ $1=""; sub(/^ +/,""); print }' /workspace/notes/issue178_asset_compat_20261031/protected_hashes_before.txt
} | sort -u | while IFS= read -r f; do [ -f "$f" ] && printf '%s\0' "$f"; done | xargs -0 -P8 -n 20 sha256sum | sort -k2 > "$OUT.tmp"
# add size
while read -r h p; do printf '%s  %s  %s\n' "$h" "$(stat -c%s "$p")" "$p"; done < <(sed 's/^\([0-9a-f]\{64\}\)  /\1 /' "$OUT.tmp") > "$OUT"
rm -f "$OUT.tmp"
wc -l "$OUT"; sha256sum "$OUT"
