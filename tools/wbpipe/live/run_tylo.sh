#!/bin/bash
# usage: run_tylo.sh <url> <outdir> spec...   spec = mode_voice_set (mode warm|cold)
export RAI_BROWSER=/workspace/f807/browser/raishell/raishell
U="$1"; O="$2"; mkdir -p $O
for spec in "${@:3}"; do IFS=_ read mode v set <<< "$spec"; set=${spec#${mode}_${v}_}; name=$spec
  case $mode in warm) PRE=8000;; warm90) PRE=95000;; *) PRE=300;; esac
  NET=slow4g DPR=3.5 HOLD=8 SETTLE_MS=4000 timeout 1200 python3 probe17.py "$U" $O/$name 4 $v $PRE $set > $O/$name.log 2>&1
  python3 analyze_pout.py $O/$name >> $O/$name.log 2>&1
done
echo ALLDONE
