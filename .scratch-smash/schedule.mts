// The release schedule, straight from planReleaseOrder's maths, for a range
// of RELEASE_ACCELERATION values. Answers: at what point in the breakup have
// a quarter / half / three quarters of the pieces let go?
const RELEASE_END = 0.86;
const SLOTS = 56; // units in the current build

function moments(ra: number, slots = SLOTS) {
  const decay = slots > 2 ? Math.pow(ra, -1 / (slots - 2)) : 1;
  const total =
    decay === 1
      ? Math.max(slots - 1, 1)
      : (1 - Math.pow(decay, slots - 1)) / (1 - decay);
  const out: number[] = [];
  for (let slot = 0; slot < slots; slot++) {
    out.push(
      slots <= 1
        ? 0
        : (RELEASE_END *
            (decay === 1 ? slot : (1 - Math.pow(decay, slot)) / (1 - decay))) /
            total,
    );
  }
  return out;
}

const quantile = (m: number[], q: number) => m[Math.floor((m.length - 1) * q)];
console.log("Is the progression preserved when the slot count changes?");
console.log("slots   25% out   50% out   75% out   | released by breakup 0.25 / 0.40");
for (const slots of [56, 84]) {
  const m = moments(3, slots);
  const by = (b: number) => m.filter((x) => x <= b).length / m.length;
  console.log(
    `${String(slots).padEnd(6)}  ${quantile(m, 0.25).toFixed(3)}     ${quantile(m, 0.5).toFixed(3)}     ` +
      `${quantile(m, 0.75).toFixed(3)}     |  ${(by(0.25) * 100).toFixed(0)}%  /  ${(by(0.4) * 100).toFixed(0)}%`);
}
console.log("");
console.log("RA      25% out   50% out   75% out   | released by breakup 0.25 / 0.40");
for (const ra of [3]) {
  const m = moments(ra);
  const by = (b: number) => m.filter((x) => x <= b).length / m.length;
  const label = ra < 1 ? `1/${Math.round(1 / ra)}` : String(ra);
  console.log(
    `${label.padEnd(6)}  ${quantile(m, 0.25).toFixed(3)}     ${quantile(m, 0.5).toFixed(3)}     ` +
      `${quantile(m, 0.75).toFixed(3)}     |  ${(by(0.25) * 100).toFixed(0)}%  /  ${(by(0.4) * 100).toFixed(0)}%`,
  );
}
