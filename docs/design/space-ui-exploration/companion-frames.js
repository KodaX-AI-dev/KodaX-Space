// Whole bitmap cels only. Entries, held loops and settling paths are baked offline.
const STAGE = 256;
const requested = new URLSearchParams(globalThis.location?.search).get('animation');
const version = requested === 'previous' ? 'v9' : requested === 'v10' ? 'v10' : 'v11';
const MANIFEST = new URL(`../assets/companion-dog-${version}/frames.json`, import.meta.url);

export class CompanionMotion {
  constructor(canvas, onTick = () => {}) {
    this.canvas = canvas;
    canvas.width = canvas.height = STAGE;
    this.context = canvas.getContext('2d');
    this.onTick = onTick;
    this.state = 'idle';
    this.time = 0;
    this.elapsed = 0;
    this.speed = 1;
    this.paused = false;
    this.reduced = false;
    this.frames = 0;
    this.meanRenderMs = 0;
    this.dirty = true;
    this.observers = new Set();
    this.lastIndex = this.lastStep = -1;
    this.lastState = '';
    this.requestSerial = 0;
    this.transition = this.pendingState = null;
    this.pendingReady = false;
    this.lastTimestamp = performance.now();
    this.frame = this.frame.bind(this);
    this.visibilityChanged = () => this.wake();
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.ready = this.load().then(() => this.wake());
  }

  async load() {
    const response = await fetch(MANIFEST, { cache: 'no-store' });
    if (!response.ok) throw new Error('Frame manifest: ' + response.status);
    const manifest = await response.json();
    this.clips = Object.fromEntries(
      Object.entries(manifest.clips).map(([state, clip]) => [
        state,
        {
          ...clip,
          sequence: clip.sequence ?? clip.frames.map((_, index) => index),
        },
      ]),
    );
    await this.ensureImage('idle');
  }

  async ensureImage(state) {
    const clip = this.clips[state];
    if (clip.image) return clip.image;
    if (!clip.loading)
      clip.loading = (async () => {
        const image = new Image();
        image.decoding = 'async';
        image.src = new URL(clip.src, MANIFEST).href;
        await image.decode();
        clip.image = image;
        return image;
      })();
    try {
      return await clip.loading;
    } finally {
      delete clip.loading;
    }
  }

  hasClip(state) {
    return Boolean(this.clips?.[state]);
  }
  clipInfo(state = this.state) {
    return this.clips?.[state] ?? this.clips?.reference ?? this.clips?.idle;
  }
  get frameDuration() {
    const clip = this.clipInfo();
    return 1 / ((this.transition ? clip?.exitFps : clip?.fps) || clip?.fps || 24);
  }

