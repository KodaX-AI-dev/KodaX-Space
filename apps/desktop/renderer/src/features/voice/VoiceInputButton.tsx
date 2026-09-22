import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.js';
import { Dictation, type DictationPhase } from './dictation.js';
import { startRecording } from './recording.js';
import { readVoiceLanguage, VoiceSettingsPanel } from './VoiceSettingsPanel.js';

export function VoiceInputButton({
  onText,
  disabled = false,
}: {
  readonly onText: (text: string) => void;
  readonly disabled?: boolean;
}): JSX.Element {
  const { t } = useI18n();
  const [phase, setPhase] = useState<DictationPhase>('idle');
  const [checking, setChecking] = useState(false);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const mounted = useRef(true);
  const startGeneration = useRef(0);
  const insert = useRef(onText);
  insert.current = onText;
  const controller = useRef<Dictation | null>(null);
  if (!controller.current)
    controller.current = new Dictation({
      record: startRecording,
      transcribe: async (pcm, language, requestId) => {
        if (!window.kodaxSpace) throw new Error('Desktop bridge unavailable');
        const result = await window.kodaxSpace.invoke('voice.transcribe', {
          pcm: new Uint8Array(pcm),
          language,
          requestId,
        });
        if (!result.ok || result.data.requestId !== requestId)
          throw new Error('voice.recognitionFailed');
        return result.data.text;
      },
      cancelTranscription: async (requestId) => {
        if (!window.kodaxSpace) throw new Error('Desktop bridge unavailable');
        const result = await window.kodaxSpace.invoke('voice.cancelTranscription', { requestId });
        if (!result.ok) throw new Error('voice.recognitionFailed');
      },
      onState: (value) => {
        if (mounted.current) setPhase(value);
      },
      onText: (text) => {
        if (mounted.current) insert.current(text);
      },
      onError: (value) => {
        if (!mounted.current) return;
        const message = value instanceof Error ? value.message : '';
        setError(
          value instanceof DOMException && value.name === 'NotAllowedError'
            ? 'permission'
            : message === 'voice.noSpeech'
              ? 'silence'
              : 'recognition',
        );
      },
    });
  useEffect(() => {
    mounted.current = true;
    const generation = startGeneration;
    const cancel = (): void => {
      if (document.hidden) {
        generation.current++;
        setChecking(false);
        controller.current?.cancel();
      }
    };
    document.addEventListener('visibilitychange', cancel);
    return () => {
      mounted.current = false;
      generation.current++;
      document.removeEventListener('visibilitychange', cancel);
      controller.current?.cancel();
    };
  }, []);
  useEffect(() => {
    if (phase !== 'recording') return;
    setSeconds(0);
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  async function start(): Promise<void> {
    if (checking || disabled) return;
    const generation = ++startGeneration.current;
    setChecking(true);
    setError(null);
    try {
      if (!window.kodaxSpace) throw new Error('Desktop bridge unavailable');
      const result = await window.kodaxSpace.invoke('voice.status', undefined);
      if (!mounted.current || generation !== startGeneration.current || document.hidden) return;
      if (!result.ok) throw new Error('voice.recognitionFailed');
      if (result.data.phase !== 'ready') {
        setSettings(true);
        return;
      }
      await controller.current?.start(readVoiceLanguage());
    } catch {
      if (mounted.current && generation === startGeneration.current) setError('recognition');
    } finally {
      if (mounted.current && generation === startGeneration.current) setChecking(false);
    }
  }
  const active = phase !== 'idle';
  const working = checking || phase === 'requesting' || phase === 'transcribing';
  const label = phase === 'recording' ? t('voice.stop') : t('voice.start');
  return (
    <div className="relative flex items-center gap-1" data-composer-no-focus>
      <button
        type="button"
        className={`ix-press inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-hover-bg ${active ? 'text-danger' : 'text-fg-muted'}`}
        disabled={working || disabled}
        aria-label={label}
        title={label}
        aria-pressed={active}
        onClick={() => {
          if (phase === 'recording') void controller.current?.stop();
          else void start();
        }}
      >
        {working ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : phase === 'recording' ? (
          <Square className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>
      {(active || checking) && (
        <>
          <span className="text-xs text-fg-muted" role="status">
            {t(
              phase === 'recording'
                ? 'voice.recording'
                : phase === 'requesting'
                  ? 'voice.requesting'
                  : 'voice.transcribing',
              { seconds },
            )}
          </span>
          <button
            type="button"
            className="ix-press p-1 text-fg-muted"
            aria-label={t('voice.cancel')}
            title={t('voice.cancel')}
            onClick={() => {
              startGeneration.current++;
              setChecking(false);
              controller.current?.cancel();
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </>
      )}
      {(settings || error) && (
        <div
          className="absolute bottom-full right-0 z-50 mb-2 w-80 max-w-[85vw] rounded-xl border border-border bg-surface shadow-xl"
          role="dialog"
          aria-label={t('voice.title')}
        >
          <button
            type="button"
            className="absolute right-2 top-2 rounded p-1 hover:bg-hover-bg"
            aria-label={t('voice.close')}
            onClick={() => {
              setSettings(false);
              setError(null);
            }}
          >
            <X className="h-4 w-4" />
          </button>
          {error && (
            <p className="px-5 pt-8 text-sm text-danger" role="alert">
              {t(
                error === 'permission'
                  ? 'voice.permissionDenied'
                  : error === 'silence'
                    ? 'voice.noSpeech'
                    : 'voice.recognitionFailed',
              )}
            </p>
          )}
          <VoiceSettingsPanel />
        </div>
      )}
    </div>
  );
}
