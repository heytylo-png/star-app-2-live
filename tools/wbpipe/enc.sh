#!/bin/bash
# step 7: usage enc.sh <n> <crf_color> <crf_alpha> [srcdir]   672x1280 band at x 0, every frame 1:1 (any length), no audio (same as wb enc.sh)
# WB_WORK redirects the default ship/ source and the enc/ output (validation runs).
W=${WB_WORK:-/workspace/bridge/wbpipe}
S=${4:-$W/ship}; mkdir -p $W/enc
ffmpeg -v error -y -framerate 24 -start_number 0 -i $S/welcome$1_%03d.png -filter_complex "[0:v]format=rgba,crop=672:1280:0:0,split[c][a];[c]scale=out_color_matrix=bt709:out_range=pc,format=yuv420p[cy];[a]alphaextract,format=gray[ay]" -map "[cy]" -map "[ay]" -c:v libaom-av1 -crf:v:0 $2 -crf:v:1 $3 -b:v 0 -cpu-used 3 -row-mt 1 -colorspace bt709 -color_primaries bt709 -color_trc iec61966-2-1 -color_range pc $W/enc/welcome$1.avif
