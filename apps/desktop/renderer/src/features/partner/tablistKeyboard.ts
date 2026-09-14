import type { KeyboardEvent } from 'react';

export type TabNavigationKey =
  'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

export function nextTabIndex(
  currentIndex: number,
  tabCount: number,
  key: TabNavigationKey,
): number | null {
  if (tabCount < 1 || currentIndex < 0 || currentIndex >= tabCount) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return tabCount - 1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % tabCount;
  return (currentIndex - 1 + tabCount) % tabCount;
}

/** WAI-ARIA tablist keyboard behavior with roving focus and activation. */
export function handleTablistKeyDown(event: KeyboardEvent<HTMLElement>): void {
  const key = event.key as TabNavigationKey;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
    return;
  }
  const target =
    event.target instanceof Element ? event.target.closest<HTMLElement>('[role="tab"]') : null;
  if (!target || !event.currentTarget.contains(target)) return;
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'),
  );
  const nextIndex = nextTabIndex(tabs.indexOf(target), tabs.length, key);
  if (nextIndex === null) return;
  event.preventDefault();
  tabs[nextIndex]?.focus();
  tabs[nextIndex]?.click();
}
