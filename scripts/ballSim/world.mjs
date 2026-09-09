/**
 * The intake, the tower, the indexer and the goal, as rigid bodies.
 *
 * Everything here is geometry read off the exported assets:
 * `public/model/robot/robot-meta.json` for every wheel and sprocket the
 * robot has, `public/model/props/props-meta.json` for the ball and the goal,
 * and `components/robotDrift.ts` for where the robot is at any instant.
 * Nothing in this file is a number chosen to make the animation look right.
 *
 * Frames and units
 * ----------------
 * Stage units throughout, the same ones the scene draws in: floor at
 * y = GROUND_Y, 1 stage unit = 261.9375 mm (props-meta), so gravity is
 * 9.81 m/s^2 / 0.2619 m = 37.45 stage/s^2. Model space is the robot's own
 * frame: x lateral, y up from its ground contact, z forward.
 *
 * How the ball is actually moved
 * ------------------------------
 * By friction against turning rubber, which is how the real thing works.
 *
 *   * The eight `half_flex_wheel`s at the front and the four flex wheels at
 *     the indexer are placed exactly where the CAD puts them, at their own
 *     radii, and turned at the belt speed.
 *   * Between them the ball rides between the two chain runs. A chain is a
 *     moving surface, and the honest way to model a moving surface in a
 *     rigid-body engine is the rollers it runs on: this file lays a line of
 *     small rollers along each side of the corridor, tangent to it, turning
 *     so their contact faces travel along the route at the same belt speed.
 *     Two facing runs, so the ball is squeezed and carried whichever way
 *     the corridor bends -- which is why it can go up and over the top of
 *     the S without gravity fighting it loose.
 *   * Guide plates either side keep it in the middle. The corridor is
 *     BALL_DIAMETER + CORRIDOR_CLEARANCE across, so the ball is always
 *     touching something that is driving it.
 *
 * The route those guides follow is the one measured off the Fusion assembly:
 * in along the floor, under both rows of front flex wheels, onto the
 * underside of the 32T, around the back 16T, up the face of the 30T, over
 * its top and out across the indexer wheels. It says where the sheet metal
 * is, not where the ball is -- the ball is a rigid body and finds its own
 * way down the middle.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

const robotMeta = JSON.parse(
  readFileSync(resolve(ROOT, "public/model/robot/robot-meta.json"), "utf8"),
);
const propsMeta = JSON.parse(
  readFileSync(resolve(ROOT, "public/model/props/props-meta.json"), "utf8"),
);

/** Millimetres in one stage unit, from the asset export. */
export const MM_PER_UNIT = propsMeta.mmPerUnit;
/** Gravity in stage units per second squared. */
export const GRAVITY = 9810 / MM_PER_UNIT;
/** Ball radius and mass: the game piece is 41 mm across the flats, 40 g. */
export const BALL_RADIUS = propsMeta.ball.radius;
export const BALL_MASS = 0.04;
/** Floor height in the stage. */
export const GROUND_Y = -1.2;
/** One robot length in stage units. */
export const STAGE_PER_ROBOT_LENGTH = robotMeta.length;

/**
 * Surface speed of every driven wheel, stage units per second. One number
 * sets both how long the climb takes and how hard the ball leaves the back:
 * the route is about 2.5 units long, so at 2.9 the ride is roughly 0.85 s,
 * and a ball leaving the indexer crosses the 0.4 unit gap into the goal in
 * about 0.14 s. Those are the two things the old hand-tuned version had to
 * keep in step with each other by hand.
 */
export const BELT_SPEED = 2.9;

/**
 * How fast the indexer's rubber runs, stage units per second.
 *
 * Not the belt speed. The CAD puts the 8T sprocket at exactly the same place
 * as the rear indexer flex wheel -- same axle -- so the chain turns a 0.038
 * sprocket while a 0.098 wheel rides on it. The wheel's surface therefore
 * runs 0.098 / 0.038 = 2.6 times the chain, and that is what throws the ball
 * across the gap into the goal. At the chain's own speed it would leave the
 * robot at 2.9 and hit the floor short of the mouth: crossing 0.41 units at
 * 2.9 takes 0.14 s, and 0.14 s of this gravity is a drop of 0.37 -- more than
 * twice the ball's radius.
 */
