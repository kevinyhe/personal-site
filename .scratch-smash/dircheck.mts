import { THINKER_CHUNK_OPTIONS } from "../components/thinkerChunks.ts";
const d = THINKER_CHUNK_OPTIONS.direction;
const OLD = [-0.9279, 0.0073, 0.3727];
console.log(`flight direction now (${d.map((v) => v.toFixed(4)).join(", ")})`);
console.log(`before camera move   (${OLD.map((v) => v.toFixed(4)).join(", ")})`);
const dot = d[0]*OLD[0] + d[1]*OLD[1] + d[2]*OLD[2];
const len = Math.hypot(...d) * Math.hypot(...OLD);
console.log(`angle between: ${(Math.acos(Math.min(1, dot/len)) * 180 / Math.PI).toFixed(4)} deg`);
console.log(`impact fraction: [${THINKER_CHUNK_OPTIONS.impact.map(v=>v.toFixed(3)).join(", ")}]`);
