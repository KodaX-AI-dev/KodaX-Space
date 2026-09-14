import { constants } from 'node:fs';
import { lstat, mkdir, open, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ReadConnectorError,
  checkReadConnectorDocument,
  type ReadConnector,
  type ReadConnectorIdentity,
} from './read-connector.js';
import type { FeishuOnboardingInput } from './feishu-onboarding-cli.js';
import {
  createProviderCliProcess,
  ensureProviderDirectory,
  type ProviderCliProcess,
  type ProviderCliProcessOptions,
} from './provider-cli-process.js';
import { createProviderCliInstaller, type ProviderCliInstaller } from './provider-cli-install.js';
import { dingtalkExecutableStamp, verifyDingtalkBinary } from './dingtalk-native.js';
import {
  dingtalkId,
  dingtalkJSON,
  dingtalkNodeId,
  dingtalkOnlineIdentity,
  isDingtalkAuthorizationUrl,
} from './dingtalk-protocol.js';

const VERSION = '1.0.61';
const ASSET = {
  url: 'https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/releases/download/v1.0.61/dws-darwin-arm64.tar.gz',
  sha256: '9a122f6322983c45e44db7274788dbb5c62d1762268e45d18e0e72ed40d39978',
  binaryPath: './dws',
  allowedDirectories: ['./'],
  allowedFiles: ['./dws', './LICENSE', './NOTICE', './README.md', './CHANGELOG.md'],
};
interface DingtalkOptions {
  root: string;
  platform?: NodeJS.Platform;
  arch?: string;
  /** Host/test seams, never exposed through IPC or model arguments. */
  processFactory?: (options: ProviderCliProcessOptions) => ProviderCliProcess;
  installer?: ProviderCliInstaller;
  verifyBinary?: typeof verifyDingtalkBinary;
}

function active(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ReadConnectorError('cancelled');
}
function safeError(error: unknown): ReadConnectorError {
  return error instanceof ReadConnectorError ? error : new ReadConnectorError('invalid_response');
}
function profilePath(root: string, profile: string): string {
  if (!/^space-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(profile))
    throw new ReadConnectorError('invalid_response');
  return path.join(root, 'dingtalk', 'profiles', profile);
}
async function regularFile(file: string): Promise<boolean> {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new ReadConnectorError('invalid_response');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw safeError(error);
  }
}
async function binding(directory: string): Promise<ReadConnectorIdentity | undefined> {
  if (!(await regularFile(path.join(directory, 'binding.json')))) return undefined;
  await ensureProviderDirectory(directory);
  const file = await open(
    path.join(directory, 'binding.json'),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 2048) throw new ReadConnectorError('invalid_response');
    const data = dingtalkJSON(await file.readFile('utf8'));
    return {
      authorityId: dingtalkId(data.authorityId),
      subjectId: dingtalkId(data.subjectId),
      label: '',
    };
  } finally {
    await file.close();
  }
}
async function compatible(run: ProviderCliProcess, signal?: AbortSignal): Promise<boolean> {
  const result = await run({ args: ['--version'], signal });
  active(signal);
  return (
    result.exitCode === 0 &&
    /^dws version v1\.0\.61(?: \([a-zA-Z0-9._-]+, [a-zA-Z0-9:+._-]+\))?\s*$/u.test(result.stdout)
  );
}
async function prepareProfile(directory: string): Promise<void> {
  await ensureProviderDirectory(path.join(directory, 'keychain'));
  await ensureProviderDirectory(path.join(directory, 'config'));
  const policy = path.join(directory, 'config', 'pat_policy.json');
  const expected = '{"default":{"openBrowser":false}}\n';
  await writeFile(policy, expected, { mode: 0o600, flag: 'wx' }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw new ReadConnectorError('invalid_response');
    },
  );
  const file = await open(policy, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.size !== Buffer.byteLength(expected) ||
      (await file.readFile('utf8')) !== expected
    )
      throw new ReadConnectorError('invalid_response');
  } finally {
    await file.close();
  }
}
async function online(
  run: ProviderCliProcess,
  expected: ReadConnectorIdentity,
  signal?: AbortSignal,
): Promise<ReadConnectorIdentity> {
  const selector = `${dingtalkId(expected.authorityId)}:${dingtalkId(expected.subjectId)}`;
  const result = await run({
    args: ['--profile', selector, 'contact', 'user', 'get-self', '--format', 'json'],
    signal,
  });
  active(signal);
  if (result.exitCode !== 0) throw new ReadConnectorError('authorization_failed');
  return dingtalkOnlineIdentity(dingtalkJSON(result.stdout), expected);
}
async function login(
  run: ProviderCliProcess,
  input: FeishuOnboardingInput,
): Promise<ReadConnectorIdentity> {
  let buffered = '';
  let authorizationUrl: string | undefined;
  const line = (value: string) => {
    const candidate = value.trim();
    if (!candidate.startsWith('https://')) return;
    if (
      !isDingtalkAuthorizationUrl(candidate) ||
      (authorizationUrl && authorizationUrl !== candidate)
    )
      throw new ReadConnectorError('invalid_response');
    if (authorizationUrl) return;
    authorizationUrl = candidate;
    input.onProgress({
      phase: 'waiting_authorization',
      authorizationUrl,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    });
  };
  const result = await run({
    args: ['auth', 'login', '--no-browser', '--format', 'json'],
    signal: input.signal,
    timeoutMs: 330000,
    onOutput: (stream, chunk) => {
      if (stream !== 'stderr') return;
      buffered += chunk;
      const lines = buffered.split(/\r?\n/u);
      buffered = lines.pop() ?? '';
      lines.forEach(line);
    },
  });
  line(buffered);
  active(input.signal);
  if (result.exitCode !== 0) throw new ReadConnectorError('authorization_failed');
  const data = dingtalkJSON(result.stdout);
  if (!authorizationUrl || data.success !== true || data.token_valid !== true)
    throw new ReadConnectorError('invalid_response');
  return { authorityId: dingtalkId(data.corp_id), subjectId: dingtalkId(data.user_id), label: '' };
}

