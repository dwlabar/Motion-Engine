// SVG endpoint-to-center conversion: https://www.w3.org/TR/SVG/implnote.html#ArcConversionEndpointToCenter
// Each returned cubic spans at most a quarter turn; elliptical arcs are approximate.
export function arcToCubics(x, y, rx, ry, rotation, large, sweep, endX, endY) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const angle = (rotation % 360) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfX = x / 2 - endX / 2;
  const halfY = y / 2 - endY / 2;
  const localX = cos * halfX + sin * halfY;
  const localY = -sin * halfX + cos * halfY;
  const scale = Math.hypot(localX / rx, localY / ry);
  if (scale > 1) {
    rx *= scale;
    ry *= scale;
  }
  const unitX = localX / rx;
  const unitY = localY / ry;
  const distance = Math.hypot(unitX, unitY);
  // Corrected radii have a unique center; rounding must not split a half turn into three cubics.
  const offset = scale >= 1 ? 0
    : (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, 1 - distance * distance));
  const centerX = offset * (unitY / distance);
  const centerY = -offset * (unitX / distance);
  const startAngle = Math.atan2(unitY - centerY, unitX - centerX);
  let span = Math.atan2(-unitY - centerY, -unitX - centerX) - startAngle;
  if (sweep && span < 0) span += 2 * Math.PI;
  if (!sweep && span > 0) span -= 2 * Math.PI;
  const count = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 2) - 1e-12));
  const step = span / count;
  const midX = x / 2 + endX / 2;
  const midY = y / 2 + endY / 2;
  const map = (u, v) => [
    midX + cos * (rx * (u + centerX)) - sin * (ry * (v + centerY)),
    midY + sin * (rx * (u + centerX)) + cos * (ry * (v + centerY)),
  ];
  const segments = [];
  for (let index = 0; index < count; index += 1) {
    const from = startAngle + index * step;
    const to = from + step;
    const factor = 4 / 3 * Math.tan(step / 4);
    segments.push([
      ...map(Math.cos(from) - factor * Math.sin(from), Math.sin(from) + factor * Math.cos(from)),
      ...map(Math.cos(to) + factor * Math.sin(to), Math.sin(to) - factor * Math.cos(to)),
      ...map(Math.cos(to), Math.sin(to)),
    ]);
  }
  // Keep the supplied endpoint exact, including endpoints used by a closed seam.
  segments[segments.length - 1][4] = endX;
  segments[segments.length - 1][5] = endY;
  return segments;
}
