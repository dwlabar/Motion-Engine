# Motion Engine conventions

- Build a standalone vanilla JavaScript ES module library.
- Use 2-space indentation and explicit imports and exports.
- Keep a modular architecture: small modules with focused responsibilities in
  `src/`, exposed through `src/index.js` as needed.
- Do not add runtime dependencies, bundlers, frameworks, or external test libraries.
- Use Node's built-in test runner and assertions. Keep tests in `test/`, focused
  on observable behavior relevant to the current task.
- Treat the GSAP Animation Editor as read-only reference material and Motion Lab
  benchmarks as performance reference material. Do not copy editor code or
  modify either reference project.
- Keep roadmap status current.
