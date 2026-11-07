const easings = new Map([['none', (progress) => progress]]);

for (let power = 1; power <= 3; power += 1) {
  const exponent = power + 1;
  easings.set(`power${power}.in`, (progress) => progress ** exponent);
  easings.set(`power${power}.out`, (progress) => 1 - (1 - progress) ** exponent);
  easings.set(`power${power}.inOut`, (progress) => progress < 0.5
    ? (2 * progress) ** exponent / 2
    : 1 - (2 * (1 - progress)) ** exponent / 2);
}

export function validateEase(ease) {
  if (ease !== undefined && !easings.has(ease)) {
    throw new TypeError('Unsupported easing preset.');
  }
}

export function transitionEase(from, to) {
  return easings.get(from.easeToNext ?? to.ease ?? 'power1.out');
}
