#!/usr/bin/env bash
# Fetches the three Barnes maze sample clips from the take-home repo.
#
# The clips are deliberately not committed here (the brief asks submissions to
# link to the source rather than copy them in), but the timebase tests assert
# measured ground truth against the real files, so CI and any contributor
# running the full suite need them locally.
set -euo pipefail

DEST="${1:-data/barnes-maze}"
BASE_URL="https://raw.githubusercontent.com/salk-airc/rse-takehome-2026/main/data/barnes-maze"

mkdir -p "$DEST"
for clip in test50 test51 test53; do
  if [ -s "$DEST/$clip.mp4" ]; then
    echo "have $clip.mp4"
    continue
  fi
  echo "fetching $clip.mp4"
  curl -fsSL "$BASE_URL/$clip.mp4" -o "$DEST/$clip.mp4"
done

# An HTML error page or an LFS pointer would also land as a file, so check the
# bytes are actually an MP4 rather than trusting the download succeeded.
for clip in test50 test51 test53; do
  if ! head -c 12 "$DEST/$clip.mp4" | grep -q "ftyp"; then
    echo "error: $DEST/$clip.mp4 is not an MP4 (no ftyp box)" >&2
    exit 1
  fi
done
echo "sample clips ready in $DEST"