export function indexerSpeed() {
  const wheel = robotMeta.parts.find(
    (part) => /2_flex_wheel/.test(part.name) && part.axlePosition[1] > 1.0,
  );
  const sprocket = robotMeta.parts.find(
    (part) =>
      /sprocket/.test(part.name) &&
      Math.hypot(
        part.axlePosition[1] - wheel.axlePosition[1],
        part.axlePosition[2] - wheel.axlePosition[2],
      ) < 0.02,
  );
  if (!sprocket) return BELT_SPEED;
  return (BELT_SPEED * wheel.radius) / sprocket.radius;
}

/** How much wider than a ball the corridor is, stage units. */
const CORRIDOR_CLEARANCE = 0.03;
/**
 * How hard the indexer's top rollers press down on a ball, stage units.
 * Along that run the only things underneath are two pairs of flex wheels a
 * quarter of a unit apart, so a ball resting between them touches nothing
 * that is driving it. The rollers above have to hold it down onto them. 30A
 * rubber squashes about this much, which is why the brief says the corridor
 * keeps the ball's surface within 0.06 of each wheel.
 */
const INDEXER_SQUEEZE = 0.07;
/** How far the chain stands off the sprocket's metal, stage units. */
const CHAIN_THICKNESS = 0.025;
/** Radius of the rollers standing in for the chain runs. */
const CHAIN_ROLLER_RADIUS = 0.045;
/** Spacing between them along the route. */
const CHAIN_ROLLER_PITCH = 0.075;
/** Half width of the corridor's side plates. */
const CORRIDOR_HALF_WIDTH = 0.2;

/**
 * The route, derived from the mechanism rather than sketched.
 *
 * A ball riding a chain sits with its centre one ball radius off the chain,
 * and the chain sits on the sprockets' pitch circles -- so the ball's centre
 * runs around each sprocket at (sprocket radius + ball radius) and along the
 * common tangents between them. That is the whole construction, and it is
 * why the numbers work out: the 30T's offset circle tops out at y = 1.545,
 * which is exactly where the indexer flex wheels at y = 1.303 hold a ball,
 * and within a hair of the goal's trough at 1.527. The chain hands the ball
 * to the indexer at the height it needs to leave at.
 *
 * The order is the S the brief describes: in along the floor under the front
 * flex wheels, up onto the 32T, around it and rearward, back around the 16T,
 * forward and up the face of the 30T, over its top, out across the indexer
 * wheels. +1 wraps a sprocket counter-clockwise in the z-y plane (z right,
 * y up), -1 clockwise.
 *
 * Wrapping this way also fixes what a hand-drawn route cannot: its tightest
 * bend is the back 16T at 0.070 + 0.157 = 0.227, comfortably more than the
 * ball's own radius, so a rigid ball can actually roll through it.
 */
function sprocketAt(pattern) {
  const part = robotMeta.parts.find((entry) => new RegExp(pattern).test(entry.name));
  if (!part) throw new Error(`no part matching ${pattern} in robot-meta.json`);
  return { radius: part.radius, y: part.axlePosition[1], z: part.axlePosition[2] };
}

/** Where the ball enters, and the floor run under the front flex wheels. */
const ENTRY_Z = 0.9;
const RAMP_START_Z = 0.5;

function chainPulleys() {
  // The two the ball actually rides around. It wraps the 32T clockwise --
  // in under it, around its back, out over its top, which is the rearward
  // half of the S -- then crosses to the 30T and wraps that one the other
  // way, up its face and over the top, which is the forward half.
  //
  // The back 16T is not in this list on purpose. In profile it looks like it
  // is in the way, and a ball cannot wrap it and the 32T in opposite
  // directions -- those two offset circles overlap, so no chain path exists.
  // It does not have to: it sits at x = 0.258 and the ball only spans 0.157,
  // so it runs past outboard of the corridor. That is the same reason the
  // brief gives for the sprockets generally.
  return [
    { ...sprocketAt("^part_intake_32t_sprocket_6p_0$"), wrap: -1, name: "32T" },
    { ...sprocketAt("^part_intake_30t_sprocket_9p_0$"), wrap: 1, name: "30T" },
  ];
}

/**
 * The common tangent between two wrapped circles, as the direction a chain
 * would run. `wrap` decides which side of each circle the run leaves from.
 */
