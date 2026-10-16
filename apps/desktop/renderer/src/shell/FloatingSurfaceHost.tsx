import {
  Component,
  type CSSProperties,
  type ErrorInfo,
  type JSX,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Portal } from '../components/Portal.js';
import type { FloatingSurfaceDescriptor } from './floatingSurfacePolicy.js';
import { useI18n } from '../i18n/I18nProvider.js';

type HostBounds = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

type StackEntry = {
  readonly token: string;
  readonly zIndex: number;
  readonly order: number;
};

export interface FloatingSurfaceBehavior {
  readonly zIndex: number;
  readonly hasBackdrop: boolean;
  readonly closeOnBackdrop: boolean;
  readonly closeOnEscape: boolean;
  readonly moveFocus: boolean;
  readonly trapFocus: boolean;
  readonly restoreFocus: boolean;
}

export interface FloatingSurfaceHostProps {
  /** Hide without unmounting workspaces such as a live terminal. */
  readonly suspended?: boolean;
  readonly surface: FloatingSurfaceDescriptor;
  readonly children: ReactNode;
  readonly onClose?: () => void;
  readonly boundsRef?: RefObject<HTMLElement | null>;
  readonly contentClassName?: string;
  readonly backdropClassName?: string;
  readonly backdropTestId?: string;
  readonly testId?: string;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly onEscapeKey?: (event: KeyboardEvent) => void;
  readonly onEnterKey?: (event: KeyboardEvent) => boolean | void;
  readonly role?: 'dialog' | 'region' | 'group';
  readonly ariaLabel?: string;
  readonly ariaLabelledBy?: string;
}

interface FloatingSurfaceErrorBoundaryProps {
  readonly label: string;
  readonly onClose?: () => void;
  readonly panelFailedText: string;
  readonly closeText: string;
  readonly children: ReactNode;
}

interface FloatingSurfaceErrorBoundaryState {
  readonly hasError: boolean;
  readonly message: string | null;
}

class FloatingSurfaceErrorBoundary extends Component<
  FloatingSurfaceErrorBoundaryProps,
  FloatingSurfaceErrorBoundaryState
> {
  override state: FloatingSurfaceErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): FloatingSurfaceErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[kodax-space] floating surface render failed', {
      label: this.props.label,
      error,
      componentStack: info.componentStack,
    });
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="pointer-events-auto flex h-full w-full items-center justify-center p-4">
        <div className="max-w-[420px] rounded-lg border border-danger/40 bg-surface-2 p-4 text-center shadow-xl">
          <div className="text-sm font-medium text-fg-primary">{this.props.panelFailedText}</div>
          {this.state.message && (
            <div className="mt-2 break-words text-xs leading-relaxed text-fg-muted">
              {this.state.message}
            </div>
          )}
          {this.props.onClose && (
            <button
              type="button"
              onClick={this.props.onClose}
              className="mt-3 rounded-md border border-border-default px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-3 hover:text-fg-primary"
            >
              {this.props.closeText}
            </button>
          )}
        </div>
      </div>
    );
  }
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let nextStackOrder = 0;
const surfaceStack: StackEntry[] = [];
const stackListeners = new Set<() => void>();

export function floatingSurfaceBehavior(
  surface: FloatingSurfaceDescriptor,
): FloatingSurfaceBehavior {
  const modal = surface.modality === 'modal';
  const softFocus = surface.modality === 'soft_focus';
  return {
    zIndex: floatingSurfaceZIndex(surface),
    hasBackdrop: modal || softFocus,
    closeOnBackdrop: surface.dismiss === 'outside_or_escape',
    closeOnEscape:
      surface.dismiss === 'outside_or_escape' ||
      (softFocus && surface.dismiss === 'explicit_close'),
    moveFocus: surface.focus === 'move_to_surface' || surface.focus === 'trap_and_restore',
    trapFocus: surface.focus === 'trap_and_restore',
    restoreFocus: surface.focus === 'trap_and_restore' || surface.focus === 'move_to_surface',
  };
}

