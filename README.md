# Motion Engine

A standalone vanilla JavaScript ES module library. Version 0.1.0 is private and
in development. The timeline core evaluates transform, opacity, and SVG path tracks
at arbitrary times without a DOM or browser clock. An optional playback controller
adds elapsed-time scheduling without applying values to targets.

## Timeline API

```js
import { createTimeline } from 'motion-engine';

const timeline = createTimeline({
  version: 1,
  duration: 2,
  tracks: [{
    targetId: 'box',
    property: 'opacity',
    keyframes: [{ time: 0, value: 0 }, { time: 2, value: 1 }],
  }],
});

timeline.duration; // 2 seconds
timeline.evaluate(1); // [{ targetId: 'box', property: 'opacity', value: 0.75 }]
```

Times are absolute seconds. Evaluation clamps finite times to `[0, duration]`,
omits tracks before their first keyframe, and holds their final value afterward.
Empty tracks produce no results; a single keyframe holds from its timestamp.
Results follow input track order and each call returns a fresh array, records,
and position objects, including at exact keyframes and during final holds.

Creation validates and snapshots the model, sorting private keyframe copies once.
Seeking uses binary search with no history-dependent state or per-call sorting.
Changing the source model afterward does not affect the timeline; create a new
timeline to apply edits.

Version must be `1`; duration must be finite and nonnegative (zero is valid).
Tracks require nonempty string identifiers and a keyframes array. Keyframe times
must be finite numbers within the duration. Duplicate `(targetId, property)`
tracks and duplicate timestamps within a track are rejected. Unsorted timestamps
are accepted. Invalid timing at creation throws `RangeError`; invalid shapes,
values, or nonfinite/non-numeric evaluation times throw `TypeError`.

The schema remains version `1`. Supported properties are:

- `position`: an object with finite numeric `x` and `y`, interpolated independently.
- `scale`: a finite number for uniform scaling on both axes.
- `rotation`: a finite number in degrees, interpolated without wrapping or choosing
  a shortest path (350 to 10 passes through 180).
- `opacity`: a finite number. The evaluator does not clamp property values;
  negative scales and rotations spanning multiple turns are also supported.
- `path`: an SVG `d` string, interpolated between compatible normalized cubic paths.

Exact keyframe values are preserved at their timestamps. Unsupported properties,
malformed values, and unsupported easing throw `TypeError` at creation.

Each segment uses its starting keyframe's `easeToNext`, otherwise its ending
keyframe's legacy `ease`, otherwise `power1.out`. Supported presets are `none`
(linear), and `power1`, `power2`, `power3` with `.in`, `.out`, or `.inOut`.
These power families use quadratic, cubic, and quartic curves respectively.
Easing fields may be omitted or `undefined`; other values must name a supported
preset, even when overridden or on an unused endpoint. Set `easeToNext: 'none'`
on a segment's starting keyframe for the linear behavior used in T02.
Both coordinates of a position segment and all cubic path coordinates use the
same eased progress.

SVG transform semantics follow the editor reference: position represents x/y
translation in SVG user units; uniform scale and rotation act around the SVG
element's bounding-box center, not the SVG viewport origin. Values describe
individual transform properties rather than baked geometry or transform matrices.
The core only evaluates data: bounding-box measurement, transform composition,
and application to SVG/DOM targets remain the responsibility of T06 adapters.

## Playback API

```js
import { createPlaybackController } from 'motion-engine';

const playback = createPlaybackController(timeline, {
  loop: false,
  direction: 1,
  onUpdate(time, values) {
    // time is in seconds; values is timeline.evaluate(time).
  },
});

playback.play();
playback.pause();
playback.seek(1);
playback.reverse();
playback.restart();
playback.setLoop(true);
playback.state; // { time, duration, playing, direction, loop }
```

Creation is paused and emits nothing. Direction is `1` (forward, starting at zero)
or `-1` (backward, starting at duration). `loop` is a boolean, defaulting to `false`;
both options are readable in state, and `reverse()` toggles direction.

- `play()` resumes the current position and emits immediately. Repeated calls
  while playing do nothing. At a nonlooping endpoint it emits but stays stopped;
  use `restart()` to play again from the current direction's starting boundary.
- `pause()` accounts for elapsed time since the last frame, cancels the pending
  frame, and emits the paused position. Already-paused calls do nothing.
- `seek(seconds)` clamps finite times to `[0, duration]` and emits immediately.
  It preserves paused/running status except that seeking to the current direction's
  nonlooping endpoint stops playback. It resets the running clock baseline.
- `reverse()` first accounts for elapsed time in the old direction, then flips
  direction without jumping or starting paused playback. It emits immediately.
- `restart()` resets to zero when forward or duration when backward and plays.
- `setLoop(enabled)` accepts only a boolean and updates `state.loop` immediately.
  It preserves position, paused/running status, and the pending frame without
  emitting or resetting the clock. The next time sample uses the new setting;
  disabling looping lets playback stop at the next boundary.
- `state` returns a frozen snapshot. `time` is the latest sampled position, updated
  by frames and controls; reading state does not advance time or emit callbacks.

Each update receives `(time, values)` with fresh results from the unchanged
timeline evaluator. Nonlooping playback clamps and stops at boundaries; looping
wraps and retains elapsed overshoot, including across multiple cycles (exact
cycle multiples wrap to zero). Zero-duration timelines emit at zero and stay
stopped even with looping enabled. Callback errors stop playback and propagate.
No values are applied to DOM, SVG, or other targets.

