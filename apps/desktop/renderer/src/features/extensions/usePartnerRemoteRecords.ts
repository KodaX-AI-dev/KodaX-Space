import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import type { PartnerRemoteRecordsT } from '@kodax-space/space-ipc-schema';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import { invokeExtensionHost } from './SpaceExtensionsProvider.js';

const emptyRecords: PartnerRemoteRecordsT = {
  sources: [],
  proposals: [],
  receipts: [],
  baseTasks: [],
  documentTasks: [],
  recordRevision: 0,
};
const BASE_TASK_SIGNAL_LOG_LIMIT = 64;

export interface PartnerRemoteBaseTaskSignal {
  readonly id: string;
  readonly revision: number;
}
export interface PartnerRemoteDocumentTaskSignal {
  readonly id: string;
  readonly revision: number;
}

interface RemoteRecordsState {
  readonly records: PartnerRemoteRecordsT;
  readonly error: string | null;
  readonly loading: boolean;
  readonly loadedScope: string | null;
  readonly baseTaskSignals: readonly PartnerRemoteBaseTaskSignal[];
  readonly documentTaskSignals: readonly PartnerRemoteDocumentTaskSignal[];
}

interface RemoteRecordsValue {
  readonly records: PartnerRemoteRecordsT;
  readonly error: string | null;
  readonly loading: boolean;
  readonly loaded: boolean;
  readonly baseTaskSignals: readonly PartnerRemoteBaseTaskSignal[];
  readonly documentTaskSignals: readonly PartnerRemoteDocumentTaskSignal[];
  readonly refresh: (
    baseTaskId?: string,
    documentTaskId?: string,
    recordRevision?: number,
  ) => Promise<void>;
}

type RemoteRecordsAction =
  | { readonly type: 'reset' }
  | { readonly type: 'loading' }
  | { readonly type: 'error'; readonly message: string }
  | {
      readonly type: 'loaded';
      readonly scopeKey: string;
      readonly records: PartnerRemoteRecordsT;
      readonly baseSignals: readonly PartnerRemoteBaseTaskSignal[];
      readonly documentSignals: readonly PartnerRemoteDocumentTaskSignal[];
    };

interface RemoteRecordsControl {
  revision: number;
  signalRevision: number;
  readonly pendingBaseSignals: Map<string, PartnerRemoteBaseTaskSignal>;
  readonly pendingDocumentSignals: Map<string, PartnerRemoteDocumentTaskSignal>;
}

interface RemoteRecordsRefreshOptions {
  readonly projectRoot: string | null;
  readonly sessionId: string | null;
  readonly surface: string;
  readonly scopeKey: string | null;
  readonly control: MutableRefObject<RemoteRecordsControl>;
  readonly dispatch: Dispatch<RemoteRecordsAction>;
}

interface RemoteRecordsLifecycleOptions {
  readonly projectRoot: string | null;
  readonly sessionId: string | null;
  readonly refresh: (
    baseTaskId?: string,
    documentTaskId?: string,
    recordRevision?: number,
  ) => Promise<void>;
  readonly control: MutableRefObject<RemoteRecordsControl>;
  readonly dispatch: Dispatch<RemoteRecordsAction>;
}

const initialState: RemoteRecordsState = {
  records: emptyRecords,
  error: null,
  loading: false,
  loadedScope: null,
  baseTaskSignals: [],
  documentTaskSignals: [],
};
const PartnerRemoteRecordsContext = createContext<RemoteRecordsValue | null>(null);

function reduceRemoteRecords(
  state: RemoteRecordsState,
  action: RemoteRecordsAction,
): RemoteRecordsState {
  if (action.type === 'reset') return initialState;
  if (action.type === 'loading') return { ...state, loading: true };
  if (action.type === 'error') return { ...state, error: action.message, loading: false };
  return {
    records: action.records,
    error: null,
    loading: false,
    loadedScope: action.scopeKey,
    baseTaskSignals: [...state.baseTaskSignals, ...action.baseSignals].slice(
      -BASE_TASK_SIGNAL_LOG_LIMIT,
    ),
    documentTaskSignals: [...state.documentTaskSignals, ...action.documentSignals].slice(
      -BASE_TASK_SIGNAL_LOG_LIMIT,
    ),
  };
}

function queueTaskSignal(
  control: RemoteRecordsControl,
  target: Map<string, { id: string; revision: number }>,
  id: string,
  recordRevision?: number,
): void {
  control.signalRevision = Math.max(control.signalRevision + 1, recordRevision ?? 0);
  target.set(id, { id, revision: control.signalRevision });
}

function takeReadySignals(
  control: RemoteRecordsControl,
  records: PartnerRemoteRecordsT,
): readonly PartnerRemoteBaseTaskSignal[] {
  const taskIds = new Set(records.baseTasks.map((task) => task.id));
  const ready = [...control.pendingBaseSignals.values()]
    .filter((signal) => taskIds.has(signal.id))
    .sort((left, right) => left.revision - right.revision);
  for (const signal of ready) control.pendingBaseSignals.delete(signal.id);
  return ready;
}

