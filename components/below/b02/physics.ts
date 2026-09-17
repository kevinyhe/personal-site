/**
 * The solver for the 42 pieces. Written by hand, no library.
 *
 * Every piece collides as a ball. Each step moves the pieces, then pushes
 * overlapping pairs apart, then reads the speed back from how far each
 * piece actually went. That last part is what lets a pile come to rest:
 * a piece the floor pushed back up has not moved, so its speed is zero.
 *
 * Nothing here allocates. It runs 120 times a second.
 */

export type Body = {
  x: number; y: number; z: number;
  /** Where it was when the step began. */
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  /** Spin, about the world's axes, radians a second. */
  wx: number; wy: number; wz: number;
  qx: number; qy: number; qz: number; qw: number;
  /** Ball radius it collides with, at its size now. */
  r: number;
  /** One over its mass. */
  inv: number;
  /** The point it is pulled to, and how hard. 0 is no pull. */
  ax: number; ay: number; az: number;
  pull: number;
  drag: number;
  /** The direction a face should end up looking, so its mark can be read. */
  fx: number; fy: number; fz: number;
  /** A puck has one axis with marks on it (y). A cube has three. */
  cube: boolean;
  /** Touched the floor or a resting neighbour this step. */
  held: boolean;
};

export type World = {
  /** Downward pull. 0 in the knot and on the cards. */
  gravity: number;
  floor: number;
  wallX: number;
  /** The pile is kept in a slab this deep either side of z = 0. */
  slab: number;
  /** How fast the knot turns about its centre. */
  swirl: number;
  cx: number; cy: number; cz: number;
  /** How hard a face is turned toward the viewer. */
  face: number;
  spinDrag: number;
  rounds: number;
  /**
   * The cursor's ball. It is a ball where it meets the z = 0 plane, but
   * it pushes all the way along the line of sight from the eye, or the
   * pieces in front of it would hide the gap it makes.
   */
  cursor: { on: boolean; x: number; y: number; z: number; px: number; py: number; pz: number; r: number };
  /** How far up +z the eye is. */
  eye: number;
  /** The most the cursor moves a piece in one step, and the top speed.
   *  Lower in the pile, where a hard shove would throw pieces a screen up. */
  shove: number;
  topSpeed: number;
};

export function makeBody(): Body {
  return {
    x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0,
    qx: 0, qy: 0, qz: 0, qw: 1, r: 1, inv: 1, ax: 0, ay: 0, az: 0, pull: 0, drag: 2,
    fx: 0, fy: 0, fz: 1, cube: false, held: false,
  };
}

/** The pull stops growing past this distance, so the middle is not crushed. */
const PULL_REACH = 1.6;
/** Past this it grows again: a piece screens away has to get back. */
const PULL_FAR = 4;
/** No pair is pushed apart by more than this in one step. A deep overlap
 *  (every piece sent to one point) then opens over a few frames and does
 *  not throw pieces across the room. */
const MAX_PUSH = 0.16;
/** The share of the sliding speed at a contact that is lost to it. */
const GRIP = 0.22;