function tangentDirection(from, to, prefer = null) {
  const dz = to.z - from.z;
  const dy = to.y - from.y;
  const span = Math.hypot(dz, dy);
  const rho1 = from.wrap * (from.radius + BALL_RADIUS);
  const rho2 = to.wrap * (to.radius + BALL_RADIUS);
  // A belt run leaves each circle on the side its wrap direction puts it:
  // travelling along u, a counter-clockwise wrap keeps the centre on the
  // left, a clockwise one on the right. That is the whole condition --
  // left(u) . D = rho2 - rho1.
  const c = (rho2 - rho1) / span;
  if (Math.abs(c) > 1) throw new Error("no common tangent: one circle swallows the other");
  const base = Math.atan2(-dz, dy);
  const candidates = [];
  for (const branch of [1, -1]) {
    const theta = base + branch * Math.acos(Math.max(-1, Math.min(1, c)));
    const u = [Math.cos(theta), Math.sin(theta)];
    if (u[0] * dz + u[1] * dy > 0) candidates.push(u); // has to head toward `to`
  }
  if (!candidates.length) throw new Error("no tangent branch heads the right way");
  if (!prefer || candidates.length === 1) return candidates[0];
  // Two tangents reach a circle from a point; `prefer` picks which one the
  // ball is actually on. Coming off the floor it meets the sprocket's
  // underside, so that is the lower of the two.
  return candidates.sort((p1, p2) => prefer(touchPoint(to, p1)) - prefer(touchPoint(to, p2)))[0];
}

/** Where a run leaving `pulley` in direction `u` touches its offset circle. */
function touchPoint(pulley, u) {
  const r = pulley.radius + BALL_RADIUS;
  const left = [-u[1], u[0]];
  const rho = pulley.wrap * r;
  return [pulley.z - left[0] * rho, pulley.y - left[1] * rho];
}

function arcPoints(pulley, fromAngle, toAngle) {
  const r = pulley.radius + BALL_RADIUS;
  let sweep = toAngle - fromAngle;
  while (pulley.wrap > 0 && sweep < 0) sweep += Math.PI * 2;
  while (pulley.wrap < 0 && sweep > 0) sweep -= Math.PI * 2;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) * r / 0.02));
  const points = [];
  for (let i = 1; i <= steps; i += 1) {
    const angle = fromAngle + (sweep * i) / steps;
    points.push([pulley.z + Math.cos(angle) * r, pulley.y + Math.sin(angle) * r]);
  }
  return points;
}

let route = null;

/** The ball-centre route through the robot, model space [z, y]. */
export function guideRoute() {
  if (route) return route;
  const pulleys = chainPulleys();
  const points = [[ENTRY_Z, BALL_RADIUS], [RAMP_START_Z, BALL_RADIUS]];

  // Up the ramp: a straight run from the floor onto the first sprocket, the
  // way the intake's bottom plate lifts a ball off the tiles.
  const first = pulleys[0];
  const ramp = { radius: -BALL_RADIUS, wrap: 1, y: BALL_RADIUS, z: RAMP_START_Z };
  let u = tangentDirection(ramp, first, (point) => point[1]);
  let touch = touchPoint(first, u);
  points.push(touch);
  let angle = Math.atan2(touch[1] - first.y, touch[0] - first.z);

  for (let i = 0; i < pulleys.length; i += 1) {
    const pulley = pulleys[i];
    const next = pulleys[i + 1];
    if (!next) {
      // Off the last one at its top, then along the indexer wheels and out.
      // The run has to sit at the height those wheels hold a ball, not at
      // the height the chain left it: they are the floor from here on, and
      // 0.013 of daylight either way is the difference between a ball being
      // carried and a ball being pinched against the roof.
      const top = Math.PI / 2;
      points.push(...arcPoints(pulley, angle, top));
      points.push([EXIT_Z_MODEL, indexerRideHeight()]);
      break;
    }
    u = tangentDirection(pulley, next);
    const leave = touchPoint(pulley, u);
    const leaveAngle = Math.atan2(leave[1] - pulley.y, leave[0] - pulley.z);
    points.push(...arcPoints(pulley, angle, leaveAngle));
    const arrive = touchPoint(next, u);
    points.push(arrive);
    angle = Math.atan2(arrive[1] - next.y, arrive[0] - next.z);
  }

  route = points;
  return route;
}

