import type { FeishuOnboardingInput } from './feishu-onboarding-cli.js';
import type { ProviderCliInstaller } from './provider-cli-install.js';
import type { ProviderCliProcess } from './provider-cli-process.js';
import {
  authorizeTencentMeeting,
  isTencentMeetingAuthorizationUrl,
} from './tencent-meeting-auth.js';
import {
  createTencentMeetingInstaller,
  createTencentMeetingPrivateProcess,
  TENCENT_MEETING_PROVIDER as PROVIDER,
  TENCENT_MEETING_VERSION as VERSION,
  TENCENT_MEETING_PROFILE as PROFILE,
} from './tencent-meeting-runtime.js';
import {
  ReadConnectorError,
  checkReadConnectorDocument,
  type ReadConnector,
  type ReadConnectorIdentity,
  type ReadConnectorStatus,
  type ReadConnectorDocument,
  type ReadConnectorInput,
} from './read-connector.js';

const MEETING_REFERENCE = /^tmeet:\/\/meeting-code\/([0-9]{6,15})$/u;

export interface TencentMeetingConnectorOptions {
  root: string;
  platform?: NodeJS.Platform;
  arch?: string;
  /** Trusted installer seam; never supplied by renderer or model. */
  installer?: ProviderCliInstaller;
  /** Trusted process seam for tests; never supplied by renderer or model. */
  processForProfile?: (profile: string) => ProviderCliProcess;
}

function active(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ReadConnectorError('cancelled');
}

function verifiedIdentity(stdout: string): ReadConnectorIdentity | undefined {
  const lines = stdout.split(/\r?\n/u).filter((line) => line.length > 0);
  if (lines.length !== 5 || lines[0] !== 'Logged in') return undefined;
  const openId = /^ {2}OpenId: {2}([A-Za-z0-9_]{1,256})$/u.exec(lines[1])?.[1];
  const userName = /^ {2}UserName: {2}([^\u0000-\u001f\u007f]{1,160})$/u.exec(lines[2])?.[1].trim();
  if (
    !openId ||
    !userName ||
    !/^ {2}AccessToken: {2}valid \(expires at [^\r\n]+\)$/u.test(lines[3]) ||
    !/^ {2}RefreshToken: valid \(expires at [^\r\n]+\)$/u.test(lines[4])
  )
    return undefined;
  return { authorityId: 'tencent-meeting', subjectId: openId, label: userName };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ReadConnectorError('invalid_response');
  return value as Record<string, unknown>;
}

function safeField(value: unknown, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value))
    throw new ReadConnectorError('invalid_response');
  return value.trim() || undefined;
}

function meetingDocument(stdout: string, meetingCode: string, url: string): ReadConnectorDocument {
  let envelope: Record<string, unknown>;
  try {
    if (Buffer.byteLength(stdout) > 2 * 1024 * 1024) throw new Error('output limit');
    envelope = object(JSON.parse(stdout) as unknown);
  } catch {
    throw new ReadConnectorError('invalid_response');
  }
  const meetings = object(envelope.data).meeting_info_list;
  if (envelope.error !== undefined || !Array.isArray(meetings) || meetings.length !== 1)
    throw new ReadConnectorError('invalid_response');
  const meeting = object(meetings[0]);
  if (meeting.meeting_code !== meetingCode) throw new ReadConnectorError('invalid_response');
  const title = safeField(meeting.subject, 300);
  if (!title) throw new ReadConnectorError('invalid_response');
  const lines = [`会议主题：${title}`, `会议号：${meetingCode}`];
  for (const [key, label] of [
    ['start_time', '开始时间'],
    ['end_time', '结束时间'],
    ['status', '状态'],
  ]) {
    const value = safeField(meeting[key], 100);
    if (value) lines.push(`${label}：${value}`);
  }
  lines.push(
    '',
    '仅含会议基本信息；未向模型展示或导出录制、纪要或参会人。官方 CLI 当前可能附带读取录制基础元数据，Space 会丢弃该数据。',
  );
  const internalMeetingId = typeof meeting.meeting_id === 'string' ? meeting.meeting_id : undefined;
  if (
    internalMeetingId &&
    (title.includes(internalMeetingId) || lines.some((line) => line.includes(internalMeetingId)))
  )
    throw new ReadConnectorError('invalid_response');
  return checkReadConnectorDocument({
    documentId: meetingCode,
    url,
    title,
    revision: 0,
    content: lines.join('\n'),
  });
}

async function compatible(run: ProviderCliProcess, signal: AbortSignal): Promise<boolean> {
  try {
    const response = await run({ args: ['--version'], signal });
    active(signal);
    return response.exitCode === 0 && /^tmeet version v1\.0\.15\s*$/u.test(response.stdout);
  } catch (error) {
    active(signal);
    if (
      error instanceof ReadConnectorError &&
      !['needs_install', 'read_failed'].includes(error.code)
    )
      throw error;
    return false;
  }
}

interface TencentMeetingHost {
  platform: NodeJS.Platform;
  arch: string;
  installer: ProviderCliInstaller;
  processForProfile: (profile: string) => ProviderCliProcess;
}

function requireProfile(host: TencentMeetingHost, profile: string): void {
  if (!PROFILE.test(profile)) throw new ReadConnectorError('invalid_response');
  if (host.platform !== 'darwin' || host.arch !== 'arm64')
    throw new ReadConnectorError('unsupported_platform');
}

