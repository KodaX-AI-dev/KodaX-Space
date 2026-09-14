import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSpaceDataDir } from '../kodax/data-paths.js';
import { adminPolicyAuditStore } from '../kodax/admin-policy-audit-store.js';
import { getSpaceExtensionStore } from '../space-extensions/runtime.js';
import { pushToRenderer } from '../ipc/push.js';
import { FeishuCli } from './feishu-cli.js';
import { PartnerConnectorService } from './service.js';
import { PartnerConnectorTasks } from './connection-tasks.js';
import { createFeishuOnboardingCli } from './feishu-onboarding-cli.js';
import { resolveBundledFeishuCliArchivePath } from './feishu-cli-bundle.js';
import { createWecomConnector } from './wecom-cli.js';
import { createDingtalkConnector } from './dingtalk-connector.js';
import { createTencentMeetingConnector } from './tencent-meeting-connector.js';
import {
  createOfficialRemoteConnectorBundle,
  createVerifiedCredentialStore,
} from './official-remote-runtime.js';
import { getKey, setKey, deleteKey } from '../providers/keychain.js';
import { createTencentDocsConnector } from './tencent-docs-connector.js';
import { createMailConnector } from './mail-connector.js';
import { ReadConnectorError } from './read-connector.js';
import type { FeishuOnboardingInput } from './feishu-onboarding-cli.js';
const credentials = createVerifiedCredentialStore({ get: getKey, set: setKey, delete: deleteKey });
async function requestMailCredentials(input: FeishuOnboardingInput) {
  const value = await input.requestInput?.('mail_credentials');
  if (!value || !('email' in value)) throw new ReadConnectorError('authorization_failed');
  return value;
}

let service: PartnerConnectorService | undefined;
let tasks: PartnerConnectorTasks | undefined;
let onboardingCli: ReturnType<typeof createFeishuOnboardingCli> | undefined;

function currentModuleDirectory(): string {
  if (typeof __dirname === 'string') return __dirname;
  return path.dirname(fileURLToPath(import.meta.url));
}

interface PartnerConnectorRuntimeEnvironment {
  readonly isPackaged: boolean;
  readonly mainDirectory: string;
  readonly resourcesPath: string;
}

// Keep Electron process state at the composition root. Importing this module from the
// Node test runner must not eagerly load Electron's main-process-only named exports.
const sourceModuleDirectory = currentModuleDirectory();
let runtimeEnvironment: PartnerConnectorRuntimeEnvironment = {
  isPackaged: false,
  mainDirectory: sourceModuleDirectory,
  resourcesPath: path.resolve(sourceModuleDirectory, '..'),
};

export function configurePartnerConnectorRuntimeEnvironment(
  environment: PartnerConnectorRuntimeEnvironment,
): void {
  if (onboardingCli) {
    throw new Error('Partner connector runtime environment is already in use');
  }
  runtimeEnvironment = { ...environment };
}

const cli = () =>
  (onboardingCli ??= createFeishuOnboardingCli({
    root: path.join(getSpaceDataDir(), 'partner-connectors'),
    bundledArchive: resolveBundledFeishuCliArchivePath({
      ...runtimeEnvironment,
    }),
  }));
let policyRevision = 0;
export function invalidateConnectorPolicy(): void {
  policyRevision++;
}
export function getPartnerConnectorService(): PartnerConnectorService {
  return (service ??= new PartnerConnectorService(
    path.join(getSpaceDataDir(), 'partner-connectors'),
    {
      cli: new FeishuCli((request) => cli().runner(request)),
      readConnectors: {
        'tencent-docs-mcp': createTencentDocsConnector({ credentials }),
        'netease-mail-imap': createMailConnector({
          id: 'netease-mail-imap',
          credentials,
          requestCredentials: requestMailCredentials,
        }),
        'qq-mail-imap': createMailConnector({
          id: 'qq-mail-imap',
          credentials,
          requestCredentials: requestMailCredentials,
        }),
        ...createOfficialRemoteConnectorBundle({
          root: path.join(getSpaceDataDir(), 'partner-connectors'),
        }),
        'wecom-cli': createWecomConnector({
          root: path.join(getSpaceDataDir(), 'partner-connectors'),
        }),
        'dingtalk-cli': createDingtalkConnector({
          root: path.join(getSpaceDataDir(), 'partner-connectors'),
        }),
        'tencent-meeting-cli': createTencentMeetingConnector({
          root: path.join(getSpaceDataDir(), 'partner-connectors'),
        }),
      },
      revokeConnections: (extensionId) =>
        tasks?.cancelForExtension(extensionId) ?? Promise.resolve(),
      getPolicyRevision: () => policyRevision,
      catalog: async (extensionId) =>
        (await getSpaceExtensionStore().getManifest(extensionId)).connectors,
      extensionCapabilities: async (extensionId) =>
        (await getSpaceExtensionStore().getManifest(extensionId)).requiredHostCapabilities,
      checkPolicy: async (connectorId, write) => {
        const { policy } = await adminPolicyAuditStore.getPolicy();
        if (
          policy.connectors.deny.includes(connectorId) ||
          (policy.connectors.allow.length > 0 && !policy.connectors.allow.includes(connectorId)) ||
          (write && !policy.connectors.writesAllowed)
        ) {
          throw new Error(
            write
              ? '管理员策略未允许此连接器写入；请在连接器详情查看写入策略'
              : '管理员策略未允许此连接器',
          );
        }
      },
      changed: (context) => pushToRenderer('partner.connectors.changed', context ?? {}),
    },
  ));
}

export function getPartnerConnectorTasks(): PartnerConnectorTasks {
  return (tasks ??= new PartnerConnectorTasks({
    service: getPartnerConnectorService(),
    run: (input) => cli().run(input),
    resolveAdapter: (owner) =>
      getPartnerConnectorService().onboardingAdapter(owner.extensionId, owner.connectorId),
    openExternal: async (url, assertActive) => {
      const { shell } = await import('electron');
      assertActive();
      await shell.openExternal(url);
    },
    changed: (job) => pushToRenderer('partner.connectors.onboarding.changed', { job }),
  }));
}

export async function disposePartnerConnectorTasks(): Promise<void> {
  await tasks?.dispose();
}
