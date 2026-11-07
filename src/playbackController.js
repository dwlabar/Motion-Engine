export function createPlaybackController(timeline, {
  loop = false,
  direction = 1,
  onUpdate = () => {},
  now = () => globalThis.performance.now(),
  requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
  cancelFrame = (id) => globalThis.cancelAnimationFrame(id),
} = {}) {
  if (!timeline || !Number.isFinite(timeline.duration) || timeline.duration < 0 ||
      typeof timeline.evaluate !== 'function') {
    throw new TypeError('A timeline with a finite nonnegative duration and evaluate() is required.');
  }
  if (typeof loop !== 'boolean' || (direction !== 1 && direction !== -1)) {
    throw new TypeError('Loop must be boolean and direction must be 1 or -1.');
  }
  if ([onUpdate, now, requestFrame, cancelFrame].some((value) => typeof value !== 'function')) {
    throw new TypeError('The update callback, clock, and frame schedulers must be functions.');
  }

  const duration = timeline.duration;
  let time = direction === 1 ? 0 : duration;
  let playing = false;
  let lastTime;
  let pending = null;

  function stop() {
    playing = false;
    if (pending !== null) {
      const { id } = pending;
      pending = null;
      cancelFrame(id);
    }
  }

  function emit() {
    try {
      onUpdate(time, timeline.evaluate(time));
    } catch (error) {
      stop();
      throw error;
    }
  }

  function atEnd() {
    return duration === 0 || (!loop && (direction === 1 ? time === duration : time === 0));
  }

  function advance() {
    const current = now();
    const elapsed = Math.max(0, current - lastTime) / 1000;
    lastTime = current;
    const next = time + elapsed * direction;
    if (loop && duration > 0 && elapsed > 0) {
      const remainder = next % duration;
      time = remainder < 0 ? remainder + duration : remainder === 0 ? 0 : remainder;
    } else {
      time = Math.max(0, Math.min(next, duration));
    }
    if (atEnd()) stop();
  }

  function schedule() {
    if (!playing || pending !== null) return;
    const frame = {};
    pending = frame;
    try {
      frame.id = requestFrame(() => {
        // Ignore a canceled callback even if its scheduler still delivers it.
        if (pending !== frame) return;
        pending = null;
        advance();
        emit();
        schedule();
      });
    } catch (error) {
      pending = null;
      playing = false;
      throw error;
    }
  }

  function play() {
    if (playing) return;
    lastTime = now();
    playing = !atEnd();
    emit();
    schedule();
  }

  function pause() {
    if (!playing) return;
    advance();
    stop();
    emit();
  }

  function seek(value) {
    if (!Number.isFinite(value)) throw new TypeError('Seek time must be a finite number.');
    time = Math.max(0, Math.min(value, duration));
    if (playing) {
      lastTime = now();
      if (atEnd()) stop();
    }
    emit();
  }

  function reverse() {
    const wasPlaying = playing;
    if (playing) advance();
    direction *= -1;
    playing = wasPlaying && !atEnd();
    if (!playing) stop();
    emit();
    schedule();
  }

  function restart() {
    stop();
    time = direction === 1 ? 0 : duration;
    play();
  }

  function setLoop(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Loop must be boolean.');
    loop = enabled;
  }

  return Object.freeze({
    play, pause, seek, reverse, restart, setLoop,
    get state() {
      return Object.freeze({ time, duration, playing, direction, loop });
    },
  });
}
