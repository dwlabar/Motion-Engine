import { compileTimeline } from './compileTimeline.js';
import { createTimeline } from './timeline.js';
import { createPlaybackController } from './playbackController.js';
import { createEasings, validateEase, transitionEase } from './easing.js';
import { validateProperty, snapshotValue, interpolateNumber, interpolateValue } from './properties.js';
import { arcToCubics } from './pathArc.js';
import { parsePath } from './parsePath.js';
import { validatePath, serializeCubics } from './pathGeometry.js';
import { validatePathCompatibility, interpolatePath } from './pathInterpolation.js';
import { createTargetAdapter } from './targetAdapter.js';
import { saveStyle, svgCenter, createDOMAdapter } from './domAdapter.js';
import { createAnimationInstance } from './animationInstance.js';

// Explicit closure dependencies for the unbundled ES modules. Emit the actual
// engine functions, never a separately maintained copy of their algorithms.
// Keep this list in sync when these functions gain module-level dependencies.
export function exportRuntime() {
  const functions = [
    createEasings, validateEase, transitionEase,
    validateProperty, snapshotValue, interpolateNumber, interpolateValue,
    arcToCubics, parsePath, validatePath, serializeCubics,
    validatePathCompatibility, interpolatePath, compileTimeline, createTimeline,
    createPlaybackController, createTargetAdapter, saveStyle, svgCenter,
    createDOMAdapter, createAnimationInstance,
  ];
  return functions.map((fn) => Function.prototype.toString.call(fn)).join('\n\n')
    + '\n\nconst easings = createEasings();\n';
}