Scheduling defaults to `requestAnimationFrame` / `cancelAnimationFrame` and
`performance.now()`. For deterministic tests or nonbrowser hosts, inject
`{ now, requestFrame, cancelFrame }` alongside the other options: `now()` returns
monotonic milliseconds, `requestFrame(callback)` queues an asynchronous one-shot
callback and returns its ID, and `cancelFrame(id)` cancels it. Every elapsed-time
sample uses `now()`; frame callback timestamps are ignored. Pause/resume excludes
paused time, while delays during active playback count in full. Only one frame
is pending at a time. Creation and paused seeking need no browser globals.

## SVG path geometry and vertex animation

Path keyframes use the existing schema-1 track shape:

```js
const pathTimeline = createTimeline({
  version: 1,
  duration: 2,
  tracks: [{
    targetId: 'outline',
    property: 'path',
    keyframes: [
      { time: 0, value: 'M0 0L30 0Z', easeToNext: 'none' },
      { time: 2, value: 'M0 20L60 20Z' },
    ],
  }],
});

pathTimeline.evaluate(1)[0].value; // An absolute M/C/Z d string.
```

Creation parses and normalizes each path keyframe once, retaining its original
string separately. Evaluation interpolates compiled coordinates with the existing
easing rules; it never reparses path data. Exact keyframes, single-keyframe holds,
final holds, and intervals with identical endpoint strings return the original
string, including whitespace and command spelling. Other intermediate values use
absolute cubic commands. Results and geometry operations never mutate inputs or
share mutable output geometry with them.

Compatibility requires the same number of subpaths, the same cubic segment count
in each corresponding subpath, and matching open/closed flags. Mismatches throw
`TypeError` at creation, including on later transitions. Correspondence follows
input order: no subpath reordering, reversal, anchor alignment, segment equalization,
or automatic shape matching occurs. Equal command counts alone do not guarantee
compatibility, since arc conversion and implicit closing edges can add cubics.
Authors are responsible for meaningful vertex correspondence.

The public geometry helpers work without a timeline:

```js
import { parsePath, serializePath, pathAnchors, movePathAnchor } from 'motion-engine';

const geometry = parsePath('M0 0L30 0Z');
const anchor = pathAnchors(geometry)[0]; // { subpath: 0, index: 0, x: 0, y: 0 }
const edited = movePathAnchor(geometry, anchor, 5, 10);
const d = serializePath(edited);
```

- `parsePath(d)` returns an array of subpaths shaped as
  `{ start: [x, y], segments: [[c1x, c1y, c2x, c2y, endX, endY], ...], closed }`.
  Coordinates are absolute finite numbers. It supports `M/L/H/V/C/S/Q/T/A/Z`,
  uppercase/lowercase commands, repeated parameter groups, implicit lines after
  moveto, compact numbers, exponents, arc flags, and multiple subpaths.
- Lines and quadratics convert exactly to cubics. Elliptical arcs use the
  [SVG endpoint-to-center conversion](https://www.w3.org/TR/SVG/implnote.html#ArcConversionEndpointToCenter)
  and cubic approximations spanning at most a quarter turn each. Negative radii
  become positive, undersized radii expand, zero radii produce a line, and
  coincident arc endpoints produce no segment. Arc conversion is approximate;
  exact keyframes still use the original arc string.
- Closing a subpath adds a straight cubic only if its endpoint differs from its
  start. A closed subpath's final endpoint exactly equals its start. Drawing after
  `Z` begins a new subpath at that start point. Empty/whitespace-only strings return
  `[]`; move-only subpaths and explicit zero-length segments are retained.
- `serializePath(geometry)` emits absolute `M`, `C`, and `Z` commands without
  intentional rounding. It preserves normalized geometry and closure, not the
  original spelling. Serializing `[]` returns `''`.
- `pathAnchors(geometry)` returns fresh `{ subpath, index, x, y }` records. Indices
  are zero-based anchor ordinals: start is 0, the first cubic endpoint is 1, etc.
  Closed seams appear only once. Coincident endpoints of an open path remain
  distinct anchors; they are not implicitly closed. Unlike Motion Engine, the GSAP
  editor treats coincident open endpoints as joined for anchor enumeration and
  movement. Future integration testing must account for this intentional difference.
- `movePathAnchor(geometry, { subpath, index }, dx, dy)` returns a deep, independent
  geometry copy. It translates the anchor and its incoming/outgoing controls,
  including both seam endpoints and adjacent controls when closed. The duplicated
  final endpoint of a closed path is also accepted as an alias for anchor 0.
  A move-only path's sole anchor can be moved.

Malformed strings, malformed geometry, nonfinite coordinates (including arithmetic
overflow during normalization or movement), and nonnumeric deltas throw
`TypeError`. Invalid anchor index types throw `TypeError`; integer indices outside
the path throw `RangeError`. Parsing rejects malformed input as a whole rather than
rendering a valid prefix. Geometry uses JavaScript floating-point arithmetic.
Browser measurement, pointer handling, authoring UI, and SVG application remain
outside the core.

## Development

Use Node.js 22 or newer. No dependencies, installation step, or build step are
required.

Run the import smoke test and focused timeline/geometry/playback tests with Node's built-in runner:

```sh
npm test
```

`src/index.js` is the public entry point. Keep implementation modules in `src/`
and focused tests in `test/`. Use vanilla JavaScript ES modules and 2-space
indentation. Keep modules small, with clear responsibilities and explicit imports.

The GSAP Animation Editor is read-only reference material. Motion Lab benchmarks
are performance reference material. Do not copy editor code or modify either
reference project.

See [ROADMAP.md](ROADMAP.md) for release tasks and [AGENTS.md](AGENTS.md) for
contribution conventions.
