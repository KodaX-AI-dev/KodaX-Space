import { existsSync } from 'node:fs';
import {
  createFeishuCliRunner,
  FeishuCliError,
  type FeishuCliRunner,
} from './feishu-cli-runner.js';
import { createFeishuCliInstaller } from './feishu-cli-install.js';
import {
  createFeishuAuthProcess,
  FeishuOnboardingError,
  type FeishuAuthProcess,
} from './feishu-auth-process.js';
import { FEISHU_ONBOARDING_SCOPES } from './feishu-scopes.js';
import { isCompatibleFeishuCliVersion } from './feishu-cli-release.js';
export { FeishuOnboardingError } from './feishu-auth-process.js';

const NEVER_ABORTED_SIGNAL = new AbortController().signal;

export interface FeishuOnboardingProgress {
  phase:
    | 'preparing'
    | 'installing'
    | 'waiting_app'
    | 'waiting_authorization'
    | 'verifying'
    | 'waiting_input';
  authorizationUrl?: string;
  expiresAt?: string;
}
export interface FeishuOnboardingInput {
  requestInput?: (
    kind: NonNullable<
      import('@kodax-space/space-ipc-schema').PartnerConnectorOnboardingT['inputKind']
    >,
  ) => Promise<import('@kodax-space/space-ipc-schema').PartnerConnectorOnboardingValueT>;
  profile: string;
  installCli: boolean;
  signal: AbortSignal;
  onProgress: (event: FeishuOnboardingProgress) => void;
}

/** Only generated Feishu onboarding pages may be handed to the external browser. */
export function isFeishuOnboardingAuthorizationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192 || /[\s\\\u0000-\u001f\u007f]/u.test(value))
    return false;
  try {
    const url = new URL(value);
    const keys = [...url.searchParams.keys()];
    const allowed =
      url.hostname === 'open.feishu.cn'
        ? ['user_code', 'lpv', 'ocv', 'from']
        : ['user_code', 'flow_id'];
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (!url.port || url.port === '443') &&
      ((url.hostname === 'open.feishu.cn' && url.pathname === '/page/cli') ||
        (url.hostname === 'accounts.feishu.cn' && url.pathname === '/oauth/v1/device/verify')) &&
      keys.length === new Set(keys).size &&
      keys.every((key) => allowed.includes(key)) &&
      [...url.searchParams.values()].every(
        (item) => !!item && !/[\s\u0000-\u001f\u007f]/u.test(item),
      ) &&
      url.searchParams.getAll('user_code').length === 1 &&
      !!url.searchParams.get('user_code')
    );
  } catch {
    return false;
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new FeishuOnboardingError('invalid_response');
  return value as Record<string, unknown>;
}
function json(value: string): Record<string, unknown> {
  try {
    return object(JSON.parse(value) as unknown);
  } catch {
    throw new FeishuOnboardingError('invalid_response');
  }
}
function active(signal: AbortSignal): void {
  if (signal.aborted) throw new FeishuOnboardingError('cancelled');
}

async function awaitWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  active(signal);
  return new Promise<T>((resolve, reject) => {
    const cancelled = () => reject(new FeishuOnboardingError('cancelled'));
    signal.addEventListener('abort', cancelled, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', cancelled);
        if (signal.aborted) cancelled();
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', cancelled);
        reject(error);
      },
    );
  });
}

async function compatible(run: FeishuCliRunner, signal: AbortSignal): Promise<boolean> {
  try {
    const result = await run({ args: ['--version'], signal });
    return result.exitCode === 0 && isCompatibleFeishuCliVersion(result.stdout);
  } catch {
    return false;
  }
}

async function requireUnusedProfile(
  run: FeishuCliRunner,
  profile: string,
  signal: AbortSignal,
): Promise<void> {
  try {
    const result = await run({ args: ['profile', 'list'], signal });
    const values: unknown = JSON.parse(result.stdout);
    if (
      result.exitCode !== 0 ||
      !Array.isArray(values) ||
      values.length > 1024 ||
      values.some((value) => object(value).name === profile)
    )
      throw new FeishuOnboardingError('invalid_response');
  } catch {
    throw new FeishuOnboardingError('invalid_response');
  }
}

async function requireCreatedProfile(
  run: FeishuCliRunner,
  input: FeishuOnboardingInput,
  appId: string,
): Promise<void> {
  try {
    const result = await run({ args: ['profile', 'list'], signal: input.signal });
    active(input.signal);
    const values: unknown = JSON.parse(result.stdout);
    if (result.exitCode !== 0 || !Array.isArray(values) || values.length > 1024)
      throw new Error('profiles');
    const matches = values.map(object).filter((value) => value.name === input.profile);
    if (matches.length !== 1 || matches[0].appId !== appId || matches[0].brand !== 'feishu')
      throw new Error('changed profile');
  } catch {
    active(input.signal);
    throw new FeishuOnboardingError('invalid_response');
  }
}

