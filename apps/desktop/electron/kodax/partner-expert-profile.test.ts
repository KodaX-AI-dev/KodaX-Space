import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import test from 'node:test';
import type { PartnerExpertSnapshotT } from '@kodax-space/space-ipc-schema';
import { buildPartnerAgentProfile, PARTNER_AGENT_PROFILE } from './partner-profile.js';

const expert: PartnerExpertSnapshotT = {
  extensionId: 'partner.library',
  extensionVersion: '1.0.0',
  expert: {
    id: 'writing-guide',
    revision: 1,
    name: 'Writing guide',
    description: 'Source-faithful drafting',
    prompt: 'EXPERT-WRITING: Explain the evidence behind each proposed revision.',
    starterTasks: [],
  },
};

test('both expert categories keep the conversation role while adapting methods to follow-up tasks', () => {
  for (const expertType of ['role', 'task'] as const) {
    const profile = buildPartnerAgentProfile({
      ...expert,
      expert: { ...expert.expert, expertType },
    });
    assert.match(profile.instructions, /until the user switches or removes/);
    assert.match(profile.instructions, /existing conversation context and decisions/);
    assert.match(profile.instructions, /Do not restart intake or produce a full deliverable/);
    assert.match(
      profile.instructions,
      /explicitly selected Skill overrides only the method for that run/,
    );
    assert.equal(profile.id, PARTNER_AGENT_PROFILE.id);
  }
  assert.doesNotMatch(
    buildPartnerAgentProfile().instructions,
    /until the user switches or removes/,
  );
});

test('expert work expectations reach the agent and its verification without changing base permissions', () => {
  const workflow = {
    inputs: ['Target user and problem evidence'],
    deliverables: ['PRD and acceptance criteria'],
    qualityChecks: ['Each requirement has an observable acceptance criterion'],
    connectorNeeds: [
      { operation: 'read' as const, required: false, reason: 'Read selected research sources' },
    ],
  };
  const configured = { ...expert, expert: { ...expert.expert, workflow } };
  const profile = buildPartnerAgentProfile(configured);
  assert.match(profile.instructions, /Target user and problem evidence/);
  assert.match(profile.instructions, /PRD and acceptance criteria/);
  assert.ok(profile.verification.instructions?.includes(workflow.qualityChecks[0]!));
  assert.ok(
    profile.verification.criteria?.some(
      (criterion) => criterion.description === workflow.qualityChecks[0],
    ),
  );
  assert.ok(profile.instructions.includes('Do not request unrestricted shell'));
  assert.ok(!PARTNER_AGENT_PROFILE.instructions.includes('Target user and problem evidence'));
  assert.equal(configured.expert.workflow.connectorNeeds[0]!.required, false);
});

test('the actual SDK system prompt contains the selected expert and the original Partner boundary', async (t) => {
  const profile = buildPartnerAgentProfile(expert);
  assert.equal(profile.name, 'Writing guide');
  assert.equal(profile.id, PARTNER_AGENT_PROFILE.id);
  assert.deepEqual(profile.verification, PARTNER_AGENT_PROFILE.verification);
  assert.notEqual(profile.verification, PARTNER_AGENT_PROFILE.verification);
  process.env.KODAX_TEST_ONBOARDING = `expert-profile-${randomUUID()}`;
  const { applySdkHomeEnv, getKodaxDir } = await import('./data-paths.js');
  applySdkHomeEnv();
  const directory = getKodaxDir();
  await fs.mkdir(directory, { recursive: true });
  const systemPrompts: string[] = [];
  const { KodaXBaseProvider, registerModelProvider } = await import('@kodax-ai/kodax/llm');
  class RecordingProvider extends KodaXBaseProvider {
    readonly name = 'space-expert-test';
    readonly supportsThinking = false;
    protected readonly config = {
      apiKeyEnv: 'SPACE_EXPERT_TEST_UNUSED',
      model: 'test-model',
      supportsThinking: false,
    };
    override isConfigured(): boolean {
      return true;
    }
    async stream(
      ...args: Parameters<InstanceType<typeof KodaXBaseProvider>['stream']>
    ): Promise<Awaited<ReturnType<InstanceType<typeof KodaXBaseProvider>['stream']>>> {
      systemPrompts.push(args[2]);
      return {
        textBlocks: [{ type: 'text', text: 'Done.' }],
        toolBlocks: [],
        thinkingBlocks: [],
        stopReason: 'end_turn',
      };
    }
  }
  t.after(registerModelProvider('space-expert-test', () => new RecordingProvider()));
  const sdk = await import('@kodax-ai/kodax/coding');
  t.after(async () => {
    await sdk.awaitLatestCodingMemoryReviewDrain(2_000);
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  await sdk.runManagedTask(
    {
      provider: 'space-expert-test',
      agentMode: 'sa',
      maxIter: 1,
      lsp: false,
      context: {
        gitRoot: directory,
        executionCwd: directory,
        agentProfile: profile,
        skillsPrompt: '',
        repoIntelligenceMode: 'off',
      },
    },
    'Review this sentence.',
  );

  assert.ok(
    systemPrompts.some((prompt) => prompt.includes('EXPERT-WRITING: Explain the evidence')),
  );
  assert.ok(systemPrompts.some((prompt) => prompt.includes('Do not request unrestricted shell')));
  assert.equal(buildPartnerAgentProfile().instructions, PARTNER_AGENT_PROFILE.instructions);
  assert.doesNotMatch(PARTNER_AGENT_PROFILE.instructions, /EXPERT-WRITING/);
});