export function floatingSurfaceZIndex(surface: FloatingSurfaceDescriptor): number {
  if (surface.modality === 'modal') return 300;
  switch (surface.kind) {
    case 'command_overlay':
      return 220;
    case 'toast':
      return 240;
    case 'review_workspace':
    case 'artifact_workspace':
      return 90;
    case 'terminal_workspace':
      return 86;
    case 'dock_sheet':
      return 82;
    case 'anchored_menu':
      return 70;
    case 'blocking_modal':
      return 300;
  }
}

export function FloatingSurfaceHost({
  suspended = false,
  surface,
  children,
  onClose,
  boundsRef,
  contentClassName = 'absolute inset-0 pointer-events-none',
  backdropClassName,
  backdropTestId = 'floating-surface-backdrop',
  testId,
  initialFocusRef,
  onEscapeKey,
  onEnterKey,
  role,
  ariaLabel,
  ariaLabelledBy,
}: FloatingSurfaceHostProps): JSX.Element | null {
  const { t } = useI18n();
  const token = useId();
  const behavior = useMemo(() => floatingSurfaceBehavior(surface), [surface]);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [bounds, setBounds] = useState<HostBounds | null>(() => readBounds(boundsRef));
  const [isTopmost, setIsTopmost] = useState(() => isTopmostSurface(token));

  useLayoutEffect(() => {
    previousFocusRef.current = activeElement();
  }, []);

  useLayoutEffect(() => {
    if (suspended) return;
    const unregister = registerFloatingSurface(token, behavior.zIndex);
    const unsubscribe = subscribeFloatingSurfaceStack(() => setIsTopmost(isTopmostSurface(token)));
    setIsTopmost(isTopmostSurface(token));
    return () => {
      unsubscribe();
      unregister();
    };
  }, [behavior.zIndex, suspended, token]);

  useLayoutEffect(() => {
    if (suspended) return;
    if (!boundsRef?.current) {
      setBounds(null);
      return;
    }
    const node = boundsRef.current;
    let frame = 0;
    const measure = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setBounds(readBounds(boundsRef)));
    };
    measure();
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    resizeObserver?.observe(node);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [boundsRef, suspended]);

  useLayoutEffect(() => {
    if (!behavior.moveFocus || suspended) return;
    const frame = requestAnimationFrame(() => {
      const root = contentRef.current;
      if (!root) return;
      const preferred = initialFocusRef?.current;
      const target =
        preferred && root.contains(preferred) ? preferred : (firstFocusable(root) ?? root);
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [behavior.moveFocus, initialFocusRef, surface.id, suspended]);

  useEffect(() => {
    if (suspended) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isTopmost) return;
      if (event.key === 'Escape' && behavior.closeOnEscape && onClose) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key === 'Escape' && onEscapeKey) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        onEscapeKey(event);
        return;
      }
      if (event.key === 'Enter' && onEnterKey) {
        if (shouldTargetHandleEnter(event, contentRef.current)) return;
        const handled = onEnterKey(event) !== false;
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (event.key !== 'Tab' || !behavior.trapFocus) return;
      const root = contentRef.current;
      if (!root) return;
      const focusable = focusableElements(root);
      if (focusable.length === 0) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        root.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        first.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    behavior.closeOnEscape,
    behavior.trapFocus,
    isTopmost,
    onClose,
    onEnterKey,
    onEscapeKey,
    suspended,
  ]);

  useEffect(() => {
    return () => {
      if (!behavior.restoreFocus) return;
      const target = previousFocusRef.current;
      if (target && document.contains(target)) {
        requestAnimationFrame(() => {
          if (target.getClientRects().length > 0 && !target.closest('[inert]'))
            target.focus({ preventScroll: true });
        });
      }
    };
  }, [behavior.restoreFocus]);

  const rootStyle = hostStyle(bounds, behavior.zIndex);
  const backdropClass =
    backdropClassName ??
    (surface.modality === 'modal' ? 'bg-black/60 backdrop-blur-sm' : 'bg-black/30');

  return (
    <Portal>
      <div
        hidden={suspended}
        inert={suspended || undefined}
        className="pointer-events-none"
        style={rootStyle}
        data-floating-surface-host={surface.id}
        data-surface-kind={surface.kind}
        data-surface-placement={surface.placement}
        data-testid={testId}
      >
        {behavior.hasBackdrop && (
          <div
            className={`absolute inset-0 pointer-events-auto ${backdropClass}`}
            data-testid={backdropTestId}
            aria-hidden
            onMouseDown={() => {
              if (isTopmost && behavior.closeOnBackdrop) onClose?.();
            }}
          />
        )}
        <div
          ref={contentRef}
          tabIndex={-1}
          className={contentClassName}
          role={role}
          aria-modal={role === 'dialog' && surface.modality === 'modal' ? true : undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
        >
          <FloatingSurfaceErrorBoundary
            label={surface.label}
            onClose={onClose}
            panelFailedText={t('popout.panelFailed')}
            closeText={t('popout.close')}
          >
            {children}
          </FloatingSurfaceErrorBoundary>
        </div>
      </div>
    </Portal>
  );
}

function registerFloatingSurface(token: string, zIndex: number): () => void {
  const entry: StackEntry = { token, zIndex, order: ++nextStackOrder };
  surfaceStack.push(entry);
  emitFloatingSurfaceStack();
  return () => {
    const index = surfaceStack.findIndex((item) => item.token === token);
    if (index !== -1) surfaceStack.splice(index, 1);
    emitFloatingSurfaceStack();
  };
}

function subscribeFloatingSurfaceStack(listener: () => void): () => void {
  stackListeners.add(listener);
  return () => stackListeners.delete(listener);
}

function emitFloatingSurfaceStack(): void {
  for (const listener of stackListeners) listener();
}

export function isTopmostSurface(token: string): boolean {
  return floatingSurfaceStackTopToken(surfaceStack) === token;
}

export function floatingSurfaceStackTopToken(
  entries: readonly Pick<StackEntry, 'order' | 'token' | 'zIndex'>[],
): string | null {
  const top = entries.reduce<(typeof entries)[number] | null>((current, entry) => {
    if (!current) return entry;
    if (entry.zIndex > current.zIndex) return entry;
    if (entry.zIndex === current.zIndex && entry.order > current.order) return entry;
    return current;
  }, null);
  return top?.token ?? null;
}

function hostStyle(bounds: HostBounds | null, zIndex: number): CSSProperties {
  if (!bounds) {
    return {
      position: 'fixed',
      inset: 0,
      zIndex,
    };
  }
  return {
    position: 'fixed',
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
    zIndex,
  };
}

function readBounds(boundsRef: RefObject<HTMLElement | null> | undefined): HostBounds | null {
  const node = boundsRef?.current;
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function activeElement(): HTMLElement | null {
  const element = document.activeElement;
  return element instanceof HTMLElement ? element : null;
}

function shouldTargetHandleEnter(event: KeyboardEvent, root: HTMLElement | null): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (root && !root.contains(target)) return false;
  if (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLAnchorElement
  ) {
    return true;
  }
  if (target.isContentEditable) return true;
  const role = target.getAttribute('role');
  return (
    role === 'button' ||
    role === 'checkbox' ||
    role === 'combobox' ||
    role === 'link' ||
    role === 'menuitem' ||
    role === 'option' ||
    role === 'radio' ||
    role === 'switch' ||
    role === 'textbox'
  );
}

function firstFocusable(root: HTMLElement): HTMLElement | null {
  return focusableElements(root)[0] ?? null;
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.getClientRects().length > 0,
  );
}
