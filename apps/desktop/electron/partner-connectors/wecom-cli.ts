import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createProviderCliInstaller, type ProviderCliInstaller } from './provider-cli-install.js';
import { verifyWecomBinary, wecomExecutableStamp } from './wecom-native.js';
import {
  createProviderCliProcess,
  ensureProviderDirectory,
  type ProviderCliProcess,
  type ProviderCliProcessOptions,
  type ProviderCliResponse,
} from './provider-cli-process.js';
import {
  ReadConnectorError,
  checkReadConnectorDocument,
  type ReadConnector,
  type ReadConnectorIdentity,
  type ReadConnectorStatus,
} from './read-connector.js';

const VERSION = '1.2.0';
const MAX_CONTENT = 1024 * 1024;
const PROFILE = /^space-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const PRIVATE_FILES = ['credentials.enc', '.encryption_key', 'bot.enc', 'token.enc'];

export interface WecomConnectorOptions {
  root: string;
  platform?: NodeJS.Platform;
  arch?: string;
  env?: NodeJS.ProcessEnv;
  installer?: ProviderCliInstaller;
  verifyBinary?: (file: string, signal?: AbortSignal) => Promise<boolean>;
  processFactory?: (options: ProviderCliProcessOptions) => ProviderCliProcess;
}

function active(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ReadConnectorError('cancelled');
}

async function regular(file: string): Promise<boolean> {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw new ReadConnectorError('invalid_response');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new ReadConnectorError('invalid_response');
  }
}

function documentId(value: string): string | undefined {
  if (value.length > 8192 || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return;
  const internal = /^wecom:\/\/document\/([A-Za-z0-9_-]{1,128})$/u.exec(value);
  if (internal) return /^(?:a1|b1)_/u.test(internal[1]) ? undefined : internal[1];
  const external =
    /^https:\/\/doc\.weixin\.qq\.com\/doc\/([A-Za-z0-9_-]{1,128})(?:\?[^#]*)?$/u.exec(value);
  if (!external || /^(?:a1|b1)_/u.test(external[1])) return;
  const url = new URL(value);
  if (
    [...url.searchParams.keys()].some((key) => key !== 'scode') ||
    url.searchParams.getAll('scode').length > 1
  )
    return;
  if ([...url.searchParams.values()].some((item) => !item || /[\s\u0000-\u001f\u007f]/u.test(item)))
    return;
  return external[1];
}

export function isWecomAuthorizationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192 || /[\s\\\u0000-\u001f\u007f]/u.test(value))
    return false;
  try {
    const url = new URL(value);
    return (
      /^https:\/\/work\.weixin\.qq\.com\/ai\/qc\/gen\?/u.test(value) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      [...url.searchParams.keys()].length === 2 &&
      url.searchParams.getAll('source').length === 1 &&
      url.searchParams.get('source') === 'wecom_cli_external' &&
      url.searchParams.getAll('scode').length === 1 &&
      !!url.searchParams.get('scode') &&
      [...url.searchParams.values()].every((item) => !/[\s\u0000-\u001f\u007f]/u.test(item))
    );
  } catch {
    return false;
  }
}

function json(result: ProviderCliResponse): Record<string, unknown> {
  if (result.exitCode !== 0) throw new ReadConnectorError('read_failed');
  try {
    const value: unknown = JSON.parse(result.stdout);
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length)
      throw new ReadConnectorError('invalid_response');
    const object = value as Record<string, unknown>;
    if ('error' in object || ('errcode' in object && object.errcode !== 0))
      throw new ReadConnectorError('invalid_response');
    return object;
  } catch {
    throw new ReadConnectorError('invalid_response');
  }
}

async function botId(run: ProviderCliProcess, signal?: AbortSignal): Promise<string> {
  const result = await run({ args: ['auth', 'show'], signal });
  active(signal);
  const match = /^Status: authorized\r?\nBot ID: ([A-Za-z0-9_-]{1,160})\r?\n?$/u.exec(
    result.stdout,
  );
  if (result.exitCode !== 0 || !match) throw new ReadConnectorError('authorization_failed');
  return match[1];
}

async function verifiedIdentity(
  run: ProviderCliProcess,
  signal?: AbortSignal,
): Promise<ReadConnectorIdentity> {
  const before = await botId(run, signal);
  json(await run({ args: ['identity', 'whoami'], signal }));
  active(signal);
  if ((await botId(run, signal)) !== before) throw new ReadConnectorError('identity_changed');
  return { authorityId: 'wecom-bot', subjectId: before, label: '企业微信机器人' };
}

function sameIdentity(actual: ReadConnectorIdentity, expected: ReadConnectorIdentity): boolean {
  return actual.authorityId === expected.authorityId && actual.subjectId === expected.subjectId;
}