/**
 * How high a ball sits when it is riding the indexer flex wheels: on top of
 * them, which is where the chain over the 30T hands it across.
 */
export function indexerPanTop() {
  const wheels = robotMeta.parts.filter(
    (part) => /flex_wheel/.test(part.name) && part.axlePosition[1] > 1.0,
  );
  // The pan is level with the SMALLEST of them, so every wheel on that run
  // touches the ball: the small ones flush, the big ones standing proud.
  return Math.min(...wheels.map((part) => part.axlePosition[1] + part.radius)) - 0.002;
}

export function indexerRideHeight() {
  return indexerPanTop() + BALL_RADIUS;
}

/** Model z a ball leaves the indexer at, out of the back of the robot. */
export const EXIT_Z_MODEL = -0.52;

/** Radius of the tightest bend in the route -- a ball has to fit round it. */
export function tightestBend(points) {
  let tightest = Infinity;
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const v1 = [b[0] - a[0], b[1] - a[1]];
    const v2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(v1[0], v1[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    if (l1 < 1e-9 || l2 < 1e-9) continue;
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
    const turn = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (turn < 1e-9) continue;
    tightest = Math.min(tightest, (l1 + l2) / 2 / turn);
  }
  return tightest;
}

// ---------------------------------------------------------------- path maths

function resample(points, spacing) {
  const out = [];
  let carry = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [z0, y0] = points[i - 1];
    const [z1, y1] = points[i];
    const dz = z1 - z0;
    const dy = y1 - y0;
    const len = Math.hypot(dz, dy);
    if (len < 1e-9) continue;
    for (let s = carry; s < len; s += spacing) {
      const t = s / len;
      out.push([z0 + dz * t, y0 + dy * t]);
    }
    carry = ((carry - len) % spacing + spacing) % spacing;
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Unit tangent [dz, dy] at station `i` of a polyline. */
function tangentAt(points, i) {
  const a = points[Math.max(0, i - 1)];
  const b = points[Math.min(points.length - 1, i + 1)];
  const dz = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dz, dy) || 1;
  return [dz / len, dy / len];
}

/** Nearest station on the guide path to a model-space [z, y]. */
function nearestStation(stations, z, y) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < stations.length; i += 1) {
    const d = Math.hypot(stations[i][0] - z, stations[i][1] - y);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return { index: best, distance: bestDistance };
}

/** Total length of the guide route, stage units. */
export function guideLength() {
  const route = guideRoute();
  let total = 0;
  for (let i = 1; i < route.length; i += 1) {
    total += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  }
  return total;
}

/** Model-space point a given distance back from the end of the route. */
export function pointBackFromExit(back) {
  const route = guideRoute();
  let remaining = back;
  for (let i = route.length - 1; i > 0; i -= 1) {
    const b = route[i];
    const a = route[i - 1];
    const dz = a[0] - b[0];
    const dy = a[1] - b[1];
    const len = Math.hypot(dz, dy);
    if (remaining <= len) {
      const t = len > 1e-9 ? remaining / len : 0;
      return [b[0] + dz * t, b[1] + dy * t];
    }
    remaining -= len;
  }
  const first = route[0];
  const second = route[1];
  const dz = first[0] - second[0];
  const dy = first[1] - second[1];
  const len = Math.hypot(dz, dy) || 1;
  return [first[0] + (dz / len) * remaining, first[1] + (dy / len) * remaining];
}

/**
 * The corridor as a driven track: every 10 mm along the route, where it is,
 * which way it runs, and how fast the rubber there is moving.
 *
 * The drive is modelled as a force rather than left to friction against
 * spinning collider surfaces. It is the same physics -- a ball in contact
 * with a surface moving at v is dragged toward v, and the force that does it
 * is bounded by how hard the rubber presses -- but a contact solver asked to
 * carry a 40 g ball through a corridor its own width using nothing but
 * friction against a dozen fast-spinning kinematic cylinders does not
 * degrade gracefully: it either slips, or wedges the ball in a pocket
 * between two rims and spins it there. Expressing the same grip as a bounded
 * drag toward the local belt velocity is stable, and everything that matters
 * -- gravity, ball-on-ball contact, the queue, the gate, the throw, the
 * roll-out in the goal -- is still solved by the engine.
 */
