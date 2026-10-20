import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { animations } from './animations.mjs';
import { sequenceFromKeys, packAtlas, nearestAnchorPath } from './frame-data.mjs';

const root = new URL('.', import.meta.url);
const review = new URL('../../../../artifacts/companion-states-v11/', root);
const tool = new URL('../companion-working-v10/tools/rife-ncnn-vulkan-20221029-windows/', review);
const definitions = await animations();

async function buildState(state, definition) {
  const pool = { cels: [], ids: new Map() }, work = new URL(state + '/main/', review);
  const main = await sequenceFromKeys(definition.keys, work, tool, root, pool,
    state !== 'working' && state !== 'complete', state === 'working', state === 'complete');
  const { sequence, keyStarts, phases } = main;
  let release;
  if (definition.release)
    release = await sequenceFromKeys(definition.release, new URL(state + '/release/', review),
      tool, root, pool, true);
  const exitPaths = sequence.map((id, step) => {
    if (release) {
      if (step < keyStarts[definition.loopKey]) return nearestAnchorPath(sequence, step, sequence[0]);
      return [...nearestAnchorPath(sequence, step, release.sequence[0]), ...release.sequence.slice(1)];
    }
    if (state === 'idle' || state === 'thinking') return nearestAnchorPath(sequence, step, sequence[0]);
    return id === sequence[0] ? [id] : sequence.slice(step).filter((cel, i, path) => !i || cel !== path[i - 1]);
  });
  const src = state + '-atlas.webp', packed = await packAtlas(pool.cels, new URL(src, root));
  const clip = { label: definition.label, description: definition.description, src, fps: 24,
    frames: packed.frames, sequence, phases, once: Boolean(definition.once),
    loopStart: keyStarts[definition.loopKey ?? 0], reducedStep: keyStarts[definition.reducedKey ?? 0],
    exitFps: 30, exitPaths };
  const report = { state, keyposes: new Set([...definition.keys, ...(definition.release ?? [])].map(key => key.file)).size,
    completeFrames: pool.cels.length, steps: sequence.length, duration: sequence.length / 24,
    maxExitSeconds: Math.max(...exitPaths.map(path => path.length)) / 30, ...packed };
  delete report.frames;
  await writeFile(new URL(state + '-report.json', review), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report) + '\n');
  return clip;
}

await mkdir(review, { recursive: true });
const previous = JSON.parse(await readFile(new URL('../companion-dog-v10/frames.json', root)));
const requested = process.argv.slice(2);
const clips = requested.length ? JSON.parse(await readFile(new URL('frames.json', root))).clips
  : { reference: { ...previous.clips.reference, src: '../companion-dog-v10/' + previous.clips.reference.src } };
for (const state of requested.length ? requested : Object.keys(definitions)) {
  if (!definitions[state]) throw new Error('Unknown animation: ' + state);
  clips[state] = await buildState(state, definitions[state]);
}
await writeFile(new URL('frames.json', root), JSON.stringify({ clips }, null, 2));
