#!/bin/bash
set -e
for pair in "0.5:0.30" "0.5:0.24" "0.6:0.26" "0.45:0.22" "0.55:0.24"; do
  run="${pair%%:*}"; dur="${pair##*:}"
  sed -i -E "s/const GLIDE_RUN = [0-9.]+;/const GLIDE_RUN = ${run};/; s/const GLIDE_DURATION = [0-9.]+;/const GLIDE_DURATION = ${dur};/" components/ballPhysics.ts
  printf "RUN=%s DUR=%s  " "$run" "$dur"
  node --experimental-strip-types --no-warnings --import ./.scratch-s54100/hook.mjs .scratch-s54100/glide.mts 2>&1 | tail -2 | tr '\n' ' '
  echo
done
