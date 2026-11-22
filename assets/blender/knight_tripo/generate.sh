#!/usr/bin/env bash
# Generate the source knight with the Tripo CLI (needs `tripo login` or TRIPO_API_KEY; ~110 credits).
set -euo pipefail
OUT=${1:?out dir}
TRIPO_CLIENT_APP=claude tripo make "stylized armored knight, full body, standing in a strict T-pose with arms straight out horizontally to the sides, legs slightly apart, chunky stylized proportions, steel plate armor, blue tabard, gold trim, closed great helm with a red plume, no weapon, no shield, no cape" --json --yes -o "$OUT"
