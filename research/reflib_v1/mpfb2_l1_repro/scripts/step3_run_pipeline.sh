#!/usr/bin/env bash
# L1 repro step 3: run the ORIGINAL, UNMODIFIED study pipeline (scripts/run_all.sh at the exact study commit) into a fresh output dir.
# usage: step3_run_pipeline.sh <study_dir> <run_dir>      (run_dir/outputs is created; originals are never touched)
set -u
STUDY="$1"; RUN="$2"; mkdir -p "$RUN/outputs"
export MPFB2_ROOT=/workspace/research/reflib_v1/mpfb2     # approved inputs, read-only (this is also the script default)
export MPFB2_OUT="$RUN/outputs"
export PYTHONDONTWRITEBYTECODE=1
CMD="MPFB2_ROOT=$MPFB2_ROOT MPFB2_OUT=$MPFB2_OUT PYTHONDONTWRITEBYTECODE=1 bash $STUDY/scripts/run_all.sh"
echo "command: $CMD"            | tee "$RUN/command.txt"
echo "start: $(date --iso-8601=ns)" | tee -a "$RUN/command.txt"
{ time bash "$STUDY/scripts/run_all.sh" > "$RUN/run_all.stdout.txt" 2> "$RUN/run_all.stderr.txt" ; RC=$? ; } 2> "$RUN/timing.txt"
echo "end: $(date --iso-8601=ns)"   | tee -a "$RUN/command.txt"
echo "exit_status: $RC"         | tee -a "$RUN/command.txt"
( cd "$RUN/outputs" && ls -l --time-style=+%FT%T | sed 's/^/  /' ) > "$RUN/output_inventory_ls.txt"
( cd "$RUN/outputs" && sha256sum * ) > "$RUN/output_sha256.txt"
exit $RC
