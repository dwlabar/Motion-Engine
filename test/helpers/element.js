// Small host doubles exercise the DOM API boundary without a DOM dependency.
export function element(kind = 'html', localName = 'div', declarations = {}, attributes = {}, computed = {}) {
  const styles = new Map(Object.entries(declarations).map(([key, value]) => [key, [value, '']]));
  const attrs = new Map(Object.entries(attributes));
  const target = {
    nodeType: 1,
    namespaceURI: kind === 'svg' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml',
    localName,
    style: {
      getPropertyValue: (key) => styles.get(key)?.[0] ?? '',
      getPropertyPriority: (key) => styles.get(key)?.[1] ?? '',
      setProperty: (key, value, priority = '') => styles.set(key, [value, priority]),
      removeProperty: (key) => styles.delete(key),
    },
    getAttribute: (key) => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, value),
    removeAttribute: (key) => attrs.delete(key),
    getBBox: () => ({ x: 10, y: 20, width: 40, height: 60 }),
    ownerSVGElement: { viewBox: { baseVal: { x: 0, y: 0, width: 200, height: 100 } } },
    ownerDocument: { defaultView: { getComputedStyle: () => ({
      transform: declarations.transform ?? 'none', transformOrigin: '0px 0px',
      transformBox: 'view-box', ...computed,
    }) } },
  };
  return target;
}
