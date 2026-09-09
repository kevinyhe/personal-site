const d = await import("../components/robotDrift.ts");
const f = d.buildDriftPath({ wheelRadius: 0.0997 });
const F = d.DRIFT_FINISH;
const L = 1.6; // stage units per robot length
const GOAL_MOUTH = [-3.6, -3.4], GOAL_FACING = Math.PI;
// goal runs from the mouth AWAY along its facing
const inward = [Math.sin(GOAL_FACING), Math.cos(GOAL_FACING)];
const tip = [GOAL_MOUTH[0] + inward[0] * 5.7, GOAL_MOUTH[1] + inward[1] * 5.7];
console.log(`goal: mouth (${GOAL_MOUTH[0]}, ${GOAL_MOUTH[1]}) -> far end (${tip[0].toFixed(2)}, ${tip[1].toFixed(2)}) stage`);
console.log("balls (stage):", d.BALL_PICKUP_TIMES.map(p => `(${(p.position[0]*L).toFixed(2)},${(p.position[1]*L).toFixed(2)})`).join(" "));
const fx = F.position[0]*L, fz = F.position[1]*L;
const rearX = -Math.sin(F.heading), rearZ = -Math.cos(F.heading);
const rear = [fx + rearX*0.8, fz + rearZ*0.8];
console.log(`robot finishes (${fx.toFixed(2)}, ${fz.toFixed(2)}) hdg ${(Math.atan2(Math.sin(F.heading),Math.cos(F.heading))*180/Math.PI).toFixed(0)}, its rear at (${rear[0].toFixed(2)}, ${rear[1].toFixed(2)})`);
console.log("gap from robot's rear to the goal mouth:", Math.hypot(rear[0]-GOAL_MOUTH[0], rear[1]-GOAL_MOUTH[1]).toFixed(2), "stage units");
// which side of the ball line is the goal on?
const bx = d.BALL_PICKUP_TIMES.map(p=>p.position[0]*L);
console.log(`ball x spans ${Math.min(...bx).toFixed(2)}..${Math.max(...bx).toFixed(2)}; goal x ${GOAL_MOUTH[0]} -> ${GOAL_MOUTH[0] < Math.min(...bx) ? "BEYOND the balls" : "not beyond"}`);
