# Motion Engine

A standalone vanilla JavaScript ES module library. Version 0.1.0 is private and
in development. The timeline core evaluates transform, opacity, and SVG path tracks
at arbitrary times without a DOM or browser clock. An optional playback controller
adds elapsed-time scheduling. Optional target adapters apply evaluated snapshots
to HTML, SVG, or JavaScript objects without adding DOM dependencies to the core.

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
and application to SVG/DOM targets are handled by the optional target adapters.

## Target adapters

```js
import { createSVGAdapter, createPlaybackController } from 'motion-engine';

const adapter = createSVGAdapter({ outline: document.querySelector('#outline') });
adapter.apply(pathTimeline.evaluate(1));

const playback = createPlaybackController(pathTimeline, {
  onUpdate: (_time, values) => adapter.apply(values),
});
playback.seek(0);
playback.pause();
adapter.reset();
```

`createSVGAdapter(targets)`, `createHTMLAdapter(targets)`, and
`createObjectAdapter(targets)` accept a `Map` or an object keyed by `targetId`.
Mappings are copied at creation; IDs must be nonempty strings and each target
must have one ID per adapter. Each factory returns `{ apply, reset }`.

- All adapters support `position`, uniform `scale`, `rotation`, and `opacity`.
  SVG `path` values write the `d` attribute and require a `<path>` element.
  Object adapters write the five schema properties directly (including `path`),
  copying position values; they accept writable data properties and extensible
  objects, and reject DOM elements and accessor properties.
- `apply(results)` takes the array returned by `timeline.evaluate()`. Each call
  is a complete snapshot: previously applied properties absent from the array
  restore their original values. Seeking before the first keyframe therefore
  clears later animation state. Unrelated target IDs are ignored, so the same
  mixed-target evaluation can be passed directly to separate adapters. For matched
  targets, duplicate properties, invalid values, malformed paths, and invalid
  target/property combinations throw `TypeError` before writes.
- Creation captures original values, computed transforms, and SVG bounds. HTML
  transforms compose as `translate(position) rotate(rotation) scale(scale) base`,
  retaining the existing CSS transform origin. SVG transforms compose as
  `translate(position) base rotate/scale-about-center`, accounting for the base's
  original CSS origin. Transform functions apply right to left. Position uses
  CSS pixels for HTML and user units for SVG. SVG scale/rotation use the original
  bounding-box center, held fixed even while path data changes. Missing transform
  channels use zero translation/rotation and scale one.
- DOM adapters preserve original transform attributes, unrelated styles, and
  existing computed transforms (including stylesheet rules). They temporarily
  write inline `transform` and `opacity` with `!important`; SVG transforms also
  temporarily use a zero origin and `view-box` reference box with the original
  origin included in the composed transform. Repeated application always starts
  from the captured baseline, never the previous frame.
- `reset()` restores original inline declarations and priorities, original `d`
  values or absence, and object property descriptors or absence. It is safe to
  call repeatedly. It does not pause a playback controller; pause before reset
  if playback should stop applying values.

Create DOM adapters after targets are mounted and measurable. SVG targets need
`getBBox()` and DOM targets need their document's `getComputedStyle()`. Adapters
do not remeasure layout, react to stylesheet changes, or coordinate concurrent
CSS animations/transitions or other writers on the same properties. Recreate an
adapter after resetting it when the baseline changes. SVG stroke-box measurement
depends on the host's `getBBox({ stroke: true })` support. The timeline and playback
controller remain usable in Node without DOM globals.

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

## Standalone JavaScript export

`exportAnimation(model)` validates and snapshots a schema-1 model and returns
the source of a self-contained browser ES module. Save the string as a `.js`
file; it has no imports, dependencies, or dynamic code evaluation.

```js
import { exportAnimation } from 'motion-engine';
const source = exportAnimation(model); // Save as animation.js.
```

In the destination page:

```js
import { createAnimation } from './animation.js';
const animation = createAnimation(document.querySelector('#stage'), { loop: true });
animation.play();
animation.pause();
animation.seek(1.5);
animation.reset();
```

Creation starts paused without applying values, using the same playback options,
controls, and live `state` snapshots documented above. `onUpdate(time, values)` runs
after DOM application; clock/frame injection is also supported. Target IDs match
exact `id` attributes on the supplied SVG/HTML root or its descendants, including
mixed HTML/SVG content. Missing or ambiguous IDs and invalid path targets throw
at creation; empty tracks need no target. Targets must be mounted and measurable.

`reset()` pauses and restores captured styles and paths without an update callback.
It retains the sampled time, direction, and loop setting; `play()` resumes there,
and `restart()` plays from the direction's starting boundary. Separate instances
capture independent baselines. Exported animation uses the existing engine
functions, preserving easing, paths, holds, timing, and full numeric precision.
Strings are escaped for safe module embedding, and negative zero is retained.

Serve the repository over HTTP and open `test/exportAnimation.browser.html` for
the minimal SVG fixture and browser checks.

## Development

Use Node.js 22 or newer. No dependencies, installation step, or build step are
required.

Run the import smoke test and focused timeline/geometry/playback/adapter tests with Node's built-in runner:

```sh
npm test
```

Run adapter tests alone with `node --test test/targetAdapters.test.js`. The DOM
unit tests use small host doubles. Serve the repository with any static server
and open `test/targetAdapters.browser.html` for real-browser transform/center/reset
checks; its report should read `PASS`. These checks follow the
[CSS transform reference-box rules](https://www.w3.org/TR/css-transforms/#transform-box).
The fixture has been checked in desktop Edge; other browsers and mobile remain
part of T08 compatibility verification.

`src/index.js` is the public entry point. Keep implementation modules in `src/`
and focused tests in `test/`. Use vanilla JavaScript ES modules and 2-space
indentation. Keep modules small, with clear responsibilities and explicit imports.

The GSAP Animation Editor is read-only reference material. Motion Lab benchmarks
are performance reference material. Do not copy editor code or modify either
reference project.

See [ROADMAP.md](ROADMAP.md) for release tasks and [AGENTS.md](AGENTS.md) for
contribution conventions.