async function createApp(run: FeishuAuthProcess, input: FeishuOnboardingInput): Promise<string> {
  let stdout = '';
  let stderr = '';
  let url: string | undefined;
  const line = (value: string) => {
    const candidate = value.trim();
    if (!candidate.startsWith('https://')) return;
    if (
      !isFeishuOnboardingAuthorizationUrl(candidate) ||
      new URL(candidate).hostname !== 'open.feishu.cn' ||
      (url && candidate !== url)
    ) {
      throw new FeishuOnboardingError('invalid_response');
    }
    if (!url) {
      url = candidate;
      input.onProgress({
        phase: 'waiting_app',
        authorizationUrl: url,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      });
    }
  };
  const result = await run({
    args: ['config', 'init', '--new', '--brand', 'feishu', '--name', input.profile],
    signal: input.signal,
    timeoutMs: 630000,
    onOutput: (stream, chunk) => {
      if (stream === 'stdout') stdout += chunk;
      else {
        stderr += chunk;
        const lines = stderr.split(/\r?\n/u);
        stderr = lines.pop() ?? '';
        lines.forEach(line);
      }
    },
  });
  line(stderr);
  active(input.signal);
  if (result.exitCode !== 0) throw new FeishuOnboardingError('authorization_failed');
  const saved = json(stdout);
  if (
    !url ||
    saved.brand !== 'feishu' ||
    typeof saved.appId !== 'string' ||
    !/^cli_[\w-]{1,128}$/u.test(saved.appId) ||
    saved.appSecret !== '****'
  ) {
    throw new FeishuOnboardingError('invalid_response');
  }
  return saved.appId;
}

async function authorizeUser(run: FeishuAuthProcess, input: FeishuOnboardingInput): Promise<void> {
  let buffered = '';
  let url: string | undefined;
  let complete = false;
  let failure: FeishuOnboardingError | undefined;
  const line = (text: string) => {
    if (!text.trim()) return;
    const value = json(text);
    if (value.event === 'device_authorization') {
      const candidate = value.verification_uri_complete;
      if (
        !isFeishuOnboardingAuthorizationUrl(candidate) ||
        new URL(candidate).hostname !== 'accounts.feishu.cn' ||
        url ||
        !Number.isSafeInteger(value.expires_in) ||
        Number(value.expires_in) < 1 ||
        Number(value.expires_in) > 3600
      ) {
        throw new FeishuOnboardingError('invalid_response');
      }
      url = candidate;
      input.onProgress({
        phase: 'waiting_authorization',
        authorizationUrl: url,
        expiresAt: new Date(
          Date.now() + Math.min(Number(value.expires_in), 600) * 1000,
        ).toISOString(),
      });
    } else if (value.event === 'authorization_complete') {
      if (complete || !url || !Array.isArray(value.granted) || !Array.isArray(value.missing))
        throw new FeishuOnboardingError('invalid_response');
      complete = true;
      if (
        value.missing.length ||
        FEISHU_ONBOARDING_SCOPES.some((scope) => !(value.granted as unknown[]).includes(scope))
      )
        failure = new FeishuOnboardingError('missing_permissions');
    } else if (value.event === 'authorization_failed')
      failure = new FeishuOnboardingError(
        typeof value.error === 'string' && /expired|timed out/iu.test(value.error)
          ? 'expired'
          : 'authorization_failed',
      );
    else throw new FeishuOnboardingError('invalid_response');
  };
  const result = await run({
    args: [
      `--profile=${input.profile}`,
      'auth',
      'login',
      '--json',
      '--scope',
      FEISHU_ONBOARDING_SCOPES.join(' '),
    ],
    signal: input.signal,
    timeoutMs: 630000,
    onOutput: (stream, chunk) => {
      if (stream !== 'stdout') return;
      buffered += chunk;
      const lines = buffered.split(/\r?\n/u);
      buffered = lines.pop() ?? '';
      lines.forEach(line);
    },
  });
  line(buffered);
  active(input.signal);
  if (failure) throw failure;
  if (result.exitCode !== 0) throw new FeishuOnboardingError('authorization_failed');
  if (!complete) throw new FeishuOnboardingError('invalid_response');
}

export interface FeishuOnboardingCliOptions {
  root: string;
  /** Trusted, checksum-pinned archive shipped beside app.asar. */
  bundledArchive?: string;
  env?: NodeJS.ProcessEnv;
  runnerFactory?: (executable: string) => FeishuCliRunner;
  authProcessFactory?: (executable: string) => FeishuAuthProcess;
  installer?: {
    executable: string;
    install: (signal: AbortSignal) => Promise<string>;
    installBundled?: (archive: string, signal: AbortSignal) => Promise<string>;
  };
}

