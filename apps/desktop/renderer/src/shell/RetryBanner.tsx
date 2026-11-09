// RetryBanner — Provider retry / recovery / rate-limit 实时提示 (v0.1.x)
//
// REPL StatusNoticesSurface 等价: KodaX SDK 在 provider 429 / overloaded / network error /
// guardrail circuit breaker 升级时会发 retry_after / provider_recovery events,但
// Space 之前没消费 → spinner 闷着转,用户不知道为什么慢。
//
// 显示规则:
//   - retry_after: 显示倒计时条 "Rate-limited by anthropic · retrying in 3.2s (attempt 2/5)"
//   - provider_recovery: 显示 "Provider falling back: ${recoveryAction} (attempt 1/3)"
//   - 1 个 banner; 同时来时 retry_after 优先 (它有具体 wait 时长)
//   - 倒计时归零 / 收到 iteration_start / session_complete → 自动消失
//
// 状态保鲜 (来自 events 流尾扫): 倒序找最近 retry_after,如果之后有 iteration_start 就不显示
// (KodaX 已经恢复正常 retry 后继续了)。

import { useEffect, useRef, useState } from 'react';
import { RotateCw, Timer } from 'lucide-react';
import { useAppStore } from '../store/appStore.js';
import type { SessionEvent } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../i18n/I18nProvider.js';
import { ComposerNotice } from './ComposerNotice.js';

const EMPTY_EVENTS: readonly SessionEvent[] = [];

interface BannerRaw {
  readonly kind: 'retry' | 'recovery';
  readonly provider?: string;
  readonly reason?: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  /** retry: SDK 给的 waitMs (ms 数); recovery 不用 */
  readonly waitMs?: number;
  /** retry 在 events 数组的索引,作为"是不是同一条" identity (跨 render 稳定) */
  readonly eventIdx?: number;
  /** recovery 路径: 走的 recovery action 名 (fallback-provider / sleep / etc) */
  readonly recoveryAction?: string;
}

/** 找最近一个未消化的 retry/recovery event;返回 raw 状态 (不带 wallclock,避免每渲染漂移)。 */
function findActiveBannerRaw(events: readonly SessionEvent[]): BannerRaw | null {
  // 倒序扫到最近一个 iteration_start / session_complete / session_error 边界 — 那之后的
  // retry/recovery 已经消化掉,不该显示。在边界之前如果有 retry_after / provider_recovery 就用最近一个。
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (
      ev.kind === 'iteration_start' ||
      ev.kind === 'session_complete' ||
      ev.kind === 'session_error'
    ) {
      return null;
    }
    if (ev.kind === 'retry_after') {
      const p = ev.payload;
      return {
        kind: 'retry',
        provider: p.provider,
        reason: p.reason,
        attempt: p.attempt,
        maxAttempts: p.maxAttempts,
        waitMs: p.waitMs,
        eventIdx: i,
      };
    }
    if (ev.kind === 'provider_recovery') {
      return {
        kind: 'recovery',
        recoveryAction: ev.recoveryAction,
        attempt: ev.attempt,
        maxAttempts: ev.maxAttempts,
        eventIdx: i,
      };
    }
  }
  return null;
}

export function RetryBanner(): JSX.Element | null {
  const { t } = useI18n();
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const events = useAppStore((s) =>
    currentSessionId ? (s.eventsBySession[currentSessionId] ?? EMPTY_EVENTS) : EMPTY_EVENTS,
  );
  const raw = findActiveBannerRaw(events);
  const bannerRootRef = useRef<HTMLDivElement | null>(null);
  const [dismissedBannerKey, setDismissedBannerKey] = useState<string | null>(null);
  const bannerKey =
    raw && raw.eventIdx !== undefined
      ? `${currentSessionId ?? 'global'}:${raw.kind}:${raw.eventIdx}`
      : null;

  // 锁住 retryAt: 用 ref 记 (sessionId, eventIdx, waitMs) → 真实壁钟。renderer 每个 tick
  // 重渲染时若 (sessionId, eventIdx) 仍是同一条,直接复用 stored retryAt,否则按当前
  // Date.now() + waitMs 新建一个并记下。这样倒计时真实下降到 0,而不是每 render 跳回 waitMs。
  const retryAtRef = useRef<{ sid: string | null; idx: number; at: number } | null>(null);
  let retryAt: number | undefined;
  if (raw?.kind === 'retry' && raw.waitMs !== undefined && raw.eventIdx !== undefined) {
    const sid = currentSessionId;
    const idx = raw.eventIdx;
    const stored = retryAtRef.current;
    if (stored && stored.sid === sid && stored.idx === idx) {
      retryAt = stored.at;
    } else {
      retryAt = Date.now() + raw.waitMs;
      retryAtRef.current = { sid, idx, at: retryAt };
    }
  } else {
    // 不是 retry kind → 清掉 ref 让下次 retry 重新算
    retryAtRef.current = null;
  }

  // retry 路径: 500ms 心跳让倒计时数字递减;到点后让 banner 自动消失 (实际由 iteration_start 触发,
  // 但 KodaX 重试速度有时比 1s tick 慢,UI 上让用户看到 "0s" 后默认折叠)。
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!raw || raw.kind !== 'retry' || retryAt === undefined) return undefined;
    const id = setInterval(() => forceTick((n) => (n + 1) % 1000), 500);
    return () => clearInterval(id);
    // 故意只依赖 raw?.kind：整个 raw 对象每条事件换引用，纳入会让心跳被反复重建。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw?.kind, retryAt]);

  useEffect(() => {
    if (bannerKey === null || dismissedBannerKey === bannerKey) return undefined;

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (bannerRootRef.current?.contains(target)) return;
      setDismissedBannerKey(bannerKey);
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [bannerKey, dismissedBannerKey]);

  const dismissActiveBanner = (): void => {
    if (bannerKey !== null) setDismissedBannerKey(bannerKey);
  };

  if (!raw || (bannerKey !== null && dismissedBannerKey === bannerKey)) return null;
  const banner = { ...raw, retryAt };

  // retry: 倒计时 + 描述
  if (banner.kind === 'retry') {
    const remainMs = banner.retryAt !== undefined ? Math.max(0, banner.retryAt - Date.now()) : 0;
    const remainSec = (remainMs / 1000).toFixed(remainMs < 10_000 ? 1 : 0);
    const reasonLabel =
      banner.reason === 'rate-limit' ? t('retry.rateLimited') : t('retry.providerOverloaded');
    return (
      <ComposerNotice
        ref={bannerRootRef}
        tone="warning"
        icon={Timer}
        role="status"
        meta={t('retry.attempt', { attempt: banner.attempt, max: banner.maxAttempts })}
        onDismiss={dismissActiveBanner}
        dismissLabel={t('retry.dismissAria')}
      >
        {reasonLabel}
        {banner.provider ? t('retry.byProvider', { provider: banner.provider }) : ''} ·{' '}
        <span className="tnum">{t('retry.retryingIn', { seconds: remainSec })}</span>
      </ComposerNotice>
    );
  }

  // recovery: 显示 recovery action + attempt
  return (
    <ComposerNotice
      ref={bannerRootRef}
      tone="info"
      icon={RotateCw}
      role="status"
      meta={t('retry.attempt', { attempt: banner.attempt, max: banner.maxAttempts })}
      onDismiss={dismissActiveBanner}
      dismissLabel={t('retry.dismissAria')}
    >
      {t('retry.recovery', { action: banner.recoveryAction ?? '' })}
    </ComposerNotice>
  );
}
