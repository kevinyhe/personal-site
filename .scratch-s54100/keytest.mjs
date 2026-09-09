// Sanity: monotone, endpoint-exact, no overshoot, continuous rate.
const K = [[0,-45],[1.5,-45],[2.6,-10],[4.0,30],[5.6,65],[7.4,90],[11.63,106]];
function keyed(keys, at) {
  if (at <= keys[0][0]) return keys[0][1];
  const last = keys.length - 1;
  if (at >= keys[last][0]) return keys[last][1];
  let i = 0; while (i < last - 1 && at > keys[i+1][0]) i += 1;
  const [t0,v0] = keys[i], [t1,v1] = keys[i+1];
  const h = Math.max(t1-t0, 1e-6);
  const slope = (n) => (keys[n+1][1]-keys[n][1]) / Math.max(keys[n+1][0]-keys[n][0], 1e-6);
  const d = slope(i);
  let m0 = i === 0 ? d : (slope(i-1)+d)/2;
  let m1 = i+1 === last ? d : (d+slope(i+1))/2;
  if (d === 0) { m0 = 0; m1 = 0; } else {
    m0 = Math.max(-3*Math.abs(d), Math.min(3*Math.abs(d), m0*Math.sign(d) < 0 ? 0 : m0));
    m1 = Math.max(-3*Math.abs(d), Math.min(3*Math.abs(d), m1*Math.sign(d) < 0 ? 0 : m1));
  }
  const x = Math.min(1, Math.max(0, (at-t0)/h)), x2 = x*x, x3 = x2*x;
  return (2*x3-3*x2+1)*v0 + (x3-2*x2+x)*h*m0 + (-2*x3+3*x2)*v1 + (x3-x2)*h*m1;
}
let prev = keyed(K, 0), mono = true, lo = Infinity, hi = -Infinity;
const rates = [];
for (let t = 0; t <= 12; t += 0.005) {
  const v = keyed(K, t);
  if (v < prev - 1e-9) mono = false;
  rates.push((v - prev) / 0.005);
  prev = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
}
const r = rates.slice(2, -2);
let jerk = 0;
for (let i = 1; i < r.length; i++) jerk = Math.max(jerk, Math.abs(r[i] - r[i-1]));
console.log(`monotone ${mono}  range ${lo.toFixed(2)}..${hi.toFixed(2)} (keys -45..106)`);
console.log(`endpoints ${keyed(K,0)} ${keyed(K,11.63)}   key hits: ${K.map(([t,v]) => (Math.abs(keyed(K,t)-v) < 1e-9 ? "ok" : "OFF")).join(" ")}`);
console.log(`rate  min ${Math.min(...r).toFixed(2)}  max ${Math.max(...r).toFixed(2)} deg/s  largest step between adjacent samples ${jerk.toFixed(3)}`);
// same for the old smoothstep, for comparison
function old(keys, at) { if (at <= keys[0][0]) return keys[0][1]; for (let i=1;i<keys.length;i++){ if (at > keys[i][0]) continue; const [t0,v0]=keys[i-1],[t1,v1]=keys[i]; const x=Math.min(1,Math.max(0,(at-t0)/Math.max(t1-t0,1e-6))); return v0+(v1-v0)*x*x*(3-2*x);} return keys[keys.length-1][1]; }
let p2 = old(K, 0); const r2 = [];
for (let t = 0; t <= 12; t += 0.005) { const v = old(K, t); r2.push((v-p2)/0.005); p2 = v; }
const rr = r2.slice(2, -2);
console.log(`OLD smoothstep rate  min ${Math.min(...rr).toFixed(2)}  max ${Math.max(...rr).toFixed(2)} deg/s  (stalls to 0 at every key)`);
