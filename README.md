# Motion Engine

A standalone vanilla JavaScript ES module library. Version 0.1.0 is private and
in development. The timeline core evaluates numeric property tracks at arbitrary
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
timeline.evaluate(1); // [{ targetId: 'box', property: 'opacity', value: 0.5 }]
```

Times are absolute seconds. Evaluation clamps finite times to `[0, duration]`,
omits tracks before their first keyframe, and holds their final value afterward.
Empty tracks produce no results; a single keyframe holds from its timestamp.
Results follow input track order and each call returns a fresh array and records.

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

T02 supports finite numeric values with linear interpolation and preserves exact
keyframe values at their timestamps. Optional easing metadata (`easeToNext` and
legacy `ease`) is accepted but ignored until T03. Object/transform and path
values are rejected until their interpolation is implemented in T03/T04.

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
