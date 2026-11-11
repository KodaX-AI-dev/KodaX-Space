// Global types injected by Electron preload (contextBridge).
// This is the renderer's only Electron-facing surface.
// FEATURE_002: invoke / on are channel-typed.
import type {
  InvokeChannelName,
  PushChannelName,
  ChannelInput,
  ChannelOutput,
  IpcResult,
} from '@kodax-space/space-ipc-schema';

type BridgePlatform =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd';

export {};

declare global {
  interface KodaXSpaceBridge {
    /**
     * Renderer-to-main request/response. Always returns an envelope.
     * Schema-unknown channels fail at type-check time and at preload runtime.
     */
    invoke<C extends InvokeChannelName>(
      channel: C,
      payload: ChannelInput<C>,
    ): Promise<IpcResult<ChannelOutput<C>>>;

    /**
     * Subscribe to main-to-renderer push events and return an unsubscribe.
     * Payloads are inferred from each channel's zod schema.
     */
    on<C extends PushChannelName>(
      channel: C,
      listener: (payload: import('@kodax-space/space-ipc-schema').PushPayload<C>) => void,
    ): () => void;

    platform: BridgePlatform;

    /** Notify main that React committed and the first app frame should be paintable. */
    rendererReady(): void;

    /** Resolve the OS path for a File supplied by a user drag/drop action. */
    getPathForFile(file: File): string | null;

    /**
     * Chromium whole-window zoom factor (1 = 100%).
     * Gestures and persistence live in the renderer ZoomController.
     */
    zoom: {
      get(): number;
      set(factor: number): void;
    };
  }

  interface Window {
    kodaxSpace?: KodaXSpaceBridge;
  }
}
