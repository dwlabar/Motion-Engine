# T08 compatibility and performance verification

Status: DONE. Verified 2026-11-08; Motion Engine remains 0.1.0.
No confirmed engine correctness defects were found; no runtime changes or
optimizations were made. The existing 78 Node tests pass.

## Reproduce

From the Motion Engine repository, with Node 22+ and an installed Chromium browser:

```powershell
npm.cmd test
node test/verification/run.mjs
# Optional: save the full machine-readable report outside the source tree.
node test/verification/run.mjs "$env:TEMP/motion-engine-t08.json"
git diff --check
```

The optional browser runner uses only Node built-ins and the browser's DevTools
protocol. By default it launches installed Windows Edge headlessly, serves local
modules on a temporary loopback port, and reads the sibling
`../gsap-animation-editor` repository. Override `BROWSER_PATH` and
`GSAP_EDITOR_PATH` through environment variables when needed. It requires the
editor's existing `node_modules/gsap`; it installs nothing and writes nothing to
the editor. It removes its own temporary browser profile after the run.

The runner executes the existing adapter and standalone export fixtures, followed
by the compatibility/performance fixture, in both profiles. Unexpected compatibility
failures produce a nonzero exit code. The explicitly labeled baseline-transform
observation records a known semantic difference rather than requiring parity.
Performance results are measurements, not machine-independent pass/fail thresholds.

## Environment and reference

- Windows 10 build 19045; Intel Core i9-9900K at 3.60 GHz, 16 logical processors;
  Node v24.21.0; headless Edge 157.0.4341.42 / V8 15.7.11.4.
- Desktop: 1280 × 800 viewport, DPR 1, no CPU throttling, touch disabled.
- Mobile emulation: 390 × 844 viewport, DPR 3, five touch points, DevTools 4× CPU
  throttling. Same desktop browser/UA and hardware, not an Android or iOS device.
- Engine baseline: `421ee74` (`Add standalone animation export`). Editor reference:
  `25f618c6901163e92b590b4fd192778f1edfbc9c`, installed GSAP/MorphSVG 3.13.0.
  Its working tree was clean before and after verification.
- Reference modules are served directly without copying or rewriting:
  `src/utility/buildGsapTimeline.js`, `trackValueProps.js`, `keyframeEasing.js`,
  and `pathGeometry.js`. This exercises actual editor playback construction and
  geometry helpers; it does not automate the React authoring UI.
- Read-only Motion Lab references:
  `../davidlabar/public/sandbox/motion-lab/benchmark-01.html` and
  `benchmark-02.html`. Reused their workload categories and separation of JS
  update cost from frame pacing, with independently generated eight-cubic paths.
  Their WAAPI/motion-path cases and CDN GSAP 3.15.0 benchmark were not run or copied.

## Compatibility findings

Both browser profiles produced the same compatibility errors. Every required
parity check and both pre-existing browser fixtures passed.

| Check | Observed maximum absolute error | Acceptance tolerance |
| --- | ---: | ---: |
| Ten supported easing functions, 101 samples each | 0 | 1e-12 |
| Interior vertex and closed seam movement, including adjacent controls | 0 | 1e-9 user units |
| SVG transform matrix components across parity cases | 0.002001 | 0.005 |
| Computed opacity | 0.00004 | 0.0001 |
| Compatible morph, unrounded GSAP coordinates | 4.81e-11 | 1e-7 user units |
| Compatible morph, serialized SVG coordinates | 0.010000000000002 | 0.010001 user units |
| Clamped reference timeline time | 0 | 1e-7 seconds |

The browser suite samples 22 timeline cases at 18 ordered and out-of-order seek
positions each, including before the first keyframe, exact keys, just after a key,
mid-segment, repeated-value holds, final holds, and both out-of-range boundaries.
It covers position, rotation, uniform positive/negative scale, opacity, all easing
presets, outgoing/legacy/default easing precedence, staggered property timing,
single-keyframe holds, unwrapped 350° → 10° rotation, nested translated/rotated/
nonuniformly scaled parents, and compatible cubic vertex morphs with transforms.
Matrix tolerances apply to these scene sizes; they are not universal pixel-error
bounds for arbitrarily large origins, coordinates, or ancestor scales.

The existing standalone export browser fixture checks paused creation, arbitrary
seeks, path/opacity/geometry parity, real animation-frame playback, and baseline
restoration on reset. The Node suite additionally verifies injected-clock playback,
reverse, loop overshoot, boundary stopping, callback behavior, reset cancellation,
and dependency-free generated-module parity. Browser timing is checked through
seeks and normal frame playback, not a long-running clock-drift experiment.
The T08 fixture also plays an exported module inside an active morph segment,
checks that browser frames change the path, resets while running, and verifies
that later frames neither advance the clock nor disturb the restored baseline.

### Significant differences and intentional limitations

