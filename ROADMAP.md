# Motion Engine roadmap

## Release 0.1.0

| Task | Title | Status | Scope |
| --- | --- | --- | --- |
| T01 | Project Foundation | DONE | Initialize the standalone dependency-free ES module library, project structure, tests, and documentation. |
| T02 | Deterministic Timeline and Keyframe Evaluator | DONE | Implement independent property tracks, keyframe interpolation, overlapping animations, sequencing, duration handling, and deterministic evaluation at arbitrary times. |
| T03 | Transform Properties and Easing | DONE | Implemented position, scale, rotation, opacity, easing presets and precedence, validation, and independent snapshots/results. SVG center-origin semantics documented; DOM application remains T06. |
| T04 | SVG Path Geometry and Vertex Animation | DONE | Implemented dependency-free SVG command parsing into cubic subpaths, serialization, anchor editing with closed seams, and compatible path-track interpolation using existing easing. Original strings preserved at keyframes and holds; focused validation and boundary tests added. |
| T05 | Playback Controller | DONE | Implemented play, pause, seek, reverse, restart, configurable looping/direction, readable state, evaluated callbacks, and injectable elapsed-time frame scheduling. Focused playback and scheduling tests added; timeline evaluation remains unchanged. |
| T06 | Target Adapters | DONE | Implemented dependency-free SVG, HTML, and object adapters with snapshot application, baseline transform composition, fixed SVG center origins, validation, and restoration. Focused adapter/playback tests and desktop Edge geometry checks pass; review fixes completed. Core remains DOM-independent. |
| T07 | Dependency-Free Animation Export | DONE | Implemented standalone browser ES module output using shared engine functions, scoped SVG/HTML target resolution, paused playback/reset controls, precise safe serialization, generated-module parity tests, and a minimal SVG browser fixture. |
| T08 | Compatibility and Performance Verification | PLANNED (NEXT) | Verify animation behavior against the existing GSAP editor, including transforms, vertex animation, timeline accuracy, export, and focused desktop/mobile performance checks. |

## Scope restrictions

- No GSAP dependency.
- No React, Three.js, or runtime dependencies.
- Existing GSAP editor remains untouched. Do not copy editor code.
- Motion Lab benchmarks are reference material.
- Advanced automatic shape matching, motion paths, and unrelated GSAP features are deferred.
