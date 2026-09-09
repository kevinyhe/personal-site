#!/bin/bash
P=components/robotDrift.ts
cp $P /tmp/claude-1000/rd.bak
for a in 1.35 1.42 1.50 1.58; do
 for b in 1.05 1.12 1.20 1.28; do
  cp /tmp/claude-1000/rd.bak $P
  sed -i "s/yawGain: 1.6, yawTarget: [0-9.]*/yawGain: 1.6, yawTarget: $a/" $P
  sed -i "s/yawGain: 2.8, yawTarget: [0-9.]*/yawGain: 2.8, yawTarget: $b/" $P
  out=$(node --experimental-strip-types --no-warnings .scratch-s54100/drift.mts 2>/dev/null | tail -3)
  rot=$(echo "$out" | grep "total rotation" | grep -o '\-\?[0-9]*' | head -1)
  err=$(echo "$out" | grep "final heading err" | sed 's/.*: //')
  spd=$(echo "$out" | grep "final speed" | awk '{print $3}')
  echo "yaw1=$a yaw2=$b  rot=${rot}deg  err=$err  finalspeed=$spd"
 done
done
cp /tmp/claude-1000/rd.bak $P