- **Baseline target transforms are not interchangeable.** Motion Engine composes
  animation with the captured baseline. GSAP animates decomposed channels, replacing
  their original values. With a nested parent and a target baseline of
  `translate(8 6) rotate(20) scale(1.3)`, the maximum matrix-component difference
  was **52.978631**. Even simple baseline translation illustrates the distinction:
  animating position x=0 retains the engine's original translation, while GSAP's
  x channel becomes zero. This follows the documented adapter contract; no attempt
  was made to change it into GSAP's transform model.
- **Serialized precision differs.** Installed CSSPlugin rounds interpolated
  channels to four decimal places before composing SVG matrices; scale rounding
  is amplified by the 40-unit origin and parent transforms. MorphSVG defaults to
  precision 2 and truncates intermediate path coordinates. Its unrounded path
  data agrees with engine interpolation. Motion Engine retains floating-point
  precision and original strings at exact keys/holds; command spelling and path
  strings need not match. The path tolerance was raised from 0.001 only after
  verifying this behavior in the installed plugin and comparing unrounded data.
- **Vertex indexing differs.** Engine indices count anchors; editor raw-path
  indices step by six coordinates. Closed seam movement agrees after mapping.
  Coincident open endpoints remain two independent engine anchors; the editor
  exposes one joined anchor. Both behaviors were checked directly.
- **Path correspondence is deliberately limited.** Matching subpath/segment
  counts and closure are required; no automatic reordering, reversal, equalization,
  or shape matching is provided. Cubic interpolation was compared here. Arc
  approximation and incompatible topology remain covered by existing engine
  tests, not an exhaustive MorphSVG equivalence study.
- **Export contracts differ.** Source inspection confirms the editor's raw exporter
  emits GSAP-dependent code and defaults to three-decimal timing serialization.
  Motion Engine emits a self-contained module with full numeric precision and
  explicit reset. The editor's generated exporter output was not executed here.
- SVG centers stay fixed to their measured baseline. Dynamic remeasurement,
  competing CSS writers, nonuniform animation scale, skew/3D channels, motion
  paths, and other unsupported GSAP features remain outside scope. No editor
  integration or engine-agnostic layer was introduced; a future Motion Editor
  remains a separate copy of the existing editor.

## Performance

Setup, parsing/compilation at creation, adapter capture, and snapshot preparation
are excluded. Evaluation measures `timeline.evaluate()` alone, consuming its
output. Application measures `adapter.apply()` on 60 precomputed changing
snapshots, including validation, grouping, and path reparsing. It does not force
layout or include later rendering work. Each phase has 100 warmup operations,
then 25 batches of 40 operations; reported median/p95 are per-operation batch
averages, not individual-call latency percentiles.

The separate animation-frame run evaluates and applies once per frame on attached,
visible SVG elements. Each static/animated case warms up for 20 frames then records
120 frame intervals and JS update durations. Rendering/scheduling effects appear
in frame intervals; JS duration is not a complete paint/GPU cost measurement.
Each workload uses two keyframes over two seconds with linear easing.

One final verification run; all values below are milliseconds, median / p95:

| Profile and workload | Evaluate only | Apply only | Per-frame evaluate + apply | Animated frame interval |
| --- | ---: | ---: | ---: | ---: |
| Desktop, 100 targets / 400 transform-opacity tracks | 0.018 / 0.025 | 0.438 / 0.533 | 0.500 / 0.700 | 16.7 / 16.8 |
| Desktop, 40 paths / 320 cubic segments | 0.123 / 0.238 | 0.410 / 0.415 | 0.600 / 0.800 | 16.7 / 16.8 |
| Mobile emulation, 100 targets / 400 tracks | 0.080 / 0.185 | 2.168 / 2.983 | 6.200 / 7.600 | 16.7 / 16.9 |
| Mobile emulation, 40 paths / 320 cubic segments | 0.518 / 0.898 | 1.863 / 2.450 | 6.000 / 7.400 | 16.7 / 16.8 |

Static-baseline frame intervals were 16.7 / 16.8 ms, except mobile transforms at
16.7 / 16.9 ms. No measured
animated interval exceeded 33 ms. Batched application and per-frame combined costs
have different scheduling/GC/rendering conditions and should not be added to infer
frame latency.

DOM application costs more than evaluation in these fixtures; path application
includes the adapter's existing validation parse on every snapshot. This is an
observation, not authorization for optimization. No performance regression budget
or cross-engine speed claim can be established from this single-machine run.

## Remaining checks and limits

- Physical Android/iOS performance, Safari/WebKit, Firefox, headed visual review,
  touch interaction, sustained thermal/battery behavior, and long-running memory
  or clock-drift tests were not performed. Mobile emulation cannot establish them.
- Short headless measurements are affected by timer resolution, JIT/GC, host load,
  and DevTools throttling. No statistical confidence interval or hardware-wide
  smoothness guarantee is implied. Workloads do not establish maximum capacity.
- No unsupported-feature implementation or unrelated optimization is needed for
  this review. The documented target-baseline semantics are a compatibility limit
  for any future migration, not a blocker to completing the requested T08 checks.
