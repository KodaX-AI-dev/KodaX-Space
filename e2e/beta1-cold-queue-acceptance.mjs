// Real registry SDK, isolated shared Host, local HTTP provider; no paid services.
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

for (const termination of ['close', 'crash'])
  test(
    `a fresh Main restores the complete queued Partner intent after Host restart without duplicate execution (${termination})`,
    { timeout: 120_000 },
    async () => {
      process.env.KODAX_TEST_ONBOARDING = `beta1-cold-${randomUUID()}`;
      const configHome = path.join(os.tmpdir(), `kodax-test-${process.env.KODAX_TEST_ONBOARDING}`);
      const homeDir = path.join(configHome, 'fixture-home');
      const profileRoot = path.join(homeDir, '.kodax');
      process.env.KODAX_HOME = profileRoot;
      const workspace = path.join(profileRoot, 'workspace');
      await mkdir(workspace, { recursive: true });
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const requests = [];
      const server = createServer(async (request, response) => {
        let bytes = '';
        for await (const chunk of request) bytes += chunk;
        const parsed = JSON.parse(bytes);
        const prompt = parsed.messages.findLast((message) => message.role === 'user')?.content;
        requests.push(prompt);
        if (typeof prompt === 'string' && prompt.includes('ACTIVE_BEFORE_MAIN_RESTART')) await gate;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            id: randomUUID(),
            model: 'fixture',
            choices: [
              {
                finish_reason: 'stop',
                message: { role: 'assistant', content: 'Local fixture completed.' },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
          }),
        );
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      await writeFile(
        path.join(profileRoot, 'config.json'),
        JSON.stringify({
          provider: 'cold-fixture',
          model: 'fixture',
          agentMode: 'ama',
          customProviders: [
            {
              name: 'cold-fixture',
              protocol: 'openai',
              baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
              apiKeyEnv: 'UNUSED_COLD_KEY',
              model: 'fixture',
            },
          ],
        }),
      );
      const report = { sdk: '0.7.97-beta.1', termination };
      const children = [];
      function start(action, extra = {}) {
        const child = spawn(
          process.execPath,
          [
            '--import',
            'tsx',
            'e2e/beta1-cold-queue-main.mjs',
            JSON.stringify({ action, profileRoot, homeDir, workspace, ...extra }),
          ],
          {
            cwd: process.cwd(),
            env: { ...process.env, KODAX_HOME: profileRoot },
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          },
        );
        children.push(child);
        child.stdout.on('data', (bytes) => process.stdout.write(bytes));
        child.stderr.on('data', (bytes) => process.stderr.write(bytes));
        const messages = [];
        const listeners = new Set();
        child.on('message', (value) => {
          process.stdout.write(`Main fixture: ${value.stage}\n`);
          messages.push(value);
          for (const listener of listeners) listener();
        });
        const exited = new Promise((resolve) =>
          child.once('exit', (code) => {
            for (const listener of listeners) listener();
            resolve(code);
          }),
        );
        const wait = async (stage) => {
          const deadline = Date.now() + 60_000;
          while (true) {
            const failure = messages.find((value) => value.stage === 'failed');
            if (failure) throw new Error(failure.error);
            const found = messages.find((value) => value.stage === stage);
            if (found) return found;
            if (child.exitCode !== null || Date.now() > deadline)
              throw new Error(`Main fixture ended before ${stage}`);
            await new Promise((resolve) => {
              const timer = setTimeout(done, 50);
              function done() {
                clearTimeout(timer);
                listeners.delete(done);
                resolve();
              }
              listeners.add(done);
            });
          }
        };
        return { child, wait, exited };
      }
      try {
        const first = start('create');
        const queued = await first.wait('queued');
        report.originalMainPid = queued.mainPid;
        await until(() =>
          requests.some(
            (text) => typeof text === 'string' && text.includes('ACTIVE_BEFORE_MAIN_RESTART'),
          ),
        );
        if (termination === 'crash') {
          first.child.kill('SIGKILL');
          assert.notEqual(await first.exited, 0);
        } else {
          first.child.send('close');
          assert.equal(await first.exited, 0);
        }
        const second = start('resume', queued);
        const attached = await second.wait('attached');
        assert.notEqual(
          attached.mainPid,
          queued.mainPid,
          'Main authority really runs in a fresh OS process',
        );
        release();
        const result = await second.wait('result');
        Object.assign(report, result.report);
        assert.equal(await second.exited, 0);
      } finally {
        release();
        for (const child of children) if (child.exitCode === null) child.kill();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        await mkdir('artifacts/diagnostics/beta1-fixes', { recursive: true });
        await writeFile(
          'artifacts/diagnostics/beta1-fixes/cold-main-host-report.json',
          JSON.stringify(report, null, 2),
        );
        await writeFile(
          `artifacts/diagnostics/beta1-fixes/cold-main-${termination}-host-report.json`,
          JSON.stringify(report, null, 2),
        );
      }
      async function until(predicate) {
        const deadline = Date.now() + 30_000;
        while (!(await predicate())) {
          if (Date.now() > deadline) throw new Error('Main fixture timed out');
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
    },
  );
