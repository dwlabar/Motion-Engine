import { arcToCubics } from './pathArc.js';
import { validatePath } from './pathGeometry.js';

export function parsePath(value) {
  const numberPattern = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  const arities = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
  const whitespace = /[\t\n\f\r ]/;
  if (typeof value !== 'string') throw new TypeError('Path requires an SVG d string.');
  let cursor = 0;
  const fail = () => { throw new TypeError(`Invalid SVG path at offset ${cursor}.`); };
  const skipSpace = () => {
    const before = cursor;
    while (cursor < value.length && whitespace.test(value[cursor])) cursor += 1;
    return cursor > before;
  };
  const read = (first, flag, separatorRequired) => {
    let separated = skipSpace();
    if (!first && value[cursor] === ',') {
      cursor += 1;
      skipSpace();
      separated = true;
    }
    if (separatorRequired && !separated) fail();
    if (flag) {
      if (value[cursor] !== '0' && value[cursor] !== '1') fail();
      return Number(value[cursor++]);
    }
    numberPattern.lastIndex = cursor;
    const match = numberPattern.exec(value);
    if (!match) fail();
    cursor = numberPattern.lastIndex;
    const result = Number(match[0]);
    if (!Number.isFinite(result)) fail();
    return result;
  };

  const paths = [];
  let path;
  let command;
  let x = 0;
  let y = 0;
  let cubicControl;
  let quadraticControl;
  const begin = (startX, startY) => {
    path = { start: [startX, startY], segments: [], closed: false };
    paths.push(path);
  };
  const append = (segment) => {
    path.segments.push(segment);
    x = segment[4];
    y = segment[5];
  };
  const line = (endX, endY) => append([
    x * (2 / 3) + endX / 3, y * (2 / 3) + endY / 3,
    x / 3 + endX * (2 / 3), y / 3 + endY * (2 / 3), endX, endY,
  ]);

  while (true) {
    skipSpace();
    if (cursor === value.length) break;
    const explicit = /[a-zA-Z]/.test(value[cursor]);
    if (explicit) command = value[cursor++];
    if (!command) fail();
    const type = command.toUpperCase();
    const relative = command !== type;
    if (!path && type !== 'M') fail();
    if (type === 'Z') {
      if (!path.closed) {
        if (x !== path.start[0] || y !== path.start[1]) line(...path.start);
        path.closed = true;
      }
      [x, y] = path.start;
      cubicControl = quadraticControl = undefined;
      command = undefined;
      continue;
    }
    if (!arities[type]) fail();
    const args = [];
    for (let index = 0; index < arities[type]; index += 1) {
      args.push(read(explicit && index === 0, type === 'A' && (index === 3 || index === 4),
        type === 'A' && index === 3));
    }
    const point = (index) => [args[index] + (relative ? x : 0), args[index + 1] + (relative ? y : 0)];
    if (type !== 'M' && path.closed) begin(x, y);
    let nextCubic;
    let nextQuadratic;
    if (type === 'M') {
      [x, y] = point(0);
      begin(x, y);
      command = relative ? 'l' : 'L';
    } else if (type === 'L') {
      line(...point(0));
    } else if (type === 'H') {
      line(args[0] + (relative ? x : 0), y);
    } else if (type === 'V') {
      line(x, args[0] + (relative ? y : 0));
    } else if (type === 'C' || type === 'S') {
      const control1 = type === 'C' ? point(0)
        : cubicControl ? [x + (x - cubicControl[0]), y + (y - cubicControl[1])] : [x, y];
      nextCubic = point(type === 'C' ? 2 : 0);
      append([...control1, ...nextCubic, ...point(type === 'C' ? 4 : 2)]);
    } else if (type === 'Q' || type === 'T') {
      nextQuadratic = type === 'Q' ? point(0)
        : quadraticControl ? [x + (x - quadraticControl[0]), y + (y - quadraticControl[1])] : [x, y];
      const [endX, endY] = point(type === 'Q' ? 2 : 0);
      append([
        x / 3 + nextQuadratic[0] * (2 / 3), y / 3 + nextQuadratic[1] * (2 / 3),
        endX / 3 + nextQuadratic[0] * (2 / 3), endY / 3 + nextQuadratic[1] * (2 / 3), endX, endY,
      ]);
    } else if (type === 'A') {
      const [endX, endY] = point(5);
      if (x !== endX || y !== endY) {
        if (args[0] === 0 || args[1] === 0) line(endX, endY);
        else {
          for (const segment of arcToCubics(x, y, ...args.slice(0, 5), endX, endY)) append(segment);
        }
      }
    }
    cubicControl = nextCubic;
    quadraticControl = nextQuadratic;
  }
  validatePath(paths);
  return paths;
}