async function inspectProfile(
  host: TencentMeetingHost,
  profile: string,
  signal?: AbortSignal,
): Promise<ReadConnectorStatus> {
  active(signal);
  requireProfile(host, profile);
  const run = host.processForProfile(profile);
  let version;
  try {
    version = await run({ args: ['--version'], signal });
  } catch (error) {
    active(signal);
    if (
      error instanceof ReadConnectorError &&
      !['needs_install', 'read_failed'].includes(error.code)
    )
      throw error;
    return { installed: false };
  }
  active(signal);
  if (version.exitCode !== 0 || !/^tmeet version v1\.0\.15\s*$/u.test(version.stdout))
    return { installed: true, reason: '连接组件版本无法验证，请重新安装。' };
  let response;
  try {
    response = await run({ args: ['auth', 'status'], signal });
  } catch (error) {
    active(signal);
    if (error instanceof ReadConnectorError) throw error;
    throw new ReadConnectorError('authorization_failed');
  }
  active(signal);
  const identity = response.exitCode === 0 ? verifiedIdentity(response.stdout) : undefined;
  return identity
    ? { installed: true, version: VERSION, identity }
    : { installed: true, version: VERSION, reason: '腾讯会议在线身份尚未验证，请重新连接。' };
}

async function requireIdentity(
  host: TencentMeetingHost,
  profile: string,
  expected: ReadConnectorIdentity,
): Promise<void> {
  const status = await inspectProfile(host, profile);
  if (!status.identity) throw new ReadConnectorError('authorization_failed');
  if (
    status.identity.authorityId !== expected.authorityId ||
    status.identity.subjectId !== expected.subjectId
  )
    throw new ReadConnectorError('identity_changed');
}

async function ensureInstalled(
  installer: ProviderCliInstaller,
  run: ProviderCliProcess,
  input: FeishuOnboardingInput,
): Promise<void> {
  if (await compatible(run, input.signal)) return;
  if (!input.installCli) throw new ReadConnectorError('needs_install');
  input.onProgress({ phase: 'installing' });
  try {
    await installer.install(input.signal);
  } catch (error) {
    active(input.signal);
    if (error instanceof ReadConnectorError) throw error;
    throw new ReadConnectorError('installation_failed');
  }
  active(input.signal);
  if (!(await compatible(run, input.signal))) throw new ReadConnectorError('installation_failed');
}

async function onboard(
  host: TencentMeetingHost,
  claimedProfiles: Set<string>,
  input: FeishuOnboardingInput,
): Promise<void> {
  try {
    active(input.signal);
    requireProfile(host, input.profile);
    if (claimedProfiles.has(input.profile)) throw new ReadConnectorError('invalid_response');
    input.onProgress({ phase: 'preparing' });
    const run = host.processForProfile(input.profile);
    await ensureInstalled(host.installer, run, input);
    if (claimedProfiles.has(input.profile)) throw new ReadConnectorError('invalid_response');
    claimedProfiles.add(input.profile);
    await authorizeTencentMeeting(run, input);
    active(input.signal);
    input.onProgress({ phase: 'verifying' });
    if (!(await inspectProfile(host, input.profile, input.signal)).identity)
      throw new ReadConnectorError('authorization_failed');
    active(input.signal);
  } catch (error) {
    active(input.signal);
    if (error instanceof ReadConnectorError) throw error;
    throw new ReadConnectorError('authorization_failed');
  }
}

async function readMeeting(
  host: TencentMeetingHost,
  input: ReadConnectorInput,
): Promise<ReadConnectorDocument> {
  const meetingCode = MEETING_REFERENCE.exec(input.documentUrl)?.[1];
  if (!meetingCode) throw new ReadConnectorError('invalid_resource');
  await requireIdentity(host, input.profile, input.expected);
  let response;
  try {
    response = await host.processForProfile(input.profile)({
      args: ['meeting', 'get', '--meeting-code', meetingCode, '--format', 'json'],
      beforeSpawn: async () => {
        await input.beforeRead();
        await requireIdentity(host, input.profile, input.expected);
      },
      assertSpawn: input.assertRead,
    });
  } catch (error) {
    if (error instanceof ReadConnectorError) throw error;
    throw new ReadConnectorError('read_failed');
  }
  input.assertRead();
  if (response.exitCode !== 0) throw new ReadConnectorError('read_failed');
  return meetingDocument(response.stdout, meetingCode, input.documentUrl);
}

export function createTencentMeetingConnector(
  options: TencentMeetingConnectorOptions,
): ReadConnector {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const installer =
    options.installer ?? createTencentMeetingInstaller({ root: options.root, platform, arch });
  const host: TencentMeetingHost = {
    platform,
    arch,
    installer,
    processForProfile:
      options.processForProfile ??
      ((profile) =>
        createTencentMeetingPrivateProcess(options.root, installer.executable, profile)),
  };
  const claimedProfiles = new Set<string>();
  return {
    id: PROVIDER,
    inspect: (profile, signal) => inspectProfile(host, profile, signal),
    acceptsResource: (value) => MEETING_REFERENCE.test(value),
    isAuthorizationUrl: isTencentMeetingAuthorizationUrl,
    run: (input) => onboard(host, claimedProfiles, input),
    read: (input) => readMeeting(host, input),
  };
}
