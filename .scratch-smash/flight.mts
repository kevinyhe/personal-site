import * as THREE from "three";
const YAW = Math.PI / 3;
const inFig = (v: THREE.Vector3) =>
  v.clone().normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -YAW);

const OLD_CAM = new THREE.Vector3(0.42, 0.3, 1).normalize();
const OLD_DRIFT = new THREE.Vector3(-0.5, -0.26, 0);
const oldSum = OLD_CAM.clone().add(OLD_DRIFT);
const oldDir = inFig(oldSum);
console.log(`old camera offset  (${OLD_CAM.toArray().map(v=>v.toFixed(3)).join(", ")})`);
console.log(`old flight (figure)(${oldDir.toArray().map(v=>v.toFixed(4)).join(", ")})`);

// Camera pushed right. Solve the drift that keeps the flight sum identical.
for (const x of [0.75, 0.85, 0.95]) {
  const cam = new THREE.Vector3(x, 0.3, 1).normalize();
  const drift = oldSum.clone().sub(cam);
  const dir = inFig(cam.clone().add(drift));
  const deg = THREE.MathUtils.radToDeg(dir.angleTo(oldDir));
  console.log(`\ncamera x=${x}: offset (${cam.toArray().map(v=>v.toFixed(3)).join(", ")})`);
  console.log(`  compensating drift (${drift.toArray().map(v=>v.toFixed(3)).join(", ")})`);
  console.log(`  flight (figure)   (${dir.toArray().map(v=>v.toFixed(4)).join(", ")})  off by ${deg.toFixed(4)} deg`);
}
