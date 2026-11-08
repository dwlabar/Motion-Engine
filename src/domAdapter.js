import { createTargetAdapter } from './targetAdapter.js';

export function saveStyle(style, key) {
  const value = style.getPropertyValue(key);
  const priority = style.getPropertyPriority(key);
  return () => {
    if (value) style.setProperty(key, value, priority);
    else style.removeProperty(key);
  };
}

export function svgCenter(target, computed) {
  const bounds = target.getBBox();
  const viewport = target.ownerSVGElement ?? target;
  const viewBox = viewport.viewBox?.baseVal;
  const viewportBounds = viewBox && viewBox.width > 0 && viewBox.height > 0 ? {
    x: 0, y: 0, width: viewBox.width, height: viewBox.height,
  } : {
    x: 0, y: 0, width: viewport.width?.baseVal?.value, height: viewport.height?.baseVal?.value,
  };
  let reference = bounds;
  if (!['fill-box', 'content-box'].includes(computed.transformBox)) {
    if (computed.transformBox === 'stroke-box' || computed.transformBox === 'border-box') {
      reference = target.getBBox({ stroke: true });
    } else {
      reference = viewportBounds;
    }
  }
  const parts = computed.transformOrigin.split(/\s+/);
  const origin = parts.slice(0, 2).map((part, index) => {
    const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(px|%)?$/.exec(part);
    if (!match) throw new TypeError('SVG transform origin must resolve to pixels or percentages.');
    const size = index === 0 ? reference.width : reference.height;
    return Number(match[1]) * (match[2] === '%' ? size / 100 : 1);
  });
  const x = bounds.x + bounds.width / 2 - viewportBounds.x;
  const y = bounds.y + bounds.height / 2 - viewportBounds.y;
  const ox = reference.x + origin[0] - viewportBounds.x;
  const oy = reference.y + origin[1] - viewportBounds.y;
  if (![x, y, ox, oy].every(Number.isFinite)) throw new TypeError('SVG bounds and origin must be finite.');
  return { x, y, ox, oy };
}

export function createDOMAdapter(targets, kind) {
  const namespaces = { html: 'http://www.w3.org/1999/xhtml', svg: 'http://www.w3.org/2000/svg' };
  return createTargetAdapter(targets, (target) => {
    if (!target || target.nodeType !== 1 || target.namespaceURI !== namespaces[kind]
      || !target.style || typeof target.ownerDocument?.defaultView?.getComputedStyle !== 'function'
      || (kind === 'svg' && typeof target.getBBox !== 'function')) {
      throw new TypeError(`Expected a ${kind.toUpperCase()} element with browser style/geometry APIs.`);
    }
    const style = target.style;
    const computed = target.ownerDocument.defaultView.getComputedStyle(target);
    const base = computed.transform === 'none' ? '' : computed.transform;
    const center = kind === 'svg' ? svgCenter(target, computed) : null;
    const restoreTransform = saveStyle(style, 'transform');
    const restoreOrigin = saveStyle(style, 'transform-origin');
    const restoreBox = saveStyle(style, 'transform-box');
    const restoreOpacity = saveStyle(style, 'opacity');
    const originalPath = kind === 'svg' ? target.getAttribute('d') : null;
    let transformed = false;
    let faded = false;
    let pathed = false;

    return {
      validate(property) {
        if (property === 'path' && (kind !== 'svg' || target.localName !== 'path')) {
          throw new TypeError('Path data requires an SVG path element.');
        }
      },
      apply(values) {
        const hasTransform = ['position', 'rotation', 'scale'].some((key) => values.has(key));
        if (hasTransform) {
          const { x, y } = values.get('position') ?? { x: 0, y: 0 };
          const rotation = values.get('rotation') ?? 0;
          const scale = values.get('scale') ?? 1;
          const motion = `rotate(${rotation}deg) scale(${scale})`;
          // Always compose from the captured baseline, never the previous frame.
          const transform = center
            ? `translate(${x}px, ${y}px) translate(${center.ox}px, ${center.oy}px) ${base} translate(${-center.ox}px, ${-center.oy}px) translate(${center.x}px, ${center.y}px) ${motion} translate(${-center.x}px, ${-center.y}px)`
            : `translate(${x}px, ${y}px) ${motion} ${base}`;
          if (center) {
            style.setProperty('transform-origin', '0px 0px', 'important');
            style.setProperty('transform-box', 'view-box', 'important');
          }
          style.setProperty('transform', transform.trim(), 'important');
        } else if (transformed) {
          restoreTransform();
          if (center) {
            restoreOrigin();
            restoreBox();
          }
        }
        transformed = hasTransform;

        if (values.has('opacity')) style.setProperty('opacity', String(values.get('opacity')), 'important');
        else if (faded) restoreOpacity();
        faded = values.has('opacity');

        if (values.has('path')) target.setAttribute('d', values.get('path'));
        else if (pathed) {
          if (originalPath === null) target.removeAttribute('d');
          else target.setAttribute('d', originalPath);
        }
        pathed = values.has('path');
      },
    };
  });
}
