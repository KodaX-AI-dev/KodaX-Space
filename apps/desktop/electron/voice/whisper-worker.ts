import { createRequire } from 'node:module';
import { join } from 'node:path';
import { availableParallelism } from 'node:os';
import { voiceRequestSchema } from '@kodax-space/space-ipc-schema';

interface NativeContext {
  transcribeData(
    pcm: ArrayBuffer,
    options: {
      language: string;
      translate: false;
      maxThreads: number;
      prompt?: string;
    },
  ): { promise: Promise<{ result: string; isAborted: boolean }> };
  release(): Promise<void>;
}
interface NativeModule {
  WhisperContext: {
    new (options: { filePath: string; useGpu: boolean }): NativeContext;
    toggleNativeLog(enabled: boolean): void;
  };
}

// This process has no network actions. The trusted parent supplies verified local paths.
let context: NativeContext | undefined;
process.parentPort.on('message', async ({ data }: { data: unknown }) => {
  try {
    const input = data as { directory: string; request?: unknown };
    const req = createRequire(join(input.directory, 'loader.cjs'));
    const native = req(join(input.directory, 'whisper.node')) as NativeModule;
    native.WhisperContext.toggleNativeLog(false);
    context ??= await new native.WhisperContext({
      filePath: join(input.directory, 'model.bin'),
      useGpu: false,
    });
    let text = '';
    if (input.request !== undefined) {
      const request = voiceRequestSchema.parse(input.request);
      const result = await context.transcribeData(new Uint8Array(request.pcm).buffer, {
        language: request.language,
        translate: false,
        maxThreads: Math.min(4, availableParallelism()),
        ...(request.language === 'zh' ? { prompt: '以下是普通话简体中文。' } : {}),
      }).promise;
      if (result.isAborted || typeof result.result !== 'string' || result.result.length > 8000) {
        throw new Error('Invalid transcription');
      }
      text = result.result.trim();
    }
    process.parentPort.postMessage({ ok: true, text });
  } catch {
    // No audio, transcript, native diagnostics or user paths enter application logs.
    process.parentPort.postMessage({ ok: false });
    if (context) await context.release();
    process.exit(1);
  }
});
