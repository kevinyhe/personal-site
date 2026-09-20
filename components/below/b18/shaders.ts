/**
 * The picture on the television's glass.
 *
 * It samples the channel (a 3D scene drawn to a texture, or the test
 * card) and adds what a tube does to it: a slight bow toward the corners,
 * scanlines, snow and a roll between channels, and the switch-off, where
 * the picture squashes to a line and the line to a dot.
 *
 * Everything this writes is read again by the bar shader, which drops any
 * cell near pure black. So the glass is never quite black: dark glass is
 * a thin bar, not a hole.
 */

export const SCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SCREEN_FRAG = /* glsl */ `
uniform sampler2D uPicture;
uniform float uTime;
uniform float uSnow;
uniform float uRoll;
uniform float uPower;
uniform float uLines;
varying vec2 vUv;

float hash21(vec2 p) {
  // Wrapped first: the sin hash turns large numbers into stripes on
  // low-precision GPUs.
  p = mod(p, 256.0);
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  // The raster bows out a little toward the corners, as on a tube.
  vec2 uv = 0.5 + c * (1.0 - 0.12 * r2);

  // Switching off. From power 1 to 0.5 the picture squashes to a line;
  // from 0.5 to 0.18 the line shrinks to a dot; then the dot fades.
  float sy = mix(0.006, 1.0, smoothstep(0.5, 1.0, uPower));
  float sx = mix(0.02, 1.0, smoothstep(0.18, 0.5, uPower));
  vec2 p = (uv - 0.5) / vec2(sx, sy) + 0.5;
  float inside = step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);

  // The roll: the picture slides up through the frame and wraps.
  float y = fract(p.y + uRoll);
  // In the snow the lines tear sideways, a different amount each line.
  float tear = (hash21(vec2(floor(y * 48.0), floor(uTime * 24.0))) - 0.5) * 0.08 * uSnow;
  vec3 col = texture2D(uPicture, vec2(clamp(p.x + tear, 0.0, 1.0), y)).rgb;
  // The dark band between two frames, seen only while it rolls.
  float seam = smoothstep(0.0, 0.05, y) * (1.0 - smoothstep(0.95, 1.0, y));
  col *= mix(1.0, seam, step(0.001, abs(uRoll)));

  // Snow.
  float frame = floor(uTime * 30.0);
  float n = hash21(floor(p * vec2(150.0, 125.0)) + vec2(frame * 17.0, frame * 5.0));
  col = mix(col, vec3(0.08 + 0.9 * n), uSnow);

  // Scanlines, coarse enough that the bars see them.
  col *= 0.84 + 0.16 * cos(p.y * uLines * 6.28318);

  // As it collapses, the line runs hot.
  col = mix(col, vec3(1.0), 1.0 - smoothstep(0.55, 1.0, uPower));

  float lit = inside * smoothstep(0.0, 0.18, uPower);
  col = mix(vec3(0.035), col, lit);
  col *= 1.0 - 0.9 * r2;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
