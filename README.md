# Motion Engine

A standalone vanilla JavaScript ES module library. Version 0.1.0 is private and
in development. The timeline core evaluates transform and opacity tracks at arbitrary
times without a DOM, browser clock, or playback controller.

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

Exact keyframe values are preserved at their timestamps. Unsupported properties,
malformed values, and unsupported easing throw `TypeError` at creation.
Path interpolation is deferred to T04.

Each segment uses its starting keyframe's `easeToNext`, otherwise its ending
keyframe's legacy `ease`, otherwise `power1.out`. Supported presets are `none`
(linear), and `power1`, `power2`, `power3` with `.in`, `.out`, or `.inOut`.
These power families use quadratic, cubic, and quartic curves respectively.
Easing fields may be omitted or `undefined`; other values must name a supported
preset, even when overridden or on an unused endpoint. Set `easeToNext: 'none'`
on a segment's starting keyframe for the linear behavior used in T02.
Both coordinates of a position segment use the same eased progress.

SVG transform semantics follow the editor reference: position represents x/y
translation in SVG user units; uniform scale and rotation act around the SVG
element's bounding-box center, not the SVG viewport origin. Values describe
individual transform properties rather than baked geometry or transform matrices.
The core only evaluates data: bounding-box measurement, transform composition,
and application to SVG/DOM targets remain the responsibility of T06 adapters.

## Development

Use Node.js 22 or newer. No dependencies, installation step, or build step are
required.

Run the import smoke test and focused timeline tests with Node's built-in runner:

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