export function step(bodies: Body[], w: World, dt: number, cursorMix: number): void {
  const n = bodies.length;
  // Where the cursor's ball is for this step, between last frame and this.
  const c = w.cursor;
  const kx = c.px + (c.x - c.px) * cursorMix;
  const ky = c.py + (c.y - c.py) * cursorMix;
  const kz = c.pz + (c.z - c.pz) * cursorMix;
  // The line of sight through the cursor, from the eye.
  let lx = kx, ly = ky, lz = kz - w.eye;
  const ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
  lx /= ll; ly /= ll; lz /= ll;

  for (let i = 0; i < n; i += 1) {
    const b = bodies[i];
    b.px = b.x; b.py = b.y; b.pz = b.z;
    b.held = false;
    let fx = -b.drag * b.vx, fy = -b.drag * b.vy, fz = -b.drag * b.vz;
    if (b.pull > 0) {
      const dx = b.ax - b.x, dy = b.ay - b.y, dz = b.az - b.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 1e-5) {
        const f = (b.pull * (Math.min(d, PULL_REACH) + 0.7 * Math.max(0, d - PULL_FAR))) / d;
        fx += dx * f; fy += dy * f; fz += dz * f;
      }
    }
    if (w.swirl !== 0) {
      // Round a mostly upright axis: near pieces cross one way, far ones
      // the other, which is what makes it read as a turning solid.
      const rx = b.x - w.cx, rz = b.z - w.cz;
      fx += w.swirl * rz;
      fz += -w.swirl * rx;
    }
    if (w.gravity > 0) {
      fy -= w.gravity;
      if (b.z > w.slab) fz -= 40 * (b.z - w.slab);
      else if (b.z < -w.slab) fz -= 40 * (b.z + w.slab);
    }
    b.vx += fx * dt; b.vy += fy * dt; b.vz += fz * dt;
    const sp = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
    if (sp > w.topSpeed * w.topSpeed) {
      const k = w.topSpeed / Math.sqrt(sp);
      b.vx *= k; b.vy *= k; b.vz *= k;
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  }

  for (let round = 0; round < w.rounds; round += 1) {
    const first = round === 0;
    for (let i = 0; i < n; i += 1) {
      const a = bodies[i];
      for (let j = i + 1; j < n; j += 1) {
        const b = bodies[j];
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= min * min || d2 < 1e-10) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const pen = Math.min(min - d, MAX_PUSH);
        const sum = a.inv + b.inv;
        const pa = (pen * a.inv) / sum, pb = (pen * b.inv) / sum;
        a.x += nx * pa; a.y += ny * pa; a.z += nz * pa;
        b.x -= nx * pb; b.y -= ny * pb; b.z -= nz * pb;
        if (w.gravity > 0 && (a.held || b.held)) { a.held = true; b.held = true; }
        if (!first) continue;
        // How fast the two surfaces slide past each other where they touch.
        let sx = (a.x - a.px - (b.x - b.px)) / dt;
        let sy = (a.y - a.py - (b.y - b.py)) / dt;
        let sz = (a.z - a.pz - (b.z - b.pz)) / dt;
        // Spin carries the surface too: w x (-n r) for a, w x (n r) for b.
        sx += -(a.wy * nz - a.wz * ny) * a.r - (b.wy * nz - b.wz * ny) * b.r;
        sy += -(a.wz * nx - a.wx * nz) * a.r - (b.wz * nx - b.wx * nz) * b.r;
        sz += -(a.wx * ny - a.wy * nx) * a.r - (b.wx * ny - b.wy * nx) * b.r;
        const along = sx * nx + sy * ny + sz * nz;
        sx -= along * nx; sy -= along * ny; sz -= along * nz;
        const m = GRIP / sum;
        a.x -= sx * m * a.inv * dt; a.y -= sy * m * a.inv * dt; a.z -= sz * m * a.inv * dt;
        b.x += sx * m * b.inv * dt; b.y += sy * m * b.inv * dt; b.z += sz * m * b.inv * dt;
        // A glancing hit turns both. n x slide is the axis.
        const tx = ny * sz - nz * sy, ty = nz * sx - nx * sz, tz = nx * sy - ny * sx;
        const ka = (m * a.inv) / (0.4 * a.r), kb = (m * b.inv) / (0.4 * b.r);
        a.wx += tx * ka; a.wy += ty * ka; a.wz += tz * ka;
        b.wx += tx * kb; b.wy += ty * kb; b.wz += tz * kb;
      }
    }

    for (let i = 0; i < n; i += 1) {
      const b = bodies[i];
      if (c.on) {
        // How far the piece is from that line, and which way.
        const ex = b.x, ey = b.y, ez = b.z - w.eye;
        const along = ex * lx + ey * ly + ez * lz;
        const dx = ex - along * lx, dy = ey - along * ly, dz = ez - along * lz;
        const min = b.r + c.r;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < min * min && d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const pen = Math.min(min - d, w.shove);
          b.x += (dx / d) * pen; b.y += (dy / d) * pen; b.z += (dz / d) * pen;
          if (first) {
            // The cursor's ball drags the surface it touches round with it.
            const nx = dx / d, ny = dy / d, nz = dz / d;
            let sx = (b.x - b.px) / dt - (c.x - c.px) * 60;
            let sy = (b.y - b.py) / dt - (c.y - c.py) * 60;
            let sz = (b.z - b.pz) / dt;
            const on = sx * nx + sy * ny + sz * nz;
            sx -= on * nx; sy -= on * ny; sz -= on * nz;
            const k = (GRIP * 0.6) / (0.4 * b.r);
            b.wx += (ny * sz - nz * sy) * k; b.wy += (nz * sx - nx * sz) * k; b.wz += (nx * sy - ny * sx) * k;
          }
        }
      }
      if (w.gravity > 0) {
        if (b.y - b.r < w.floor) {
          b.y = w.floor + b.r;
          b.held = true;
          if (first) {
            // Slide at the floor: v + w x (-y r). Grip turns it into roll.
            const sx = (b.x - b.px) / dt + b.wz * b.r;
            const sz = (b.z - b.pz) / dt - b.wx * b.r;
            b.x -= sx * 0.2 * dt; b.z -= sz * 0.2 * dt;
            b.wx += (sz * 0.5) / b.r; b.wz += (-sx * 0.5) / b.r;
          }
        }
        if (b.x - b.r < -w.wallX) b.x = -w.wallX + b.r;
        else if (b.x + b.r > w.wallX) b.x = w.wallX - b.r;
      }
    }
  }

  const spin = Math.exp(-w.spinDrag * dt);
  for (let i = 0; i < n; i += 1) {
    const b = bodies[i];
    b.vx = (b.x - b.px) / dt; b.vy = (b.y - b.py) / dt; b.vz = (b.z - b.pz) / dt;
    if (b.held) {
      // A piece that is resting on something and barely moving stays put.
      // Without this a pile never stops shivering.
      const sp = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
      if (sp < 0.05) {
        b.x = b.px; b.y = b.py; b.z = b.pz;
        b.vx = 0; b.vy = 0; b.vz = 0;
        b.wx *= 0.9; b.wy *= 0.9; b.wz *= 0.9;
      } else {
        b.vx *= 0.985; b.vz *= 0.985;
      }
    }

    // Turn the nearest marked face toward where it should look.
    if (w.face > 0) {
      const { qx, qy, qz, qw } = b;
      // The body's y axis in the world.
      let ux = 2 * (qx * qy - qw * qz), uy = 1 - 2 * (qx * qx + qz * qz), uz = 2 * (qy * qz + qw * qx);
      let best = ux * b.fx + uy * b.fy + uz * b.fz;
      if (b.cube) {
        const xx = 1 - 2 * (qy * qy + qz * qz), xy = 2 * (qx * qy + qw * qz), xz = 2 * (qx * qz - qw * qy);
        const zx = 2 * (qx * qz + qw * qy), zy = 2 * (qy * qz - qw * qx), zz = 1 - 2 * (qx * qx + qy * qy);
        const dx = xx * b.fx + xy * b.fy + xz * b.fz;
        const dz = zx * b.fx + zy * b.fy + zz * b.fz;
        if (Math.abs(dx) > Math.abs(best)) { best = dx; ux = xx; uy = xy; uz = xz; }
        if (Math.abs(dz) > Math.abs(best)) { best = dz; ux = zx; uy = zy; uz = zz; }
      }
      const s = best < 0 ? -1 : 1;
      const k = w.face * s * dt;
      b.wx += (uy * b.fz - uz * b.fy) * k;
      b.wy += (uz * b.fx - ux * b.fz) * k;
      b.wz += (ux * b.fy - uy * b.fx) * k;
    }

    b.wx *= spin; b.wy *= spin; b.wz *= spin;
    const ws = b.wx * b.wx + b.wy * b.wy + b.wz * b.wz;
    if (ws > 144) { const k = 12 / Math.sqrt(ws); b.wx *= k; b.wy *= k; b.wz *= k; }
    // q += 0.5 * (w, 0) * q * dt
    const hx = b.wx * dt * 0.5, hy = b.wy * dt * 0.5, hz = b.wz * dt * 0.5;
    const { qx, qy, qz, qw } = b;
    let nx = qx + hx * qw + hy * qz - hz * qy;
    let ny = qy - hx * qz + hy * qw + hz * qx;
    let nz = qz + hx * qy - hy * qx + hz * qw;
    let nw = qw - hx * qx - hy * qy - hz * qz;
    const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
    nx *= l; ny *= l; nz *= l; nw *= l;
    b.qx = nx; b.qy = ny; b.qz = nz; b.qw = nw;
  }
}
