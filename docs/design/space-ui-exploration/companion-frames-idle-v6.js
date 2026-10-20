// Full-character bitmap frames only: no rig, mesh, body-part transform or pose fade.
const STAGE = 256;
const MANIFEST = new URL('../assets/companion-dog-v6/frames.json', import.meta.url);

export class CompanionMotion {
  constructor(canvas, onTick = () => {}) {
    this.canvas = canvas;
    canvas.width = canvas.height = STAGE;
    this.context = canvas.getContext('2d');
    this.onTick = onTick;
    this.state = 'idle';
    this.time = 0;
    this.speed = 1;
    this.paused = false;
    this.reduced = false;
    this.frames = 0;
    this.meanRenderMs = 0;
    this.dirty = true;
    this.observers = new Set();
    this.lastIndex = -1;
    this.lastStep = -1;
    this.lastTimestamp = performance.now();
    this.ready = this.load();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  async load() {
    const response = await fetch(MANIFEST, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Frame manifest: ${response.status}`);
    const manifest = await response.json();
    const images = await Promise.all(
      Object.entries(manifest.clips).map(async ([state, clip]) => {
        const image = new Image();
        image.src = new URL(clip.src, MANIFEST).href;
        await image.decode();
        return [
          state,
          { ...clip, image, sequence: clip.sequence ?? clip.frames.map((_, index) => index) },
        ];
      }),
    );
    this.clips = Object.fromEntries(images);
    this.dirty = true;
  }

  hasClip(state) {
    return Boolean(this.clips?.[state]);
  }
  clipInfo(state = this.state) {
    return this.clips?.[state] ?? this.clips?.reference ?? this.clips?.idle;
  }
  get frameDuration() {
    return 1 / (this.clipInfo()?.fps || 12);
  }
  setState(state) {
    this.state = state;
    this.time = 0;
    this.lastIndex = -1;
    this.lastStep = -1;
    this.dirty = true;
  }
  setPaused(value) {
    this.paused = value;
    this.dirty = true;
  }
  setReduced(value) {
    if (this.reduced !== value) {
      this.reduced = value;
      this.dirty = true;
    }
  }
  setSpeed(value) {
    this.speed = value;
  }
  seek(value) {
    this.time = Math.max(0, value);
    this.dirty = true;
  }
  addObserver(canvas) {
    canvas.width = canvas.height = STAGE;
    this.observers.add(canvas);
    this.dirty = true;
  }
  removeObserver(canvas) {
    this.observers.delete(canvas);
  }

  frame(timestamp) {
    this.raf = requestAnimationFrame(this.frame);
    const elapsed = Math.min(0.1, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    const clip = this.clipInfo();
    if (!clip || document.hidden) return;
    if (!this.paused && !this.reduced && clip.fps) {
      this.time = (this.time + elapsed * this.speed) % (clip.sequence.length / clip.fps);
    }
    const step =
      this.reduced || !clip.fps
        ? 0
        : Math.floor(this.time * clip.fps + 1e-6) % clip.sequence.length;
    const index = clip.sequence[step];
    if (step === this.lastStep && index === this.lastIndex && !this.dirty) return;
    if (index !== this.lastIndex || this.dirty) {
      const start = performance.now();
      this.render(clip, index);
      this.meanRenderMs = this.meanRenderMs * 0.9 + (performance.now() - start) * 0.1;
      this.frames++;
    }
    this.lastIndex = index;
    this.lastStep = step;
    this.dirty = false;
    this.onTick({
      state: this.state,
      time: this.time,
      frames: this.frames,
      renderMs: this.meanRenderMs,
      paused: this.paused,
      reduced: this.reduced,
      sourceLabel: clip.label,
      sourceFrames: clip.frames.length,
      sourceFps: clip.fps,
      frameIndex: index,
      stepIndex: step,
      stepCount: clip.sequence.length,
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
    cancelAnimationFrame(this.raf);
    this.observers.clear();
  }
}