export function createDingtalkConnector(options: DingtalkOptions): ReadConnector {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const supported = platform === 'darwin' && arch === 'arm64';
  const factory = options.processFactory ?? createProviderCliProcess;
  const verifyBinary = options.verifyBinary ?? verifyDingtalkBinary;
  const makeProcess = (executable: string, directory: string): ProviderCliProcess => {
    const run = factory({
      executable,
      cwd: path.join(directory, 'work'),
      // Config alone does not isolate the official CLI's macOS token ciphertext files.
      overrides: {
        DWS_CONFIG_DIR: path.join(directory, 'config'),
        DWS_KEYCHAIN_DIR: path.join(directory, 'keychain'),
      },
    });
    return async (request) => {
      active(request.signal);
      await prepareProfile(directory);
      let stamp: string | undefined;
      return run({
        ...request,
        beforeSpawn: async () => {
          await request.beforeSpawn?.();
          const before = dingtalkExecutableStamp(executable);
          if (
            !(await verifyBinary(executable, request.signal)) ||
            before !== dingtalkExecutableStamp(executable)
          )
            throw new ReadConnectorError('installation_failed');
          stamp = before;
        },
        assertSpawn: () => {
          request.assertSpawn?.();
          if (!stamp || stamp !== dingtalkExecutableStamp(executable))
            throw new ReadConnectorError('installation_failed');
        },
      });
    };
  };
  const installer =
    options.installer ??
    createProviderCliInstaller({
      root: options.root,
      provider: 'dingtalk',
      version: VERSION,
      platform,
      arch,
      executableName: 'dws',
      asset: supported ? ASSET : undefined,
      verifyBinary,
    });
  const verifyInstall = async (signal?: AbortSignal) => {
    active(signal);
    if (!supported) throw new ReadConnectorError('unsupported_platform');
    if (!(await regularFile(installer.executable))) return false;
    await ensureProviderDirectory(path.dirname(installer.executable));
    if (!(await verifyBinary(installer.executable, signal)))
      throw new ReadConnectorError('installation_failed');
    if (
      !(await compatible(
        makeProcess(installer.executable, path.join(options.root, 'dingtalk', 'verification')),
        signal,
      ))
    )
      throw new ReadConnectorError('installation_failed');
    return true;
  };
  return {
    id: 'dingtalk-cli',
    acceptsResource(value) {
      try {
        dingtalkNodeId(value);
        return true;
      } catch {
        return false;
      }
    },
    isAuthorizationUrl: isDingtalkAuthorizationUrl,
    async inspect(profile, signal) {
      let installed = false;
      try {
        const directory = profilePath(options.root, profile);
        installed = await verifyInstall(signal);
        if (!installed) return { installed: false, reason: 'needs_install' };
        const selected = await binding(directory);
        if (!selected) return { installed, version: VERSION, reason: 'authorization_failed' };
        return {
          installed,
          version: VERSION,
          identity: await online(makeProcess(installer.executable, directory), selected, signal),
        };
      } catch (error) {
        active(signal);
        return {
          installed,
          ...(installed ? { version: VERSION } : {}),
          reason: safeError(error).code,
        };
      }
    },
    async run(input) {
      try {
        active(input.signal);
        const directory = profilePath(options.root, input.profile);
        input.onProgress({ phase: 'preparing' });
        if (!(await verifyInstall(input.signal))) {
          if (!input.installCli) throw new ReadConnectorError('needs_install');
          input.onProgress({ phase: 'installing' });
          await installer.install(input.signal);
          if (!(await verifyInstall(input.signal)))
            throw new ReadConnectorError('installation_failed');
        }
        await ensureProviderDirectory(path.dirname(directory));
        // Never reauthorize into an existing or cancelled flow's credential directory.
        await mkdir(directory, { mode: 0o700 });
        const run = makeProcess(installer.executable, directory);
        const authenticated = await login(run, input);
        input.onProgress({ phase: 'verifying' });
        const verified = await online(run, authenticated, input.signal);
        active(input.signal);
        await writeFile(path.join(directory, 'binding.json'), JSON.stringify(verified), {
          mode: 0o600,
          flag: 'wx',
        });
        active(input.signal);
      } catch (error) {
        active(input.signal);
        throw safeError(error);
      }
    },
    async read(input) {
      try {
        const id = dingtalkNodeId(input.documentUrl);
        const directory = profilePath(options.root, input.profile);
        if (!(await verifyInstall())) throw new ReadConnectorError('needs_install');
        const selected = await binding(directory);
        if (
          !selected ||
          selected.authorityId !== input.expected.authorityId ||
          selected.subjectId !== input.expected.subjectId
        )
          throw new ReadConnectorError('identity_changed');
        const run = makeProcess(installer.executable, directory);
        await online(run, selected);
        const args = ['--profile', `${selected.authorityId}:${selected.subjectId}`, 'doc'];
        const infoResult = await run({
          args: [...args, 'info', '--node', id, '--format', 'json'],
          beforeSpawn: async () => {
            await input.beforeRead();
            await online(run, selected);
          },
          assertSpawn: input.assertRead,
        });
        input.assertRead();
        if (infoResult.exitCode !== 0) throw new ReadConnectorError('read_failed');
        const info = dingtalkJSON(infoResult.stdout);
        if (info.nodeId !== id || info.contentType !== 'ALIDOC' || info.extension !== 'adoc')
          throw new ReadConnectorError('invalid_response');
        const title = typeof info.title === 'string' ? info.title : info.name;
        if (
          typeof title !== 'string' ||
          !title.trim() ||
          title.length > 512 ||
          /[\u0000-\u001f\u007f]/u.test(title)
        )
          throw new ReadConnectorError('invalid_response');
        const result = await run({
          args: [...args, 'read', '--node', id, '--format', 'json'],
          beforeSpawn: async () => {
            await online(run, selected);
          },
          assertSpawn: input.assertRead,
        });
        input.assertRead();
        if (result.exitCode !== 0) throw new ReadConnectorError('read_failed');
        const content = dingtalkJSON(result.stdout).markdown;
        if (typeof content !== 'string' || content.length > 1024 * 1024)
          throw new ReadConnectorError('invalid_response');
        return checkReadConnectorDocument({
          documentId: id,
          url: input.documentUrl,
          title,
          revision: 0,
          content,
        });
      } catch (error) {
        throw safeError(error);
      }
    },
  };
}