/** Host-only dependencies are injectable; no caller-supplied shell, URL or scopes enter run. */
export function createFeishuOnboardingCli(options: FeishuOnboardingCliOptions): {
  runner: FeishuCliRunner;
  run: (input: FeishuOnboardingInput) => Promise<void>;
} {
  const source = options.env ?? process.env;
  const installer = options.installer ?? createFeishuCliInstaller({ root: options.root });
  const privatePath = installer.executable;
  let installedPrivate = false;
  let managedReady = false;
  let managedPreparation:
    | {
        readonly controller: AbortController;
        readonly promise: Promise<string>;
        waiters: number;
        settled: boolean;
      }
    | undefined;
  const claimedProfiles = new Set<string>();
  const executable = () => {
    // A packaged/build-prepared bundle is the authority for this adapter. Never
    // let PATH or a process environment override replace the checksum-locked
    // Space-managed component, even when that external binary prints the same
    // version string.
    if (options.bundledArchive) return privatePath;
    return (
      source.KODAX_SPACE_FEISHU_CLI ||
      (installedPrivate || existsSync(privatePath) ? privatePath : 'lark-cli')
    );
  };
  const runnerFactory =
    options.runnerFactory ?? ((file) => createFeishuCliRunner({ executable: file, env: source }));
  const authFactory =
    options.authProcessFactory ??
    ((file) => createFeishuAuthProcess({ executable: file, env: source }));
  const ensureManaged = async (signal: AbortSignal): Promise<string> => {
    if (!options.bundledArchive) return executable();
    if (!installer.installBundled) throw new FeishuOnboardingError('component_unavailable');
    if (managedReady) return privatePath;
    if (managedPreparation?.controller.signal.aborted) {
      const abandoned = managedPreparation;
      await abandoned.promise.catch(() => undefined);
      active(signal);
      if (managedPreparation === abandoned) managedPreparation = undefined;
    }
    if (!managedPreparation) {
      const controller = new AbortController();
      const preparation = {
        controller,
        promise: installer.installBundled(options.bundledArchive, controller.signal),
        waiters: 0,
        settled: false,
      };
      managedPreparation = preparation;
      void preparation.promise.then(
        () => {
          preparation.settled = true;
          managedReady = true;
          if (managedPreparation === preparation) managedPreparation = undefined;
        },
        () => {
          preparation.settled = true;
          if (managedPreparation === preparation) managedPreparation = undefined;
        },
      );
    }
    const preparation = managedPreparation;
    preparation.waiters++;
    try {
      return await awaitWithSignal(preparation.promise, signal);
    } finally {
      preparation.waiters--;
      if (!preparation.settled && preparation.waiters === 0) preparation.controller.abort();
    }
  };
  const managedRunner: FeishuCliRunner = async (request) => {
    const signal = request.signal ?? NEVER_ABORTED_SIGNAL;
    const dispatch = async () => runnerFactory(await ensureManaged(signal))(request);
    try {
      const response = await dispatch();
      if (
        options.bundledArchive &&
        request.args.length === 1 &&
        request.args[0] === '--version' &&
        (response.exitCode !== 0 || !isCompatibleFeishuCliVersion(response.stdout))
      ) {
        managedReady = false;
        return dispatch();
      }
      return response;
    } catch (error) {
      if (
        !options.bundledArchive ||
        !(error instanceof FeishuCliError) ||
        error.dispatched ||
        !['cli_missing', 'command_failed'].includes(error.code)
      )
        throw error;
      managedReady = false;
      return dispatch();
    }
  };
  return {
    runner: managedRunner,
    run: async (input) => {
      try {
        active(input.signal);
        if (
          !/^space-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
            input.profile,
          )
        ) {
          throw new FeishuOnboardingError('invalid_response');
        }
        input.onProgress({ phase: 'preparing' });
        let selectedExecutable = executable();
        if (options.bundledArchive) {
          input.onProgress({ phase: 'installing' });
          selectedExecutable = await ensureManaged(input.signal);
          if (!(await compatible(runnerFactory(selectedExecutable), input.signal))) {
            managedReady = false;
            selectedExecutable = await ensureManaged(input.signal);
            if (!(await compatible(runnerFactory(selectedExecutable), input.signal)))
              throw new FeishuOnboardingError('installation_failed');
          }
        } else {
          const ready = await compatible(runnerFactory(selectedExecutable), input.signal);
          active(input.signal);
          if (!ready) {
            if (source.KODAX_SPACE_FEISHU_CLI)
              throw new FeishuOnboardingError('authorization_failed');
            input.onProgress({ phase: 'installing' });
            if (!input.installCli) throw new FeishuOnboardingError('needs_install');
            await installer.install(input.signal);
            installedPrivate = true;
            selectedExecutable = privatePath;
            if (!(await compatible(runnerFactory(selectedExecutable), input.signal)))
              throw new FeishuOnboardingError('installation_failed');
          }
        }
        active(input.signal);
        const run = runnerFactory(selectedExecutable);
        const auth = authFactory(selectedExecutable);
        await requireUnusedProfile(run, input.profile, input.signal);
        active(input.signal);
        if (claimedProfiles.has(input.profile)) throw new FeishuOnboardingError('invalid_response');
        claimedProfiles.add(input.profile);
        const appId = await createApp(auth, input);
        await requireCreatedProfile(run, input, appId);
        active(input.signal);
        await authorizeUser(auth, input);
        await requireCreatedProfile(run, input, appId);
        active(input.signal);
        input.onProgress({ phase: 'verifying' });
      } catch (error) {
        active(input.signal);
        if (error instanceof FeishuOnboardingError) throw error;
        throw new FeishuOnboardingError('authorization_failed');
      }
    },
  };
}
