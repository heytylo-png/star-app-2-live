#!/usr/bin/env bash
# Reproduces every output in ../outputs.  Read-only on inputs. Needs python3 + numpy only (no downloads/installs).
# Inputs: MPFB2_ROOT (default /workspace/research/reflib_v1/mpfb2) containing src/mpfb/data/... and MANIFEST_sha256_blobsha1.txt
# 06 additionally reads Star Rai v8.3/v10 rig JSONs from /workspace/artifacts/spine_requests (located by sha256; read-only).
set -euo pipefail
cd "$(dirname "$0")"
export MPFB2_OUT="${MPFB2_OUT:-$(cd .. && pwd)/outputs}"
mkdir -p "$MPFB2_OUT"
python3 00_verify_hashes.py before
for s in 02_joints_hierarchy 03_coordinates_foot 04_weights_stats 05_weight_falloff 06_compare_star_rai 07_rig_differences; do
  echo "== $s"; python3 $s.py > "$MPFB2_OUT/log_$s.txt" 2>&1 || { echo "FAILED $s"; tail -20 "$MPFB2_OUT/log_$s.txt"; exit 1; }
done
python3 00_verify_hashes.py after
