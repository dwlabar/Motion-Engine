# Motion Engine roadmap

## Release 0.1.0

| Task | Title | Status | Scope |
| --- | --- | --- | --- |
| T01 | Project Foundation | DONE | Initialize the standalone dependency-free ES module library, project structure, tests, and documentation. |
| T02 | Deterministic Timeline and Keyframe Evaluator | DONE | Implement independent property tracks, keyframe interpolation, overlapping animations, sequencing, duration handling, and deterministic evaluation at arbitrary times. |
| T03 | Transform Properties and Easing | DONE | Implemented position, scale, rotation, opacity, easing presets and precedence, validation, and independent snapshots/results. SVG center-origin semantics documented; DOM application remains T06. |
| T04 | SVG Path Geometry and Vertex Animation | DONE | Implemented dependency-free SVG command parsing into cubic subpaths, serialization, anchor editing with closed seams, and compatible path-track interpolation using existing easing. Original strings preserved at keyframes and holds; focused validation and boundary tests added. |
| T05 | Playback Controller | PLANNED (NEXT) | Implement play, pause, seek, reverse, restart, and loop with accurate elapsed-time scheduling and playhead synchronization. |
| T06 | Target Adapters | PLANNED | Apply evaluated values to SVG elements, DOM elements, and generic JavaScript objects. Keep the core independent of the DOM. |
| T07 | Dependency-Free Animation Export | PLANNED | Support standalone JavaScript animation output without GSAP or external runtime dependencies. |
| T08 | Compatibility and Performance Verification | PLANNED | Verify animation behavior against the existing GSAP editor, including transforms, vertex animation, timeline accuracy, export, and focused desktop/mobile performance checks. |

## Scope restrictions

- No GSAP dependency.
- No React, Three.js, or runtime dependencies.
- Existing GSAP editor remains untouched. Do not copy editor code.
- Motion Lab benchmarks are reference material.
- Advanced automatic shape matching, motion paths, and unrelated GSAP features are deferred.