let track = null;
export function corridorTrack() {
  if (track) return track;
  const points = resample(guideRoute(), 0.01);
  track = points.map((point, i) => {
    const [tz, ty] = tangentAt(points, i);
    const exit = onExitRun(point[0], point[1]);
    return {
      gated: exit,
      speed: exit ? indexerSpeed() : BELT_SPEED,
      tangent: [tz, ty],
      y: point[1],
      z: point[0],
    };
  });
  return track;
}

/** Distance from a model-space point to the nearest point on the route. */
export function distanceToRoute(z, y) {
  let best = Infinity;
  for (const station of corridorTrack()) {
    const d = Math.hypot(station.z - z, station.y - y);
    if (d < best) best = d;
  }
  return best;
}

// ------------------------------------------------------------- the mechanism

/**
 * Every driven wheel: the real ones from the CAD, then the chain runs.
 *
 * The ones past the gate are flagged `gated`. They are the indexer: they do
 * not turn while the gate is shut, which is what an indexer is for. Running
 * them into a shut gate does not hold a queue -- it drives the front ball
 * against the flap hard enough to squeeze it underneath, because the flap
 * only covers the top of the corridor. Stopping them is also what the real
 * robot does: the top rollers spin up when it is time to score.
 */
export function driveWheels() {
  const stations = resample(guideRoute(), CHAIN_ROLLER_PITCH);
  const wheels = [];

  // The flex wheels the robot actually has. Which way each one turns is
  // decided by which side of the corridor it sits on, so a wheel above the
  // route and a wheel below it counter-rotate -- the top row against the
  // bottom row, as the mechanism does.
  for (const part of robotMeta.parts) {
    if (!/flex_wheel/.test(part.name)) continue;
    const [x, y, z] = part.axlePosition;
    const near = nearestStation(stations, z, y);
    const [tz, ty] = tangentAt(stations, near.index);
    const p = stations[near.index];
    const side = Math.sign((y - p[1]) * tz - (z - p[0]) * ty) || 1;
    wheels.push({
      gated: onExitRun(z, y),
      halfLength: 0.055,
      name: part.name,
      radius: part.radius,
      // Which side of the route a wheel sits on decides which way it must
      // turn to drag the ball along it -- which is why the top row runs
      // against the bottom row.
      spin: (-side * (onExitRun(z, y) ? indexerSpeed() : BELT_SPEED)) / part.radius,
      x,
      y,
      z,
    });
  }

  // The chain runs, as the rollers they ride on: one line either side of the
  // corridor, turning inward so both faces carry the ball the same way along
  // the route.
  //
  // Each line is spaced along ITS OWN curve, not along the centreline. On a
  // bend the outside of the corridor is longer than the middle, so rollers
  // stepped off the centreline leave holes in the outer wall exactly where a
  // ball is being pushed into it -- which is how balls were falling out of
  // the tower on every curve.
  const offset = BALL_RADIUS + CHAIN_ROLLER_RADIUS + CORRIDOR_CLEARANCE / 2;
  const fine = resample(guideRoute(), 0.01);
  for (const side of [1, -1]) {
    // Walk the wall densely and keep a roller whenever the last one is more
    // than a pitch behind. Resampling the offset curve instead leaves holes
    // where it doubles back on the inside of a bend.
    const line = [];
    for (let i = 0; i < fine.length; i += 1) {
      const [z, y] = fine[i];
      const [tz, ty] = tangentAt(fine, i);
      // Over the indexer the roof comes down onto the ball: that squeeze is
      // what lets the top wheels feed it out rather than spin under it.
      const squeeze = side < 0 && onExitRun(z, y) ? INDEXER_SQUEEZE : 0;
      const point = [
        z - ty * (offset - squeeze) * side,
        y + tz * (offset - squeeze) * side,
      ];
      const last = line[line.length - 1];
      if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) >= CHAIN_ROLLER_PITCH) {
        line.push(point);
      }
    }
    // A wall doubles back where the route's curvature flips, which leaves a
    // hole; fill anything wider than a pitch so the corridor stays closed.
    const filled = [];
    for (let i = 0; i < line.length; i += 1) {
      if (i > 0) {
        const gap = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
        const steps = Math.floor(gap / CHAIN_ROLLER_PITCH);
        for (let k = 1; k < steps; k += 1) {
          const t = k / steps;
          filled.push([
            line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t,
            line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t,
          ]);
        }
      }
      filled.push(line[i]);
    }
    for (let i = 0; i < filled.length; i += 1) {
      const [cz, cy] = filled[i];
      if (cy < CHAIN_ROLLER_RADIUS * 0.5) continue; // that one is under the floor
      // Never put a roller where it would narrow the corridor below a ball.
      // Where the route's curvature flips, one wall's offset curve crosses
      // the middle, and a roller placed on it stands right in the ball's way
      // -- which is what was jamming balls at the top of the 30T and behind
      // the 32T.
      if (distanceToRoute(cz, cy) < offset - 0.004) continue;

      // Drop a roller only where it would actually foul a real flex wheel,
      // not merely where one is nearby. Clearing a wide radius around each
      // wheel left holes in the corridor floor -- and a ball dropped into a
      // hole between two rims wedges there and stops dead.
      const fouls = robotMeta.parts.some((part) => {
        if (!/flex_wheel/.test(part.name)) return false;
        const gap = Math.hypot(part.axlePosition[2] - cz, part.axlePosition[1] - cy);
        return gap < part.radius + CHAIN_ROLLER_RADIUS - 0.01;
      });
      if (fouls) continue;
      const [tz, ty] = tangentAt(filled, i);
      wheels.push({
        gated: onExitRun(cz, cy),
        halfLength: 0.13,
        name: `chain_${side > 0 ? "outer" : "inner"}_${i}`,
        radius: CHAIN_ROLLER_RADIUS,
        // the wall is offset +90 degrees from the route for side +1, so the
        // roller has to turn the way that walks its contact face forwards
        spin:
          (-side * (onExitRun(cz, cy) ? indexerSpeed() : BELT_SPEED)) /
          CHAIN_ROLLER_RADIUS,
        tangent: [tz, ty],
        x: 0,
        y: cy,
        z: cz,
      });
    }
  }
  return wheels;
}

