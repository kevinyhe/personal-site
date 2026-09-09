import { goalPlacement, ballStatesAt, ballCount, ballTimelineEnd } from "../components/ballPhysics.ts";
const g = goalPlacement();
console.log("goalPlacement", g.position.map(n=>+n.toFixed(3)), "heading", (g.heading*180/Math.PI).toFixed(1), "trough", g.troughHeight.toFixed(3));
console.log("rendered GOAL_MOUTH (stage) [-3.6, -3.4]  ROBOT_GROUND_Y -1.2");
const s = ballStatesAt(ballTimelineEnd());
for (let i=0;i<ballCount();i++) if (s[i]) console.log(` ball ${i}`, s[i].position.map(n=>+n.toFixed(2)), "carried", s[i].carried);