async function contentFile(file: unknown, directory: string): Promise<string> {
  if (
    typeof file !== 'string' ||
    !path.isAbsolute(file) ||
    path.normalize(file) !== file ||
    file.includes('\0')
  )
    throw new ReadConnectorError('invalid_response');
  const relative = path.relative(directory, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new ReadConnectorError('invalid_response');
  await ensureProviderDirectory(path.dirname(file));
  if ((await realpath(file)) !== file) throw new ReadConnectorError('invalid_response');
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_CONTENT)
      throw new ReadConnectorError('invalid_response');
    const bytes = Buffer.alloc(MAX_CONTENT + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_CONTENT) throw new ReadConnectorError('invalid_response');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

export function createWecomConnector(options: WecomConnectorOptions): ReadConnector {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const supported = platform === 'darwin' && arch === 'arm64';
  const processFactory = options.processFactory ?? createProviderCliProcess;
  const verifyBinary = options.verifyBinary ?? verifyWecomBinary;
  const base = path.join(options.root, 'wecom-cli');
  if (!path.isAbsolute(options.root)) throw new ReadConnectorError('invalid_response');
  const paths = (profile: string) => {
    if (!PROFILE.test(profile)) throw new ReadConnectorError('invalid_response');
    const directory = path.join(base, 'profiles', profile);
    return {
      config: path.join(directory, 'config'),
      cwd: path.join(directory, 'work'),
      tmp: path.join(directory, 'tmp'),
    };
  };
  const prepare = async (profile: string) => {
    const locations = paths(profile);
    await Promise.all(Object.values(locations).map(ensureProviderDirectory));
    const configFile = path.join(locations.config, 'config.json');
    await writeFile(configFile, '{}', { flag: 'wx', mode: 0o600 }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw new ReadConnectorError('invalid_response');
      },
    );
    if (
      !(await regular(configFile)) ||
      (await lstat(configFile)).size !== 2 ||
      (await readFile(configFile, 'utf8')) !== '{}'
    )
      throw new ReadConnectorError('invalid_response');
    for (const name of PRIVATE_FILES) {
      const exists = await regular(path.join(locations.config, name));
      if (exists && ['bot.enc', 'token.enc'].includes(name))
        throw new ReadConnectorError('invalid_response');
    }
    return locations;
  };
  const processFor = async (file: string, profile: string): Promise<ProviderCliProcess> => {
    const locations = await prepare(profile);
    const run = processFactory({
      executable: file,
      cwd: locations.cwd,
      env: options.env,
      overrides: {
        WECOM_CLI_CONFIG_DIR: locations.config,
        WECOM_CLI_TMP_DIR: locations.tmp,
        WECOM_CLI_LOG_LEVEL: 'off',
        // 1.2.0 has no file-log off switch. Its documented source disables file logging
        // when this path cannot be a directory. The runner owns this empty regular file.
        // This also blocks any compile-time default log destination without recording secrets.
        WECOM_CLI_LOG_DIR: path.join(locations.cwd, '.env'),
      },
    });
    return async (input) => {
      await prepare(profile);
      active(input.signal);
      let stamp: string | undefined;
      return run({
        ...input,
        beforeSpawn: async () => {
          await input.beforeSpawn?.();
          const before = wecomExecutableStamp(file);
          if (!(await verifyBinary(file, input.signal)) || before !== wecomExecutableStamp(file))
            throw new ReadConnectorError('installation_failed');
          stamp = before;
        },
        assertSpawn: () => {
          input.assertSpawn?.();
          if (!stamp || stamp !== wecomExecutableStamp(file))
            throw new ReadConnectorError('installation_failed');
        },
      });
    };
  };
  const installer =
    options.installer ??
    createProviderCliInstaller({
      root: options.root,
      provider: 'wecom-cli',
      version: VERSION,
      platform,
      arch,
      asset: supported
        ? {
            url: 'https://registry.npmjs.org/@wecom/cli-darwin-arm64/-/cli-darwin-arm64-1.2.0.tgz',
            sha512:
              'fI5ii3F84NzsoIH8/WSLlSuNbcYeitwfOjAL7ktUSi6QtOyFK6yqXcWde5u67p9ZZj57tEFOqsgS4bOZdQIEUw==',
            binaryPath: 'package/bin/wecom-cli',
            allowedFiles: [
              'package/LICENSE',
              'package/bin/wecom-cli',
              'package/package.json',
              'package/README.md',
            ],
          }
        : undefined,
      verifyBinary,
    });
  const installed = async () => {
    if (!(await regular(installer.executable))) return false;
    if (!(await verifyBinary(installer.executable)))
      throw new ReadConnectorError('installation_failed');
    return true;
  };
  const requireRun = async (profile: string, signal?: AbortSignal): Promise<ProviderCliProcess> => {
    active(signal);
    if (!supported) throw new ReadConnectorError('unsupported_platform');
    if (!(await installed())) throw new ReadConnectorError('needs_install');
    const run = await processFor(installer.executable, profile);
    const result = await run({ args: ['--version'], signal, timeoutMs: 10000 });
    if (
      result.exitCode !== 0 ||
      !/^wecom-cli 1\.2\.0 \((?:npm|unknown) \d{4}-\d{2}-\d{2}T[0-9:]+Z 78c514b(?:2afee7c0d3d7be715628478421f37ee63)?\)\s*$/u.test(
        result.stdout,
      )
    )
      throw new ReadConnectorError('installation_failed');
    return run;
  };
  const inspect = async (profile: string, signal?: AbortSignal): Promise<ReadConnectorStatus> => {
    paths(profile);
    active(signal);
    let available = false;
    try {
      if (!supported) throw new ReadConnectorError('unsupported_platform');
      available = await installed();
      const run = await requireRun(profile, signal);
      return { installed: true, version: VERSION, identity: await verifiedIdentity(run, signal) };
    } catch (error) {
      active(signal);
      const safe =
        error instanceof ReadConnectorError ? error : new ReadConnectorError('invalid_response');
      return {
        installed: available,
        ...(available ? { version: VERSION } : {}),
        reason: safe.message,
      };
    }
  };
  return {
    id: 'wecom-cli',
    inspect,
    isAuthorizationUrl: isWecomAuthorizationUrl,
    acceptsResource: (value) => !!documentId(value),
    run: async (input) => {
      try {
        paths(input.profile);
        active(input.signal);
        if (!supported) throw new ReadConnectorError('unsupported_platform');
        input.onProgress({ phase: 'preparing' });
        if (!(await installed())) {
          if (!input.installCli) throw new ReadConnectorError('needs_install');
          input.onProgress({ phase: 'installing' });
          await installer.install(input.signal);
        }
        const run = await requireRun(input.profile, input.signal);
        const locations = paths(input.profile);
        if (await regular(path.join(locations.config, 'credentials.enc')))
          throw new ReadConnectorError('authorization_failed');
        let authorizationUrl: string | undefined;
        let pending = '';
        const result = await run({
          args: ['auth', 'init', '--noninteractive', '--no-browser'],
          signal: input.signal,
          timeoutMs: 330000,
          onOutput: (stream, chunk) => {
            active(input.signal);
            if (stream !== 'stdout') return;
            pending += chunk;
            const lines = pending.split(/\r?\n/u);
            pending = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('https://')) continue;
              if (!isWecomAuthorizationUrl(line) || (authorizationUrl && authorizationUrl !== line))
                throw new ReadConnectorError('invalid_response');
              if (!authorizationUrl) {
                authorizationUrl = line;
                input.onProgress({
                  phase: 'waiting_authorization',
                  authorizationUrl,
                  expiresAt: new Date(Date.now() + 300000).toISOString(),
                });
              }
            }
          },
        });
        active(input.signal);
        if (result.exitCode !== 0 || !authorizationUrl)
          throw new ReadConnectorError('authorization_failed');
        input.onProgress({ phase: 'verifying' });
        await verifiedIdentity(await processFor(installer.executable, input.profile), input.signal);
        active(input.signal);
      } catch (error) {
        active(input.signal);
        throw error instanceof ReadConnectorError
          ? error
          : new ReadConnectorError('authorization_failed');
      }
    },
    read: async (input) => {
      const id = documentId(input.documentUrl);
      if (!id) throw new ReadConnectorError('invalid_resource');
      try {
        const run = await requireRun(input.profile);
        if (!sameIdentity(await verifiedIdentity(run), input.expected))
          throw new ReadConnectorError('identity_changed');
        const value = json(
          await run({
            args: [
              'doc',
              'contents',
              'get',
              '--json',
              JSON.stringify({ docid: id, content_type: 'markdown' }),
            ],
            beforeSpawn: async () => {
              await input.beforeRead();
              if (!sameIdentity(await verifiedIdentity(run), input.expected))
                throw new ReadConnectorError('identity_changed');
            },
            assertSpawn: input.assertRead,
          }),
        );
        input.assertRead();
        if ((await botId(run)) !== input.expected.subjectId)
          throw new ReadConnectorError('identity_changed');
        if (
          typeof value.url !== 'string' ||
          documentId(value.url) !== id ||
          typeof value.name !== 'string' ||
          value.name.length > 1024 ||
          !Number.isSafeInteger(value.version) ||
          (value.version as number) < 0
        )
          throw new ReadConnectorError('invalid_response');
        const content =
          typeof value.content === 'string'
            ? value.content
            : await contentFile(value.file_path, paths(input.profile).tmp);
        if (Buffer.byteLength(content) > MAX_CONTENT)
          throw new ReadConnectorError('invalid_response');
        input.assertRead();
        return checkReadConnectorDocument({
          documentId: id,
          url: input.documentUrl,
          title: value.name,
          revision: value.version as number,
          content,
        });
      } catch (error) {
        throw error instanceof ReadConnectorError ? error : new ReadConnectorError('read_failed');
      }
    },
  };
}
