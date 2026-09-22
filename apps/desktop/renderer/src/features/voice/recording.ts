import { VOICE_MAX_SECONDS, VOICE_SAMPLE_RATE } from '@kodax-space/space-ipc-schema';
import type { Recording } from './dictation.js';

async function decodeRecording(blob: Blob): Promise<Uint8Array> {
  const context = new AudioContext();
  try {
    const source = await context.decodeAudioData(await blob.arrayBuffer());
    const length = Math.min(
      Math.floor(source.duration * VOICE_SAMPLE_RATE),
      VOICE_SAMPLE_RATE * VOICE_MAX_SECONDS,
    );
    if (length < 1600) throw new Error('voice.noSpeech');
    const offline = new OfflineAudioContext(1, length, VOICE_SAMPLE_RATE);
    const buffer = offline.createBufferSource();
    buffer.buffer = source;
    buffer.connect(offline.destination);
    buffer.start();
    const samples = (await offline.startRendering()).getChannelData(0);
    const bytes = new Uint8Array(samples.length * 2);
    const view = new DataView(bytes.buffer);
    let energy = 0;
    for (let i = 0; i < samples.length; i++) {
      const value = Math.max(-1, Math.min(1, samples[i]));
      energy += value * value;
      view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
    }
    if (Math.sqrt(energy / samples.length) < 0.002) throw new Error('voice.noSpeech');
    return bytes;
  } finally {
    await context.close();
  }
}

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    video: false,
  });
  const closeTracks = (): void => stream.getTracks().forEach((track) => track.stop());
  try {
    const recorder = new MediaRecorder(stream);
    let chunks: Blob[] = [];
    let cancelled = false;
    let failed = false;
    let size = 0;
    const finished = new Promise<void>((resolve) => {
      recorder.ondataavailable = (event) => {
        if (cancelled) return;
        size += event.data.size;
        if (size > 8 * 1024 * 1024) {
          failed = true;
          recorder.stop();
          closeTracks();
        } else chunks.push(event.data);
      };
      recorder.onerror = () => {
        failed = true;
        closeTracks();
        resolve();
      };
      recorder.onstop = () => {
        closeTracks();
        resolve();
      };
    });
    recorder.start(250);
    return {
      async stop() {
        if (recorder.state !== 'inactive') recorder.stop();
        closeTracks();
        await finished;
        if (failed || cancelled) throw new Error('voice.recordingFailed');
        const blob = new Blob(chunks, { type: recorder.mimeType });
        chunks = [];
        return decodeRecording(blob);
      },
      cancel() {
        cancelled = true;
        chunks = [];
        if (recorder.state !== 'inactive') recorder.stop();
        closeTracks();
      },
    };
  } catch (error) {
    closeTracks();
    throw error;
  }
}
