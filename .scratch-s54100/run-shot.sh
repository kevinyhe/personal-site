#!/bin/sh
cd /home/kevin/projects/arbor-web
rm -f .scratch-s54100/cam-*.png
exec timeout 1500 node .scratch-s54100/cam2.mjs "$@"
