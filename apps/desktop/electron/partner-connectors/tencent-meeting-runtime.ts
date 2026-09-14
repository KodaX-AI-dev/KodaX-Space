import { createHash } from 'node:crypto';
import { constants, lstatSync } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createProviderCliInstaller, type ProviderCliInstaller } from './provider-cli-install.js';
import {
  createProviderCliProcess,
  ensureProviderDirectory,
  type ProviderCliProcess,
} from './provider-cli-process.js';
import { ReadConnectorError } from './read-connector.js';

export const TENCENT_MEETING_VERSION = '1.0.15';
export const TENCENT_MEETING_PROVIDER = 'tencent-meeting-cli';
export const TENCENT_MEETING_PROFILE =
  /^space-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const BINARY_SHA256 = 'f245226550cda8e1ea8b6e6bafbead2fb91e6e823b52905f5bb1cae485ec3914';
const BINARY_SIZE = 6978882;
const ASSET = {
  url: 'https://registry.npmjs.org/@tencentcloud/tmeet/-/tmeet-1.0.15.tgz',
  sha512:
    'lMvcaNgEujhYk7RNakghdyjk5VukEeHrJOlpTenNhyiNuBcCEa9XtW8pYMQQDcxltAQpT9omGogkaXXAakN10w==',
  binaryPath: 'package/dist/tmeet-macOS-AppleSilicon',
  allowedFiles: [
    'package/LICENSE',
    'package/dist/tmeet-Linux-ARM64',
    'package/dist/tmeet-Linux-x86_64',
    'package/dist/tmeet-macOS-AppleSilicon',
    'package/dist/tmeet-macOS-Intel',
    'package/dist/tmeet-Windows-x86_64.exe',
    'package/scripts/cleanup.js',
    'package/scripts/tmeet.js',
    'package/package.json',
    'package/README.md',
  ],
};

function active(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ReadConnectorError('cancelled');
}

/** Match the authenticated file synchronously after the host's last dispatch guard. */
function executableStamp(file: string): string {
  try {
    const stat = lstatSync(file, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n)
      throw new ReadConnectorError('installation_failed');
    return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mode}:${stat.mtimeNs}:${stat.ctimeNs}`;
  } catch {
    throw new ReadConnectorError('installation_failed');
  }
}

/** Hash the bounded native artifact without executing npm scripts or the binary. */
export async function verifyTencentMeetingBinary(
  file: string,
  signal?: AbortSignal,
): Promise<boolean> {
  active(signal);
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== BINARY_SIZE) return false;
    await ensureProviderDirectory(path.dirname(file));
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.size !== BINARY_SIZE || opened.ino !== stat.ino) return false;
      const content = await handle.readFile({ signal });
      active(signal);
      return (
        content.length === BINARY_SIZE &&
        createHash('sha256').update(content).digest('hex') === BINARY_SHA256
      );
    } finally {
      await handle.close();
    }
  } catch {
    active(signal);
    return false;
  }
}

export function createTencentMeetingInstaller(options: {
  root: string;
  platform: NodeJS.Platform;
  arch: string;
}): ProviderCliInstaller {
  return createProviderCliInstaller({
    ...options,
    provider: TENCENT_MEETING_PROVIDER,
    version: TENCENT_MEETING_VERSION,
    executableName: 'tmeet',
    asset: options.platform === 'darwin' && options.arch === 'arm64' ? ASSET : undefined,
    verifyBinary: verifyTencentMeetingBinary,
  });
}

async function claimAuthorization(config: string, data: string): Promise<void> {
  try {
    const meta = await lstat(path.join(config, 'config.json')).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
        return undefined;
      },
    );
    if (meta || (await readdir(data)).length) throw new ReadConnectorError('invalid_response');
    const marker = await open(path.join(config, '.authorization-attempt'), 'wx', 0o600);
    await marker.close();
  } catch {
    throw new ReadConnectorError('invalid_response');
  }
}

/** Host-only paths. Config and encrypted credentials are isolated together. */
export function createTencentMeetingPrivateProcess(
  root: string,
  executable: string,
  profile: string,
  dependencies: {
    createProcess?: typeof createProviderCliProcess;
    verifyBinary?: typeof verifyTencentMeetingBinary;
  } = {},
): ProviderCliProcess {
  if (!TENCENT_MEETING_PROFILE.test(profile)) throw new ReadConnectorError('invalid_response');
  const directory = path.join(root, TENCENT_MEETING_PROVIDER, 'profiles', profile);
  const config = path.join(directory, 'config');
  const data = path.join(directory, 'data');
  const verifyBinary = dependencies.verifyBinary ?? verifyTencentMeetingBinary;
  const run = (dependencies.createProcess ?? createProviderCliProcess)({
    executable,
    cwd: path.join(directory, 'work'),
    overrides: { TMEET_CLI_CONFIG_DIR: config, TMEET_CLI_DATA_DIR: data },
  });
  return async (input) => {
    active(input.signal);
    if (!(await verifyBinary(executable, input.signal)))
      throw new ReadConnectorError('needs_install');
    await ensureProviderDirectory(config);
    await ensureProviderDirectory(data);
    if (input.args[0] === 'auth' && input.args[1] === 'login')
      await claimAuthorization(config, data);
    active(input.signal);
    let stamp: string | undefined;
    return run({
      ...input,
      beforeSpawn: async () => {
        await input.beforeSpawn?.();
        const before = executableStamp(executable);
        if (
          !(await verifyBinary(executable, input.signal)) ||
          before !== executableStamp(executable)
        )
          throw new ReadConnectorError('installation_failed');
        stamp = before;
      },
      assertSpawn: () => {
        input.assertSpawn?.();
        if (!stamp || stamp !== executableStamp(executable))
          throw new ReadConnectorError('installation_failed');
      },
    });
  };
}