function takeReadyDocumentSignals(
  control: RemoteRecordsControl,
  records: PartnerRemoteRecordsT,
): readonly PartnerRemoteDocumentTaskSignal[] {
  const taskIds = new Set(records.documentTasks.map((task) => task.id));
  const ready = [...control.pendingDocumentSignals.values()]
    .filter((signal) => taskIds.has(signal.id))
    .sort((left, right) => left.revision - right.revision);
  for (const signal of ready) control.pendingDocumentSignals.delete(signal.id);
  return ready;
}

function useRemoteRecordsController(): RemoteRecordsValue {
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const surface = useSurfaceStore((state) => state.currentSurface);
  const [state, dispatch] = useReducer(reduceRemoteRecords, initialState);
  const control = useRef<RemoteRecordsControl>({
    revision: 0,
    signalRevision: 0,
    pendingBaseSignals: new Map(),
    pendingDocumentSignals: new Map(),
  });
  const scopeKey =
    projectRoot && sessionId && surface === 'partner'
      ? JSON.stringify([projectRoot, sessionId])
      : null;
  const refresh = useRemoteRecordsRefresh({
    projectRoot,
    sessionId,
    surface,
    scopeKey,
    control,
    dispatch,
  });
  useRemoteRecordsLifecycle({ projectRoot, sessionId, refresh, control, dispatch });
  return useMemo(() => {
    const loaded = scopeKey !== null && state.loadedScope === scopeKey;
    return {
      records: loaded ? state.records : emptyRecords,
      error: state.error,
      loading: state.loading,
      loaded,
      baseTaskSignals: loaded ? state.baseTaskSignals : [],
      documentTaskSignals: loaded ? state.documentTaskSignals : [],
      refresh,
    };
  }, [refresh, scopeKey, state]);
}

function useRemoteRecordsRefresh({
  projectRoot,
  sessionId,
  surface,
  scopeKey,
  control,
  dispatch,
}: RemoteRecordsRefreshOptions): (
  baseTaskId?: string,
  documentTaskId?: string,
  recordRevision?: number,
) => Promise<void> {
  return useCallback(
    async (
      baseTaskId?: string,
      documentTaskId?: string,
      recordRevision?: number,
    ): Promise<void> => {
      if (baseTaskId)
        queueTaskSignal(
          control.current,
          control.current.pendingBaseSignals,
          baseTaskId,
          recordRevision,
        );
      if (documentTaskId)
        queueTaskSignal(
          control.current,
          control.current.pendingDocumentSignals,
          documentTaskId,
          recordRevision,
        );
      const captured = ++control.current.revision;
      if (!projectRoot || !sessionId || surface !== 'partner' || !scopeKey) {
        control.current.pendingBaseSignals.clear();
        control.current.pendingDocumentSignals.clear();
        dispatch({ type: 'reset' });
        return;
      }
      dispatch({ type: 'loading' });
      try {
        const response = await invokeExtensionHost('partner.connectors.records', {
          projectRoot,
          sessionId,
        });
        if (captured !== control.current.revision) return;
        // A renderer can briefly outlive an older main-process response during an app
        // update. Preserve the v1 projection while the v2 document-task fields hydrate.
        const records: PartnerRemoteRecordsT = {
          ...response,
          documentTasks: response.documentTasks ?? [],
          recordRevision: response.recordRevision ?? 0,
        };
        dispatch({
          type: 'loaded',
          scopeKey,
          records,
          baseSignals: takeReadySignals(control.current, records),
          documentSignals: takeReadyDocumentSignals(control.current, records),
        });
      } catch (reason) {
        if (captured === control.current.revision) {
          const message = reason instanceof Error ? reason.message : String(reason);
          dispatch({ type: 'error', message });
        }
      }
    },
    [control, dispatch, projectRoot, scopeKey, sessionId, surface],
  );
}

function useRemoteRecordsLifecycle({
  projectRoot,
  sessionId,
  refresh,
  control,
  dispatch,
}: RemoteRecordsLifecycleOptions): void {
  useEffect(() => {
    const currentControl = control.current;
    dispatch({ type: 'reset' });
    currentControl.pendingBaseSignals.clear();
    currentControl.pendingDocumentSignals.clear();
    void refresh();
    return () => {
      currentControl.revision += 1;
    };
  }, [control, dispatch, refresh]);
  useEffect(
    () =>
      window.kodaxSpace?.on('partner.connectors.changed', (event) => {
        const sameSession = !event.sessionId || event.sessionId === sessionId;
        const sameProject = !event.projectRoot || event.projectRoot === projectRoot;
        if (sameSession && sameProject)
          void refresh(event.baseTaskId, event.documentTaskId, event.recordRevision);
      }),
    [projectRoot, refresh, sessionId],
  );
}

export function PartnerRemoteRecordsProvider({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  const value = useRemoteRecordsController();
  return createElement(PartnerRemoteRecordsContext.Provider, { value }, children);
}

/** The records endpoint serves historical snapshots; loading never calls Feishu. */
export function usePartnerRemoteRecords(): RemoteRecordsValue {
  const value = useContext(PartnerRemoteRecordsContext);
  if (!value) throw new Error('PartnerRemoteRecordsProvider is required');
  return value;
}
