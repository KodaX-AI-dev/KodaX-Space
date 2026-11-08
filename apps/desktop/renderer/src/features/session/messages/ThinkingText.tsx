import { useState, type JSX } from 'react';
import { useI18n } from '../../../i18n/I18nProvider.js';
import { useProductBodyPreview } from './ProductItemBody.js';

const SECTION_SIZE = 8 * 1024;
const PAGING_THRESHOLD = 64 * 1024;

function sectionStart(text: string, index: number): number {
  const offset = Math.min(index * SECTION_SIZE, text.length);
  const code = text.charCodeAt(offset);
  const previous = text.charCodeAt(offset - 1);
  return code >= 0xdc00 && code <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff
    ? offset + 1
    : offset;
}

export function ThinkingText({ text }: { text: string }): JSX.Element {
  const { t } = useI18n();
  const preview = useProductBodyPreview();
  const [section, setSection] = useState(0);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  if (text.length <= PAGING_THRESHOLD) return <>{text}</>;
  const count = Math.ceil(text.length / SECTION_SIZE);
  const index = Math.min(section, count - 1);
  async function copyFullText(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2 whitespace-normal text-xs text-fg-muted">
        <button type="button" disabled={index === 0} onClick={() => setSection(index - 1)}>
          {t('message.previousThinkingSection')}
        </button>
        <span aria-live="polite">
          {index + 1} / {count}
        </span>
        <button type="button" disabled={index + 1 >= count} onClick={() => setSection(index + 1)}>
          {t('message.nextThinkingSection')}
        </button>
        {!preview && (
          <button type="button" onClick={() => void copyFullText()}>
            {t(copy === 'copied' ? 'message.copied' : 'message.copyFullText')}
          </button>
        )}
        {copy === 'failed' && <span role="status">{t('message.copyFullFailed')}</span>}
      </div>
      <div data-testid="thinking-section-content" className="whitespace-pre-wrap break-words">
        {text.slice(sectionStart(text, index), sectionStart(text, index + 1))}
      </div>
    </div>
  );
}
