#!/usr/bin/env bash
# Alternates the baseline and candidate builds, one round at a time, so both
# see the same machine load. Build each first and keep it as .next-before and
# .next-after (see scripts/compare-tablet.mjs).
#   ROUNDS=3 bash scripts/ab-tablet.sh
set -u
rounds=${ROUNDS:-3}
for round in $(seq 1 "$rounds"); do
  for build in before after; do
    rm -rf .next && mv ".next-$build" .next
    TABLET=1 LABEL="${PREFIX:-ab}-$build-hw-r$round" GPUS=hardware CPU=4 SECONDS=20 node scripts/measure-playability.mjs >> "artifacts/playability/ab-$build.log" 2>&1
    [ "${SOFTWARE:-1}" = 1 ] && TABLET=1 LABEL="${PREFIX:-ab}-$build-sw-r$round" GPUS=software TABLETS=1024x768,1366x768 SECONDS=20 node scripts/measure-playability.mjs >> "artifacts/playability/ab-$build.log" 2>&1
    mv .next ".next-$build"
    echo "round $round $build done"
  done
done
