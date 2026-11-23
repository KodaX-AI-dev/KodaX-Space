import type { JSX, ReactNode } from 'react';
import {
  ArrowRight,
  ChevronRight,
  ChevronsUpDown,
  CircleCheck,
  Cpu,
  FoldVertical,
  GitBranch,
  Hourglass,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { LocalNoticeMarker } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../../i18n/I18nProvider.js';
import { DisclosurePart, useRowDisclosure } from './rowDisclosure.js';

export type MarkerTone = 'neutral' | 'run' | 'accent' | 'warn' | 'ok';

const TONE_BADGE: Readonly<Record<MarkerTone, string>> = {
  neutral: 'bg-fg-muted/10 text-fg-secondary',
  run: 'bg-run/15 text-run',
  accent: 'bg-accent/15 text-accent-ink',
  warn: 'bg-warn/15 text-warn',
  ok: 'bg-ok/15 text-ok',
};

interface TimelineMarkerProps {
  readonly variant: string;
  readonly icon: LucideIcon;
  readonly tone?: MarkerTone;
  readonly label: ReactNode;
  /** Secondary facts after the label (token counts, model names). */
  readonly meta?: ReactNode;
  readonly title?: string;
  /** Collapsed body (e.g. a branch summary) opened by clicking the pill. */
  readonly detail?: string;
  /** Work still in progress: the label sweeps and the row announces as a status. */
  readonly live?: boolean;
}

function Pill({ icon: Icon, tone = 'neutral', label, meta, live, expandable }: TimelineMarkerProps & {
  readonly expandable?: boolean;
}): JSX.Element {
  return (
    <span
      className={`timeline-marker-pill inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border-default/70 bg-surface-2/80 py-0.5 pl-0.5 shadow-sm backdrop-blur-sm ${
        expandable
          ? 'cursor-pointer pr-2 hover:border-border-strong group-open:border-border-strong'
          : 'pr-3'
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${TONE_BADGE[tone]}`}
      >
        <Icon className="h-3 w-3" strokeWidth={2.25} aria-hidden />
      </span>
      <span
        className={`min-w-0 truncate font-medium text-fg-secondary${live ? ` text-sweep text-sweep--${tone}` : ''}`}
      >
        {label}
      </span>
      {meta !== undefined && (
        <>
          <span className="h-3 w-px flex-shrink-0 bg-border-default" aria-hidden />
          <span className="tnum inline-flex min-w-0 items-center gap-1.5 text-fg-muted">{meta}</span>
        </>
      )}
      {expandable && (
        <ChevronRight
          className="h-3 w-3 flex-shrink-0 text-fg-muted transition-transform group-open:rotate-90"
          aria-hidden
        />
      )}
    </span>
  );
}

function Row({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-3 py-1 text-xs">
      <span className="timeline-marker-line timeline-marker-line--start h-px min-w-6 flex-1 bg-gradient-to-r from-transparent to-border-default" aria-hidden />
      {children}
      <span className="timeline-marker-line timeline-marker-line--end h-px min-w-6 flex-1 bg-gradient-to-l from-transparent to-border-default" aria-hidden />
    </div>
  );
}

/**
 * A conversation boundary (compaction, model switch, branch return, runtime wait) explains what
 * happened to the conversation rather than being part of it: a pill centred on a fading hairline.
 */
export function TimelineMarker(props: TimelineMarkerProps): JSX.Element {
  const { variant, label, title, detail, live } = props;
  const [detailOpen, setDetailOpen] = useRowDisclosure(DisclosurePart.lineageDetail, false);
  const frame = {
    'data-testid': live ? 'timeline-marker-live' : 'system-notice',
    'data-notice-variant': variant,
    className: 'timeline-marker notice-in',
    title,
  } as const;
  if (!detail) {
    return (
      <div
        {...frame}
        role={live ? 'status' : 'separator'}
        aria-label={typeof label === 'string' ? label : title}
      >
        <Row>
          <Pill {...props} />
        </Row>
      </div>
    );
  }
  return (
    <div {...frame}>
      <details
        className="group"
        open={detailOpen}
        onToggle={(event) => setDetailOpen(event.currentTarget.open)}
      >
        <summary className="list-none [&::-webkit-details-marker]:hidden">
          <Row>
            <Pill {...props} expandable />
          </Row>
        </summary>
        <p className="mx-auto mt-1.5 max-w-[80%] whitespace-pre-wrap break-words text-center text-xs leading-relaxed text-fg-muted">
          {detail}
        </p>
      </details>
    </div>
  );
}

// ---- Lineage (history replay) ----

export type LineageKind = 'branch_summary' | 'compaction' | 'history_truncation';

const LINEAGE_ICON: Readonly<Record<LineageKind, LucideIcon>> = {
  compaction: FoldVertical,
  branch_summary: GitBranch,
  history_truncation: ChevronsUpDown,
};

export function LineageMarker({
  kind,
  label,
  detail,
}: {
  readonly kind: LineageKind;
  readonly label: string;
  readonly detail?: string;
}): JSX.Element {
  return (
    <TimelineMarker
      variant="lineage"
      icon={LINEAGE_ICON[kind]}
      tone={kind === 'compaction' ? 'run' : 'neutral'}
      label={label}
      {...(detail ? { detail } : {})}
    />
  );
}

/** Where the compaction marker will land, the work in progress sweeps until it settles. */
export function CompactingMarker({ label, elapsed }: { readonly label: string; readonly elapsed?: string }) {
  return (
    <TimelineMarker
      variant="compacting"
      icon={FoldVertical}
      tone="run"
      label={label}
      {...(elapsed ? { meta: elapsed } : {})}
      live
    />
  );
}

// ---- Structured markers (local notices) ----

/** 142_318 → "142k", 31_402 → "31.4k": glanceable, exact numbers live in the tooltip. */
export function compactTokenCount(tokens: number): string {
  const scaled = (value: number, unit: string): string =>
    `${value >= 100 ? Math.round(value) : Number(value.toFixed(1))}${unit}`;
  if (tokens >= 1_000_000) return scaled(tokens / 1_000_000, 'M');
  if (tokens >= 1_000) return scaled(tokens / 1_000, 'k');
  return String(tokens);
}

function CompactionMeta({ before, after }: { readonly before: number; readonly after: number }) {
  const kept = Math.min(1, after / before);
  return (
    <>
      <span>{compactTokenCount(before)}</span>
      <ArrowRight className="h-3 w-3 flex-shrink-0" aria-hidden />
      <span className="text-fg-secondary">{compactTokenCount(after)}</span>
      <span className="relative h-1 w-10 flex-shrink-0 overflow-hidden rounded-full bg-fg-muted/20" aria-hidden>
        <span
          className="timeline-marker-meter absolute inset-y-0 left-0 rounded-full bg-run/70"
          style={{ width: `${Math.max(4, kept * 100)}%` }}
        />
      </span>
      <span className="font-medium text-ok">−{Math.round((1 - kept) * 100)}%</span>
    </>
  );
}

type ModelRef = Extract<LocalNoticeMarker, { kind: 'model_change' }>['to'];

function ModelName({ model, strong }: { readonly model: string; readonly strong?: boolean }) {
  return (
    <span className={`truncate font-mono text-[11px] ${strong ? 'text-fg-primary' : ''}`}>
      {model}
    </span>
  );
}

function ModelChangeMeta({ from, to }: { readonly from: ModelRef; readonly to: ModelRef }) {
  const { t } = useI18n();
  const name = (ref: ModelRef, crossProvider: boolean): string => {
    const model = ref.model ?? t('timeline.modelChange.providerDefault');
    return crossProvider ? `${ref.provider} · ${model}` : model;
  };
  const crossProvider = from.provider !== to.provider;
  return (
    <>
      <ModelName model={name(from, crossProvider)} />
      <ArrowRight className="h-3 w-3 flex-shrink-0" aria-hidden />
      <ModelName model={name(to, crossProvider)} strong />
    </>
  );
}

export function LocalNoticeMarkerView({ marker }: { readonly marker: LocalNoticeMarker }) {
  const { t } = useI18n();
  if (marker.kind === 'model_change') {
    const target = `${marker.to.provider}/${marker.to.model ?? t('timeline.modelChange.providerDefault')}`;
    return (
      <TimelineMarker
        variant="model_change"
        icon={Cpu}
        tone="accent"
        label={t('timeline.modelChange')}
        meta={<ModelChangeMeta from={marker.from} to={marker.to} />}
        title={t('timeline.modelChange.title', { model: target })}
      />
    );
  }
  const { tokensBefore: before, tokensAfter: after } = marker;
  const measured = before > 0;
  return (
    <TimelineMarker
      variant="compaction"
      icon={FoldVertical}
      tone="run"
      label={t('timeline.compaction.manual')}
      {...(measured
        ? {
            meta: <CompactionMeta before={before} after={after} />,
            title: t('timeline.compaction.title', {
              before: before.toLocaleString(),
              after: after.toLocaleString(),
              percent: Math.max(0, Math.round((1 - after / before) * 100)),
            }),
          }
        : {})}
    />
  );
}

// ---- SDK display items ----

const SDK_ICON_STYLE: Readonly<Record<string, { icon: LucideIcon; tone: MarkerTone }>> = {
  '✨': { icon: FoldVertical, tone: 'run' },
  '⏳': { icon: Hourglass, tone: 'neutral' },
  '⚠': { icon: TriangleAlert, tone: 'warn' },
  '!': { icon: TriangleAlert, tone: 'warn' },
  '✓': { icon: CircleCheck, tone: 'ok' },
};
const SDK_AUTO_COMPACTED = /^Context auto-compacted \(was ~(\d+)k tokens\)$/;
const MAX_MARKER_TEXT = 200;

/** Short SDK status lines (✨ compaction, ⏳ wait, ⚠ warning) read as markers; long text stays a card. */
export function isSdkMarkerNotice(icon: string | undefined, text: string): boolean {
  return (
    icon !== undefined &&
    icon in SDK_ICON_STYLE &&
    text.length <= MAX_MARKER_TEXT &&
    !text.includes('\n')
  );
}

export function SdkNoticeMarker({ icon, text }: { readonly icon: string; readonly text: string }) {
  const { t } = useI18n();
  const style = SDK_ICON_STYLE[icon] ?? SDK_ICON_STYLE['⏳']!;
  const compacted = SDK_AUTO_COMPACTED.exec(text.trim());
  if (compacted) {
    return (
      <TimelineMarker
        variant="compaction"
        icon={style.icon}
        tone={style.tone}
        label={t('timeline.compaction.auto')}
        meta={t('timeline.compaction.was', { tokens: `${compacted[1]}k` })}
        title={text}
      />
    );
  }
  return (
    <TimelineMarker variant="info" icon={style.icon} tone={style.tone} label={text} title={text} />
  );
}