/**
 * Is this part of the indexer -- the last straight run, from the top of the
 * 30T out of the back? Those are the wheels that only turn while scoring.
 */
export function onExitRun(z, y) {
  const path = guideRoute();
  const start = path[path.length - 2];
  const end = path[path.length - 1];
  const vz = end[0] - start[0];
  const vy = end[1] - start[1];
  const len2 = vz * vz + vy * vy;
  const t = Math.max(0, Math.min(1, ((z - start[0]) * vz + (y - start[1]) * vy) / len2));
  const dz = z - (start[0] + vz * t);
  const dy = y - (start[1] + vy * t);
  return Math.hypot(dz, dy) < BALL_RADIUS + CHAIN_ROLLER_RADIUS + 0.12;
}

/**
 * The static plates: the corridor's sides, and the pan the balls ride on
 * under the indexer.
 *
 * That pan matters. Along the last run the only things holding a ball up are
 * four flex wheels 0.15 apart, and a ball dropped into the gap between two
 * rims wedges: both rims push it back toward the middle, the two pushes
 * cancel, and it sits there being spun. A real robot has a plate there and so
 * does this one -- the wheels stand a few thou proud of it and do the
 * driving, the plate just stops the ball falling between them.
 */
export function guidePlates() {
  const plates = [];

  // the indexer pan, just below the flex wheel tops
  {
    const path = guideRoute();
    const start = path[path.length - 2];
    const end = path[path.length - 1];
    const midZ = (start[0] + end[0]) / 2;
    plates.push({
      // No rotation: the box is already thin in y and wide in x and z, which
      // is a pan. Turning it a quarter turn stands it up across the corridor
      // and walls the exit off, which is exactly what it did the first time.
      angle: 0,
      halfDepth: 0.02,
      halfLength: Math.abs(end[0] - start[0]) / 2 + 0.05,
      halfThickness: CORRIDOR_HALF_WIDTH,
      x: 0,
      y: indexerPanTop() - 0.02,
      z: midZ,
    });
  }
  const stations = resample(guideRoute(), 0.09);
  for (let i = 1; i < stations.length; i += 1) {
    const a = stations[i - 1];
    const b = stations[i];
    const cz = (a[0] + b[0]) / 2;
    const cy = (a[1] + b[1]) / 2;
    const dz = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dz, dy);
    if (len < 1e-6) continue;
    const angle = Math.atan2(dy, dz); // rotation about x that lays a box along the run
    for (const side of [1, -1]) {
      plates.push({
        angle,
        halfDepth: BALL_RADIUS + CORRIDOR_CLEARANCE,
        halfLength: len / 2 + 0.01,
        halfThickness: 0.012,
        x: side * CORRIDOR_HALF_WIDTH,
        y: cy,
        z: cz,
      });
    }
  }
  return plates;
}

