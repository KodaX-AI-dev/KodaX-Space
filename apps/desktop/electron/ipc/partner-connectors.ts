import { canonProjectRoot } from '@kodax-space/space-ipc-schema';
import { kodaxHost } from '../kodax/host.js';
import { projectStore } from '../projects/store.js';
import {
  getPartnerConnectorService,
  getPartnerConnectorTasks,
} from '../partner-connectors/runtime.js';
import type { PartnerConnectorContext } from '../partner-connectors/service.js';
import { assertSpaceExtensionSender } from './space-extensions.js';
import { registerChannelWithEvent } from './register.js';

async function context(input: {
  sessionId: string;
  projectRoot: string;
}): Promise<PartnerConnectorContext> {
  const root = await projectStore.assertAllowed(input.projectRoot);
  if (!kodaxHost.get(input.sessionId)) await kodaxHost.tryResume(input.sessionId);
  const session = kodaxHost.get(input.sessionId);
  if (
    !session ||
    session.surface !== 'partner' ||
    canonProjectRoot(session.projectRoot, process.platform === 'win32') !==
      canonProjectRoot(root, process.platform === 'win32')
  )
    throw new Error('连接器会话与项目不匹配');
  return {
    sessionId: session.sessionId,
    projectRoot: session.projectRoot,
    surface: session.surface,
    permissionMode: session.permissionMode,
    bindings: session.partnerConnectors ?? [],
    getCurrentBindings: () => kodaxHost.get(input.sessionId)?.partnerConnectors ?? [],
    getCurrentPermissionMode: () => kodaxHost.get(input.sessionId)?.permissionMode ?? 'plan',
  };
}

/** No connector account, source content or review endpoint is exposed to extension frames. */
export function registerPartnerConnectorChannels(
  register = registerChannelWithEvent,
  getTasks = getPartnerConnectorTasks,
): void {
  register('partner.connectors.accounts', async (input, event) => {
    assertSpaceExtensionSender(event);
    return {
      connections: await getPartnerConnectorService().accounts(
        input.extensionId,
        input.connectorId,
      ),
    };
  });
  register('partner.connectors.onboarding.start', (input, event) => {
    assertSpaceExtensionSender(event);
    return { job: getTasks().start(input) };
  });
  register('partner.connectors.onboarding.get', (input, event) => {
    assertSpaceExtensionSender(event);
    return { job: getTasks().get(input) };
  });
  register('partner.connectors.onboarding.cancel', async (input, event) => {
    assertSpaceExtensionSender(event);
    return { job: await getTasks().cancel(input) };
  });
  register('partner.connectors.onboarding.submit', (input, event) => {
    assertSpaceExtensionSender(event);
    return { job: getTasks().submit(input) };
  });
  register('partner.connectors.onboarding.reopen', async (input, event) => {
    assertSpaceExtensionSender(event);
    await getTasks().reopen(input);
    return { ok: true };
  });
  register('space.extensions.connectors.catalog', async (input, event) => {
    assertSpaceExtensionSender(event);
    return { connectors: await getPartnerConnectorService().catalog(input.extensionId) };
  });
  register('partner.connectors.inspect', async (input, event) => {
    assertSpaceExtensionSender(event);
    return getPartnerConnectorService().inspect(input.extensionId, input.connectorId);
  });
  register('partner.connectors.connect', async (input, event) => {
    assertSpaceExtensionSender(event);
    return { connection: await getPartnerConnectorService().connect(input) };
  });
  register('partner.connectors.disconnect', async (input, event) => {
    assertSpaceExtensionSender(event);
    await getPartnerConnectorService().disconnect(input);
    return { ok: true };
  });
  register('partner.connectors.forget', async (input, event) => {
    assertSpaceExtensionSender(event);
    await getPartnerConnectorService().forget(input);
    return { ok: true };
  });
  register('partner.connectors.resolve', async (input, event) => {
    assertSpaceExtensionSender(event);
    await projectStore.assertAllowed(input.projectRoot);
    const service = getPartnerConnectorService();
    return service.describeBindings(await service.resolveSelections(input.connectors));
  });
  register('partner.connectors.search', async (input, event) => {
    assertSpaceExtensionSender(event);
    return getPartnerConnectorService().search(await context(input), input);
  });
  register('partner.connectors.read', async (input, event) => {
    assertSpaceExtensionSender(event);
    return { source: await getPartnerConnectorService().read(await context(input), input) };
  });
  register('partner.connectors.records', async (input, event) => {
    assertSpaceExtensionSender(event);
    return getPartnerConnectorService().records(await context(input));
  });
  register('partner.connectors.sources.get', async (input, event) => {
    assertSpaceExtensionSender(event);
    return { source: await getPartnerConnectorService().getSource(await context(input), input.id) };
  });
  register('partner.connectors.proposals.create', async (input, event) => {
    assertSpaceExtensionSender(event);
    const { sessionId: _sessionId, projectRoot: _projectRoot, ...proposal } = input;
    return { proposal: await getPartnerConnectorService().propose(await context(input), proposal) };
  });
  register('partner.connectors.proposals.get', async (input, event) => {
    assertSpaceExtensionSender(event);
    return {
      proposal: await getPartnerConnectorService().getProposal(await context(input), input.id),
    };
  });
  register('partner.connectors.proposals.apply', async (input, event) => {
    assertSpaceExtensionSender(event);
    return {
      proposal: await getPartnerConnectorService().apply(
        await context(input),
        input.id,
        input.expectedContentHash,
      ),
    };
  });
  register('partner.connectors.proposals.reject', async (input, event) => {
    assertSpaceExtensionSender(event);
    return { proposal: await getPartnerConnectorService().reject(await context(input), input.id) };
  });
}
