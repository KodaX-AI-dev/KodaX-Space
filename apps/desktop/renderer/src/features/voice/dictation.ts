import { VOICE_MAX_SECONDS, type VoiceLanguage } from '@kodax-space/space-ipc-schema';

export interface Recording {
  stop(): Promise<Uint8Array>;
  cancel(): void;
}
export type DictationPhase = 'idle' | 'requesting' | 'recording' | 'transcribing';
interface DictationOptions {
  record(): Promise<Recording>;
  transcribe(pcm: Uint8Array, language: VoiceLanguage, requestId: string): Promise<string>;
  cancelTranscription(requestId: string): Promise<void>;
  onText(text: string): void;
  onState(phase: DictationPhase): void;
  onError(error: unknown): void;
}

/** One draft owns one controller. Cancelling invalidates every outstanding continuation. */
export class Dictation {
  private generation = 0;
  private recording: Recording | null = null;
  private requestId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private phase: DictationPhase = 'idle';
  private language: VoiceLanguage = 'zh';
  constructor(private readonly options: DictationOptions) {}

  private setPhase(phase: DictationPhase): void {
    this.phase = phase;
    this.options.onState(phase);
  }

  async start(language: VoiceLanguage): Promise<void> {
    if (this.phase !== 'idle') return;
    const generation = ++this.generation;
    this.language = language;
    this.setPhase('requesting');
    try {
      const recording = await this.options.record();
      if (generation !== this.generation) {
        recording.cancel();
        return;
      }
      this.recording = recording;
      this.setPhase('recording');
      this.timer = setTimeout(() => {
        void this.stop();
      }, VOICE_MAX_SECONDS * 1000);
    } catch (error) {
      if (generation !== this.generation) return;
      this.setPhase('idle');
      this.options.onError(error);
    }
  }

  async stop(): Promise<void> {
    if (this.phase !== 'recording' || !this.recording) return;
    const generation = this.generation;
    const recording = this.recording;
    clearTimeout(this.timer);
    this.setPhase('transcribing');
    try {
      const pcm = await recording.stop();
      if (generation !== this.generation) return;
      this.requestId = crypto.randomUUID();
      const text = await this.options.transcribe(pcm, this.language, this.requestId);
      if (generation === this.generation) {
        if (!text.trim()) throw new Error('voice.noSpeech');
        this.options.onText(text.trim());
      }
    } catch (error) {
      if (generation === this.generation) this.options.onError(error);
    } finally {
      recording.cancel();
      if (generation === this.generation) {
        this.recording = null;
        this.requestId = null;
        this.setPhase('idle');
      }
    }
  }

  cancel(): void {
    this.generation++;
    clearTimeout(this.timer);
    this.recording?.cancel();
    this.recording = null;
    if (this.requestId) {
      void this.options.cancelTranscription(this.requestId).catch(this.options.onError);
      this.requestId = null;
    }
    this.setPhase('idle');
  }
}
