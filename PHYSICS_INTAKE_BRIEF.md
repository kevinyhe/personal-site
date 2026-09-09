# Brief: the ball's journey and the scoring animation, as real physics

Scope: what happens to a ball from the moment the intake touches it to the moment
it settles in the goal. Nothing else. The robot's floor path, the chassis model and
the camera all stay as they are — take them as given.

Today this lives in `components/ballPhysics.ts` and it is not a simulation. Every
ball position is a closed-form function of the playhead:

- a hand-measured 15-point `CARRY_PATH` (model-space `[z, y]`) that the ball is
  threaded along by arc length,
- a queue inside the robot spaced by straight-line `BALL_GAP = 0.36`,
- a lerped lob into the goal mouth over `FLIGHT_DURATION = 0.14` with a `FLIGHT_SAG`
  of 0.03,
- a decelerating `GLIDE_RUN = 0.42` roll-out inside the trough,
- a 0.02 settle drop, and fixed literal jitter tables so it replays.

Replace all of that with a rigid-body sim. Keep the exported shape:
`ballStatesAt(t) -> BallState[]` with `{ carried, position, rotation }` in stage
units, world space, floor at y = -1.2. `RobotOutro.tsx` should not change.

## The five stages to reproduce

1. **Pick-up.** A ball is lying on the floor at a known spot; the robot's front lip
   arrives. Contact with the eight front `half_flex_wheel` rollers drags it in.
   `carried` flips true here. Today this is a scripted grab at a fixed time from
   `BALL_PICKUP_TIMES`; use those times as the expected answer, not as the input.
2. **The ride up the tower.** In profile the route is an S: in along the floor,
   under both rows of front flex wheels, onto the underside of the 32T, rearward
   and around the back 16T, forward again and up the face of the 30T, over its top,
   out across the indexer flex wheels at the rear. About 0.85 s end to end.
   The corridor is tight — the ball is 0.313 across. The only parts genuinely in
   its way are the flex wheels at |x| = 0.08–0.12; the sprockets sit at
   |x| = 0.17–0.30 and the ball rides between the chain runs. The carry path keeps
   the ball's surface within 0.06 of each flex wheel, and that squeeze is the grip
   that moves it. Get that clearance right and the sim carries the ball on its own.
3. **The queue at the indexer.** Balls stack nose-to-tail at the top and wait. It is
   a queue, not a stack: first in, first out. The robot starts the run already
   holding 4, and picks up 5 more, so 9 have to fit through and come out in order.
   The indexer plates (`1x1_Thin_5x_Half-C_Alu` ×2 and `Component222`, all on one
   hinge line) hold them back. They do not spin — they swing open 0.36 rad.
4. **The throw.** The robot parks with its tail in the goal mouth. After a short
   beat the indexer opens and the top flex wheels feed balls out the back, roughly
   one every 0.34 s, across a gap of about 0.41 units. They leave at ~2.9 units/s —
   fed out, not placed. The exit height and the goal's trough height are the same
   number (1.527) because both came off the same scale, so the throw is nearly
   level with a slight climb into the mouth.
5. **The roll-out.** A ball crosses the mouth still carrying that speed, touches
   down just inside, and rolls the rest of the way while it sheds it. It settles
   about 0.02 down into the channel. Later balls push earlier ones further back
   along the goal's long axis — the trough is 5.72 long and only 1.15 wide, so they
   queue back along it, never side by side.

## What the sim has to get right that the current version fakes

- **Speed continuity at every hand-off.** The flight and the roll-out are tuned
  against each other by hand right now (`GLIDE_DURATION = 0.28` exists only because
  `2 × GLIDE_RUN / 2.9 ≈ 0.29`). Change one and the other is silently wrong: the
  ball speeds up as it lands, or stops dead on the frame it arrives. A real sim
  should give you this for free — if it doesn't, the contact parameters are wrong.
- **Balls not overlapping.** The current spacing literals exist because arc-length
  spacing failed on the tight bends: the chord across a bend is much shorter than
  the arc, so balls queued by distance-along-path still intersected. Collisions
  solve this properly.
- **The push in the trough.** An arriving ball starts the resting one moving 0.12 s
  before touchdown, because they meet while it is still rolling in. That lead is a
  fudge for a contact the engine will just have.

## Materials, roughly

Foam ball: low restitution, it does not bounce. Flex wheels: 30A rubber, high
friction, and they are compliant — if rigid cylinders jam the ball, soften the
contact rather than widening the corridor. Goal trough: slick plastic, low friction,
which is what lets a ball roll its 0.42 after touchdown.

## The hard constraint: it must be scrubbable

The scene is scroll-driven. Scroll back and the run plays backwards, frame for
frame, identically. A stepper called from `useFrame` cannot do that — it drifts
apart from itself the moment the playhead reverses.

So bake, don't step at render time. Run the sim once at a fixed timestep with a
deterministic engine (Rapier, fixed dt, fixed seed), record every ball's position
and orientation per frame, and make `ballStatesAt(t)` an interpolated read of that
table. Two calls at the same `t` must return the same numbers. Spin is the one
quantity that genuinely accumulates, and the current code already bakes it for
exactly this reason — the sim just extends that treatment to everything.

## Acceptance checks (Node audit, no browser)

1. No two balls interpenetrate by more than 0.01 units on any frame.
2. No ball passes through a chassis wall, a sprocket, or the goal's side.
3. All 9 balls end at rest inside the trough, below y = 1.527, queued along its
   long axis.
4. Each ball's speed is continuous across pick-up, exit and touchdown — no jump up
   at landing, no stop on the arrival frame.
5. Playing the table backwards equals playing it forwards reversed, exactly.

If you find yourself adding constants to make balls sit in the trough, stop. That
is the closed-form version again with extra steps.