  async setState(state, instant = false) {
    const target = this.hasClip(state) ? state : 'reference';
    if (target === this.state && !this.transition && !instant) return;
    const serial = ++this.requestSerial;
    this.pendingState = target;
    this.pendingReady = false;
    this.dirty = true;
    try {
      await this.ensureImage(target);
      if (serial !== this.requestSerial || this.destroyed) {
        this.trimImages();
        return;
      }
      this.pendingReady = true;
      if (instant || this.reduced || !this.clipInfo()?.image) this.activate(target);
      else if (!this.transition) this.beginExit();
      this.wake();
    } catch (error) {
      if (serial !== this.requestSerial || this.destroyed) return;
      this.pendingState = null;
      this.onTick({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  activate(state) {
    this.previousState = this.state;
    this.state = state;
    const clip = this.clipInfo();
    this.time = this.reduced && clip.fps ? (clip.reducedStep ?? 0) / clip.fps : 0;
    this.elapsed = 0;
    this.transition = this.pendingState = null;
    this.pendingReady = false;
    this.lastIndex = this.lastStep = -1;
    this.dirty = true;
    this.trimImages();
  }

  trimImages() {
    for (const [state, clip] of Object.entries(this.clips)) {
      if (![this.state, this.pendingState].includes(state)) delete clip.image;
    }
  }

  beginExit() {
    const sample = this.sample();
    const path = sample.clip.exitPaths?.[sample.step] ?? [sample.index, 0];
    if (path.length === 1 && path[0] === 0) {
      this.activate(this.pendingState);
      return;
    }
    this.transition = { path, time: 0 };
    this.dirty = true;
  }

  setPaused(value) {
    this.paused = value;
    this.dirty = true;
    this.wake();
  }
  setSpeed(value) {
    this.speed = value;
    this.wake();
  }
  setReduced(value) {
    if (this.reduced === value) return;
    this.reduced = value;
    if (value) {
      if (this.pendingReady) this.activate(this.pendingState);
      else {
        this.transition = null;
        const clip = this.clipInfo();
        this.time = clip?.fps ? (clip.reducedStep ?? 0) / clip.fps : 0;
      }
    }
    this.dirty = true;
    this.wake();
  }
  seek(value) {
    const clip = this.clipInfo();
    const end = clip?.fps ? (clip.sequence.length - 1) / clip.fps : 0;
    this.time = Math.max(0, Math.min(end, value));
    this.elapsed = this.time;
    this.dirty = true;
    this.wake();
  }
  addObserver(canvas) {
    canvas.width = canvas.height = STAGE;
    this.observers.add(canvas);
    this.dirty = true;
    this.wake();
  }
  removeObserver(canvas) {
    this.observers.delete(canvas);
  }

  advance(seconds) {
    const clip = this.clipInfo();
    if (this.transition) {
      this.transition.time += seconds;
      if (
        this.transition.time * (clip.exitFps ?? clip.fps) >= this.transition.path.length &&
        this.pendingReady
      )
        this.activate(this.pendingState);
      return;
    }
    if (!clip.fps) return;
    this.elapsed = (this.elapsed ?? 0) + seconds;
    const duration = clip.sequence.length / clip.fps;
    this.time += seconds;
    if (clip.once) this.time = Math.min(this.time, (clip.sequence.length - 1) / clip.fps);
    else if (this.time >= duration) {
      const start = (clip.loopStart ?? 0) / clip.fps;
      this.time = start + ((this.time - duration) % (duration - start));
    }
  }

  sample() {
    const clip = this.clipInfo();
    if (!clip) return null;
    if (this.transition) {
      const step = Math.min(
        this.transition.path.length - 1,
        Math.floor(this.transition.time * (clip.exitFps ?? clip.fps) + 1e-6),
      );
      return {
        clip,
        step,
        count: this.transition.path.length,
        index: this.transition.path[step],
        ended: false,
      };
    }
    const step = this.reduced
      ? (clip.reducedStep ?? 0)
      : !clip.fps
        ? 0
        : Math.min(clip.sequence.length - 1, Math.floor(this.time * clip.fps + 1e-6));
    return {
      clip,
      step,
      count: clip.sequence.length,
      index: clip.sequence[step],
      ended: Boolean(clip.once && step === clip.sequence.length - 1),
    };
  }

  schedule() {
    const clip = this.clipInfo();
    if (
      this.destroyed ||
      document.hidden ||
      this.paused ||
      this.reduced ||
      !clip?.image ||
      !clip.fps
    )
      return;
    if (this.sample().ended && !this.pendingState) return;
    const path = this.transition?.path ?? clip.sequence;
    const position = (this.transition?.time ?? this.time) / this.frameDuration;
    const step = Math.min(path.length - 1, Math.floor(position + 1e-6));
    let next = step + 1;
    while (next < path.length && path[next] === path[step]) next++;
    const delay = Math.max(4, (1000 * (next - position) * this.frameDuration) / this.speed);
    this.timer = setTimeout(() => this.frame(performance.now()), delay);
  }

  wake() {
    clearTimeout(this.timer);
    if (this.destroyed) return;
    this.lastTimestamp = performance.now();
    this.frame(this.lastTimestamp);
  }

  frame(timestamp) {
    const seconds = Math.max(0, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    if (!this.clipInfo()?.image || document.hidden) return;
    if (!this.paused && !this.reduced) this.advance(seconds * this.speed);
    const sample = this.sample();
    const same = sample.index === this.lastIndex && this.state === this.lastState;
    if (same && sample.step === this.lastStep && !this.dirty) {
      this.schedule();
      return;
    }
    if (!same || this.dirty) {
      const started = performance.now();
      this.render(sample.clip, sample.index);
      this.meanRenderMs = this.meanRenderMs * 0.9 + (performance.now() - started) * 0.1;
      this.frames++;
    }
    this.lastIndex = sample.index;
    this.lastStep = sample.step;
    this.lastState = this.state;
    this.dirty = false;
    this.emitTick(sample);
    this.schedule();
  }

  emitTick({ clip, step, count, index, ended }) {
    this.onTick({
      state: this.state,
      requestedState: this.pendingState ?? this.state,
      transitioning: Boolean(this.pendingState),
      time: this.time,
      elapsed: this.elapsed,
      duration: clip.fps ? clip.sequence.length / clip.fps : 0,
      ended,
      frames: this.frames,
      renderMs: this.meanRenderMs,
      paused: this.paused,
      reduced: this.reduced,
      sourceLabel: clip.label,
      sourceFrames: clip.frames.length,
      sourceFps: clip.fps,
      frameIndex: index,
      stepIndex: step,
      stepCount: count,
      actionPhase: this.transition
        ? 'settle'
        : clip.phases?.find((phase) => step >= phase.start && step <= phase.end)?.action,
    });
  }

  render(clip, index) {
    const frame = clip.frames[index];
    this.context.clearRect(0, 0, STAGE, STAGE);
    this.context.drawImage(clip.image, ...frame.source, ...frame.target);
    for (const canvas of this.observers) {
      if (!canvas.isConnected || !canvas.getClientRects().length) continue;
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, STAGE, STAGE);
      context.drawImage(this.canvas, 0, 0);
    }
  }
  destroy() {
    this.destroyed = true;
    this.requestSerial++;
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.observers.clear();
  }
}