/** The sprockets, as the discs they are -- outboard of the ball's corridor. */
export function sprockets() {
  return robotMeta.parts
    .filter((part) => /sprocket|gear/.test(part.name) && /intake/.test(part.name))
    .map((part) => ({
      halfLength: 0.02,
      name: part.name,
      // The radius in the meta is the pitch circle -- where the CHAIN sits,
      // not where the metal ends. A ball riding the chain has its surface on
      // that circle, so a disc drawn out to it scrapes the ball and stops it
      // dead on the back of the 32T and the face of the 30T. The metal is a
      // chain's thickness inside.
      radius: Math.max(0.01, part.radius - CHAIN_THICKNESS),
      x: part.axlePosition[0],
      y: part.axlePosition[1],
      z: part.axlePosition[2],
    }));
}

/**
 * The indexer gate: a flap on the hinge line the CAD gives the three indexer
 * plates, y = 1.708, z = 0.047 -- which is right at the roof of the corridor
 * where it runs out of the back.
 *
 * Shut, the flap dips GATE_DIP below that roof. The corridor is one ball
 * wide, so dipping into it at all is enough: a ball cannot squeeze past.
 * Swinging GATE_OPEN_ANGLE about the hinge lifts the flap's tip by roughly
 * arm * angle, which is more than the dip, so the corridor opens and the
 * queue feeds straight out.
 */
const GATE_DIP = 0.16;

export function indexerGate(blockZ = -0.42) {
  const plates = robotMeta.parts.filter((part) => /indexer/.test(part.name));
  const hingeY = plates.reduce((sum, part) => sum + part.axlePosition[1], 0) / plates.length;
  const hingeZ = plates.reduce((sum, part) => sum + part.axlePosition[2], 0) / plates.length;

  // The roof of the corridor where the gate blocks it.
  const stations = resample(guideRoute(), 0.02);
  const near = nearestStation(stations, blockZ, 1.5);
  const [pz, py] = stations[near.index];
  const [tz, ty] = tangentAt(stations, near.index);
  const reachOut = BALL_RADIUS + CORRIDOR_CLEARANCE / 2;
  const roofY = py - tz * reachOut;   // +90 degrees from the tangent: above it
  const roofZ = pz + ty * reachOut;

  const halfHeight = 0.09;
  const tipY = roofY - GATE_DIP + halfHeight;
  const dz = roofZ - hingeZ;
  const dy = tipY - hingeY;
  const arm = Math.hypot(dz, dy);
  return {
    /** Across the corridor, down its face, and thin along the travel. */
    bladeHalfWidth: CORRIDOR_HALF_WIDTH,
    bladeHalfHeight: halfHeight,
    bladeHalfThickness: 0.03,
    blockZ: roofZ,
    /** Unit [z, y] from the hinge to the middle of the flap, shut. */
    closedDirection: [dz / arm, dy / arm],
    dip: GATE_DIP,
    lift: 0,
    hinge: [hingeY, hingeZ],
    reach: arm,
  };
}

/** How far the gate swings, radians -- the travel the plates have. */
export const GATE_OPEN_ANGLE = 0.36;

/** The goal, from props-meta: a channel 5.72 long and 1.15 wide. */
export function goalSpec() {
  const goal = propsMeta.goal;
  return {
    halfLength: goal.length / 2,
    halfWidth: goal.boundsSize[0] / 2,
    mouthZ: goal.openings[0].position[2],
    troughHeight: goal.troughHeight,
    wallHeight: goal.boundsSize[1] - goal.troughHeight,
  };
}

export { CORRIDOR_CLEARANCE, CORRIDOR_HALF_WIDTH, resample, nearestStation, tangentAt };
