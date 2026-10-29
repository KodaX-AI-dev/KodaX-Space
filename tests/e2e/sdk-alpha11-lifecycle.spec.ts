import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createSessionManager } from '@kodax-ai/kodax/session';
import { createContractProvider, restartIsolatedHost } from './sdk-contract-fixture.js';
import {
  launchRealSdkSpace,
  sendSdkPrompt,
  currentSdkSession,
  waitSdkIdle,
  readSdkHistoryPage,
  readSdkProductView,
} from './sdk-provider-fixture.js';
import { readProductItemText } from '../../apps/desktop/renderer/src/lib/productItemContent.js';

test.setTimeout(150_000);

test('multiple long task reports preserve order full bodies and unknown status through Space and Host restart', async () => {
  const sessionId = 'long-task-reports';
  const bodies = ['failed', 'cancelled', 'completed', 'unknown'].map(
    (status) => `# ${status} report\n\n\`&quot;\`\n\n${'图文🙂'.repeat(30_000)}\n\nEND_${status}`,
  );
  const metadata = (['failed', 'cancelled', 'completed'] as const).map((status, index) => ({
    type: 'task_result' as const,
    source: 'child_task' as const,
    taskId: `child-${index}`,
    status,
    summary: bodies[index],
  }));
  const provider = await createContractProvider({});
  const { space } = await launchRealSdkSpace(
    `long-reports-${Date.now()}`,
    provider.url,
    async (root) => {
      const project = path.join(root, 'project');
      await mkdir(project, { recursive: true });
      const manager = createSessionManager({
        sessionsDir: path.join(root, 'sessions'),
        configHome: root,
      });
      await manager.storage.save(sessionId, {
        title: 'LONG_TASK_REPORTS',
        gitRoot: project,
        scope: 'user',
        runtimeInfo: { workspaceRoot: project, surface: 'repl' },
        messages: [
          { role: 'user', content: 'Saved reports' },
          {
            role: 'user',
            _source: 'agent-completed',
            content: 'Report envelope',
            _taskResults: metadata,
          },
          {
            role: 'user',
            _source: 'task-completed',
            content: `<task-completed>${bodies[3].replaceAll('&', '&amp;')}</task-completed>`,
          },
        ],
      });
    },
  );
  try {
    for (let restart = 0; restart < 2; restart++) {
      if (restart) await restartIsolatedHost(space);
      await space.page
        .getByTestId('sidebar-session-row')
        .filter({ hasText: 'LONG_TASK_REPORTS' })
        .click();
      const reports = space.page
        .getByTestId('conversation-stream')
        .getByTestId('system-notice')
        .filter({ hasText: 'Task report' });
      await expect(reports).toHaveCount(4, { timeout: 30_000 });
      const view = await readSdkProductView(space, sessionId);
      const history = await readSdkHistoryPage(space, sessionId);
      for (const [source, items] of [
        ['view', view.items],
        ['history', history.productItems ?? []],
      ] as const) {
        const tasks = items.filter((item) => item.taskResult);
        expect(tasks.map((item) => item.taskResult?.status)).toEqual([
          'failed',
          'cancelled',
          'completed',
          'unknown',
        ]);
        expect(tasks[3].taskResult?.taskId).toBeUndefined();
        expect(new Set(tasks.map((item) => item.id)).size).toBe(4);
        expect(tasks.slice(0, 3).map((item) => item.taskResult?.taskId)).toEqual(
          metadata.map((item) => item.taskId),
        );
        for (const [index, task] of tasks.entries()) {
          const full = await readProductItemText(
            task,
            async (offset) => {
              const result = await space.page.evaluate(
                (input) => window.kodaxSpace!.invoke('session.productItem', input),
                { sessionId, itemId: task.id, source, offset },
              );
              if (!result.ok) throw new Error(result.error.message);
              return result.data;
            },
            'text',
            source,
          );
          expect(createHash('sha256').update(full).digest('hex')).toBe(
            createHash('sha256').update(bodies[index]).digest('hex'),
          );
        }
      }
      for (const [index, status] of ['failed', 'cancelled', 'completed', 'unknown'].entries()) {
        const report = reports.nth(index);
        if ((await report.locator('details').getAttribute('open')) === null)
          await report.locator('summary').click();
        await expect(report).toContainText(`END_${status}`, { timeout: 30_000 });
        await expect(report.locator('code')).toHaveText('&quot;');
        await expect(report).toHaveAttribute('data-notice-variant', 'info');
      }
      await expect(space.page.getByText(/Minified React error/)).toHaveCount(0);
    }
    expect(provider.requests).toEqual([]);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('model-loaded Skills apply trusted policy hooks model preference and refreshed visibility', async () => {
  const provider = await createContractProvider({
    SKILL_MODEL: [
      { name: 'skill', input: { skill: 'contract-skill' } },
      { name: 'glob', input: { pattern: '*' } },
      { name: 'read', input: { path: 'README.md' } },
    ],
    SKILL_HIDDEN: [{ name: 'skill', input: { skill: 'contract-skill' } }],
  });
  const { space, projectRoot } = await launchRealSdkSpace(
    `skill-contract-${Date.now()}`,
    provider.url,
    async (root) => {
      const project = path.join(root, 'project');
      const skill = path.join(project, '.kodax/skills/contract-skill');
      await mkdir(skill, { recursive: true });
      await promisify(execFile)('git', ['init', project], { windowsHide: true });
      await mkdir(path.join(project, 'src'), { recursive: true });
      const program = `require('node:fs').appendFileSync(${JSON.stringify(path.join(project, 'hooks.txt'))},'read-hook\\n')`;
      const command = `node -e "eval(Buffer.from('${Buffer.from(program).toString('base64')}','base64').toString())"`;
      await writeFile(
        path.join(skill, 'SKILL.md'),
        [
          '---',
          'name: contract-skill',
          'description: Contract fixture',
          'allowed-tools: Read, Bash(node *)',
          'model: space-e2e-preferred',
          'hooks:',
          '  PreToolUse:',
          '    - matcher: read',
          `      command: ${JSON.stringify(command)}`,
          '---',
          'MODEL_SKILL_BODY',
        ].join('\n'),
      );
    },
  );
  try {
    const discover = (projectRoot: string) =>
      space.page.evaluate(
        (projectRoot) =>
          window.kodaxSpace!.invoke('skill.discover', { projectRoot, forceReload: true }),
        projectRoot,
      );
    const catalog = await discover(projectRoot);
    await writeFile(test.info().outputPath('skill-catalog.json'), JSON.stringify(catalog, null, 2));
    expect(catalog.ok && catalog.data.skills.some((skill) => skill.name === 'contract-skill')).toBe(
      true,
    );
    await sendSdkPrompt(space, 'SKILL_MODEL');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'CONTRACT_DONE:SKILL_MODEL',
      { timeout: 45_000 },
    );
    await waitSdkIdle(space, await currentSdkSession(space));
    const requests = provider.requests.filter((request) => request.prompt === 'SKILL_MODEL');
    const results = requests.flatMap((request) => request.results).join('\n');
    expect(results).toContain('MODEL_SKILL_BODY');
    expect(results).toMatch(/glob.*not allowed|not allowed.*glob/i);
    expect(results).toContain('Local SDK E2E');
    expect(requests.slice(1).some((request) => request.model === 'space-e2e-preferred')).toBe(true);
    const hooks = await readFile(path.join(projectRoot, 'hooks.txt'), 'utf8');
    expect(hooks).toContain('read-hook');
    await writeFile(
      path.join(projectRoot, '.kodax/skills/contract-skill/SKILL.md'),
      '---\nname: contract-skill\ndescription: Refreshed fixture\ndisable-model-invocation: true\n---\nREFRESHED_HIDDEN_BODY\n',
    );
    expect((await discover(projectRoot)).ok).toBe(true);
    await sendSdkPrompt(space, 'SKILL_HIDDEN');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'CONTRACT_DONE:SKILL_HIDDEN',
    );
    await waitSdkIdle(space, await currentSdkSession(space));
    const hidden = provider.requests
      .filter((request) => request.prompt === 'SKILL_HIDDEN')
      .flatMap((request) => request.results)
      .join('\n');
    expect(hidden).toMatch(/model invocation disabled/i);
    expect(hidden).not.toContain('REFRESHED_HIDDEN_BODY');
    expect(await readFile(path.join(projectRoot, 'hooks.txt'), 'utf8')).toBe(hooks);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('Script respects Plan denial and Stop retains partial effects without replay after Host restart', async () => {
  const provider = await createContractProvider({
    SCRIPT_READ: [
      { name: 'script_exec', input: { code: "return await tools.read({path:'README.md'});" } },
    ],
    SCRIPT_DENY: [
      {
        name: 'script_exec',
        input: { code: "return await tools.bash({command:'git commit -m MUST_NOT_COMMIT'});" },
      },
    ],
    SCRIPT_STOP: [
      {
        name: 'script_exec',
        input: {
          code: `await tools.write({path:'partial.txt',content:'ONCE'});
      await tools.bash({command:'node -e "setTimeout(()=>{},30000)"'});
      return await tools.write({path:'after-stop.txt',content:'MUST_NOT_WRITE'});`,
        },
      },
    ],
  });
  const { space, projectRoot } = await launchRealSdkSpace(
    `script-lifecycle-${Date.now()}`,
    provider.url,
  );
  try {
    const picker = space.page.getByTestId('work-mode-selector');
    await expect(picker).toBeEnabled({ timeout: 30_000 });
    await picker.selectOption('script');
    await expect(picker).toHaveValue('script');
    await expect(picker).toBeEnabled();
    await sendSdkPrompt(space, 'SCRIPT_READ');
    const sessionId = await currentSdkSession(space);
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'CONTRACT_DONE:SCRIPT_READ',
    );
    await waitSdkIdle(space, sessionId);
    expect(
      provider.requests.some((request) =>
        request.results.some((result) => result.includes('Local SDK E2E')),
      ),
    ).toBe(true);
    const permission = async (mode: 'plan' | 'full-access') => {
      const result = await space.page.evaluate(
        (input) => window.kodaxSpace!.invoke('session.setPermissionMode', input),
        { sessionId, mode },
      );
      expect(result).toMatchObject({ ok: true, data: { ok: true } });
      const live = await space.page.evaluate(
        (sessionId) => window.kodaxSpace!.invoke('session.liveSnapshot', { sessionId }),
        sessionId,
      );
      await writeFile(
        test.info().outputPath(`permission-${mode}.json`),
        JSON.stringify(live, null, 2),
      );
      return result;
    };
    await permission('plan');
    await sendSdkPrompt(space, 'SCRIPT_DENY');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'CONTRACT_DONE:SCRIPT_DENY',
    );
    await waitSdkIdle(space, sessionId);
    await writeFile(
      test.info().outputPath('after-plan-run.json'),
      JSON.stringify(
        await space.page.evaluate(
          (sessionId) => window.kodaxSpace!.invoke('session.liveSnapshot', { sessionId }),
          sessionId,
        ),
        null,
        2,
      ),
    );
    expect(
      provider.requests
        .filter((request) => request.prompt === 'SCRIPT_DENY')
        .flatMap((request) => request.results)
        .join('\n'),
    ).toMatch(/blocked|not allowed|denied|plan/i);
    expect(await permission('full-access')).toMatchObject({ ok: true });
    await sendSdkPrompt(space, 'SCRIPT_STOP');
    await expect
      .poll(
        () =>
          readFile(path.join(projectRoot, 'partial.txt'), 'utf8').catch((error) => {
            if (error.code === 'ENOENT') return '';
            throw error;
          }),
        { timeout: 30_000 },
      )
      .toBe('ONCE');
    await space.page.getByRole('button', { name: 'Stop generation', exact: true }).click();
    await waitSdkIdle(space, sessionId);
    const requests = provider.requests.length;
    const before = await readSdkProductView(space, sessionId);
    expect(before.items.some((item) => item.tool?.name === 'script_exec')).toBe(true);
    await writeFile(
      test.info().outputPath('script-stopped-view.json'),
      JSON.stringify(before, null, 2),
    );
    await restartIsolatedHost(space);
    const history = await readSdkHistoryPage(space, sessionId);
    expect(history.productItems?.some((item) => item.tool?.name === 'script_exec')).toBe(true);
    expect(await readFile(path.join(projectRoot, 'partial.txt'), 'utf8')).toBe('ONCE');
    await expect(readFile(path.join(projectRoot, 'after-stop.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(provider.requests.length).toBe(requests);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('MCP generates a retained original that Space reads after a real Host restart without replay', async () => {
  const body = JSON.stringify({
    head: '你😀'.repeat(20_000),
    middle: 'MCP_MIDDLE',
    tail: 'Ω'.repeat(40_000) + 'MCP_END',
  });
  const provider = await createContractProvider({
    MCP_ORIGINAL: [{ name: 'mcp_call', input: { id: 'mcp:fixture:tool:huge', args: {} } }],
  });
  const { space } = await launchRealSdkSpace(
    `mcp-original-${Date.now()}`,
    provider.url,
    async (root) => {
      await mkdir(path.join(root, 'integrations'), { recursive: true });
      const server = path.join(root, 'mcp.cjs');
      await writeFile(
        server,
        `const fs=require('node:fs');require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
      const m=JSON.parse(line);if(m.id===undefined)return;let result={};
      if(m.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
      if(m.method==='tools/list')result={tools:[{name:'huge',description:'Large retained result',inputSchema:{type:'object'}}]};
      if(m.method==='tools/call'){fs.appendFileSync(${JSON.stringify(path.join(root, 'calls.txt'))},'called\\n');result={content:[{type:'text',text:${JSON.stringify(body)}}]};}
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');});`,
      );
      await writeFile(
        path.join(root, 'integrations/mcp.json'),
        JSON.stringify({
          version: 1,
          servers: { fixture: { type: 'stdio', command: process.execPath, args: [server] } },
        }),
      );
    },
  );
  try {
    await sendSdkPrompt(space, 'MCP_ORIGINAL');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'CONTRACT_DONE:MCP_ORIGINAL',
      { timeout: 45_000 },
    );
    const sessionId = await currentSdkSession(space);
    await waitSdkIdle(space, sessionId);
    const readOriginal = async () => {
      const history = await readSdkHistoryPage(space, sessionId);
      const tool = history.productItems?.find((item) => item.tool?.name === 'mcp_call');
      expect(tool?.tool?.outputPath).toBeTruthy();
      if (!tool) throw new Error('Missing MCP result');
      return readProductItemText(
        tool,
        async (offset) => {
          const reply = await space.page.evaluate(
            (input) => window.kodaxSpace!.invoke('session.productItem', input),
            {
              sessionId,
              itemId: tool.id,
              source: 'history' as const,
              part: 'original' as const,
              offset,
            },
          );
          if (!reply.ok) throw new Error(reply.error.message);
          return reply.data;
        },
        'original',
        'history',
      );
    };
    const before = await readOriginal();
    expect(before).toContain(body);
    const requests = provider.requests.length;
    await restartIsolatedHost(space);
    expect(await readOriginal()).toBe(before);
    await space.page
      .locator(`[data-testid=sidebar-session-row][data-session-id="${sessionId}"]`)
      .click();
    const stream = space.page.getByTestId('conversation-stream');
    await stream.getByRole('button', { name: /Ran 1/ }).first().click();
    await stream.getByTestId('tool-call-card').getByRole('button').first().click();
    await stream.getByRole('button', { name: 'Read full original result', exact: true }).click();
    await expect(stream.getByTestId('tool-original-body')).toHaveText(before);
    expect(await readFile(path.join(space.testDataDir, 'calls.txt'), 'utf8')).toBe('called\n');
    expect(provider.requests.length).toBe(requests);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});
