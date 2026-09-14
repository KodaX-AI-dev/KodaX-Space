import assert from 'node:assert/strict';
import test from 'node:test';
import { createSlackConnector } from './slack-api.js';
import { createZoomConnector } from './zoom-api.js';
import { createGithubConnector } from './github-api.js';
import type { ReadConnector } from './read-connector.js';

const slackRef = 'https://acme.slack.com/archives/C12345678/p1234567890123456';
const zoomRef = 'https://acme.zoom.us/j/12345678901';
const githubRef = 'https://github.com/octocat/hello-world';
const slackIdentity = {
  ok: true,
  team_id: 'T12345678',
  user_id: 'U12345678',
  team: 'Acme',
  url: 'https://acme.slack.com/',
};
function store() {
  const values = new Map<string, string>();
  return {
    values,
    get: async (k: string) => values.get(k),
    set: async (k: string, v: string) => {
      values.set(k, v);
    },
    delete: async (k: string) => {
      values.delete(k);
    },
  };
}
async function connect(
  adapter: ReadConnector,
  value: { token: string } | { accountId: string; clientId: string; clientSecret: string },
  signal = new AbortController().signal,
) {
  await adapter.run({
    profile: 'test',
    installCli: false,
    signal,
    onProgress: () => {},
    requestInput: async () => value,
  });
  const expected = (await adapter.inspect('test')).identity!;
  assert.ok(expected);
  return { profile: 'test', expected, beforeRead: async () => {}, assertRead: () => {} };
}
test('Slack exact message: verified workspace, bearer header, no thread or other message substitution', async () => {
  const credentials = store();
  const requests: string[] = [];
  let messageTs = '1234567890.123456';
  let guard = false;
  const adapter = createSlackConnector({
    credentials,
    fetchFn: async (url, init) => {
      requests.push(String(url));
      assert.equal(init?.redirect, 'error');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer xoxb-fixture-token');
      if (String(url).endsWith('/auth.test'))
        return Response.json(slackIdentity, { headers: { 'x-oauth-scopes': 'channels:history' } });
      assert.ok(guard);
      const u = new URL(String(url));
      assert.equal(u.origin, 'https://slack.com');
      assert.equal(u.pathname, '/api/conversations.history');
      assert.equal(u.searchParams.get('channel'), 'C12345678');
      assert.equal(u.searchParams.get('latest'), '1234567890.123456');
      assert.equal(u.searchParams.get('limit'), '1');
      return Response.json({
        ok: true,
        messages: [{ ts: messageTs, text: 'Selected message', user: 'U12345678' }],
      });
    },
  });
  const input = await connect(adapter, { token: 'xoxb-fixture-token' });
  const source = await adapter.read({
    ...input,
    documentUrl: slackRef,
    beforeRead: async () => {
      guard = true;
    },
  });
  assert.match(source.content, /Selected message/);
  assert.equal(source.documentId, 'C12345678/1234567890.123456');
  await assert.rejects(() =>
    adapter.read({ ...input, documentUrl: slackRef.replace('acme.', 'other.') }),
  );
  messageTs = '1234567880.000000';
  await assert.rejects(() => adapter.read({ ...input, documentUrl: slackRef }));
  const before = requests.length;
  await assert.rejects(() => adapter.read({ ...input, documentUrl: 'https://evil.test/' }));
  assert.equal(requests.length, before);
  await adapter.disconnect?.('test');
  assert.equal(credentials.values.size, 0);
});
test('Zoom S2S uses fixed OAuth and meeting routes, checks scope and discards host/password fields', async () => {
  let scope = 'meeting:read:meeting:admin';
  let meetingId = 12345678901;
  let guard = false;
  const adapter = createZoomConnector({
    credentials: store(),
    fetchFn: async (url, init) => {
      if (String(url) === 'https://zoom.us/oauth/token') {
        assert.equal(init?.method, 'POST');
        assert.equal(
          new Headers(init.headers).get('Authorization'),
          `Basic ${Buffer.from('client:secret').toString('base64')}`,
        );
        assert.equal(new URLSearchParams(String(init.body)).get('account_id'), 'account');
        return Response.json({
          access_token: 'zoom-fixture-token',
          token_type: 'bearer',
          expires_in: 3600,
          scope,
        });
      }
      assert.ok(guard);
      assert.equal(String(url), 'https://api.zoom.us/v2/meetings/12345678901');
      return Response.json({
        id: meetingId,
        topic: 'Planning',
        agenda: 'Agenda',
        start_time: '2026-09-07T10:00:00Z',
        duration: 30,
        timezone: 'UTC',
        start_url: 'https://zoom.us/s?zak=host-secret',
        password: 'secret',
        join_url: 'https://zoom.us/j/12345678901?pwd=secret',
      });
    },
  });
  const input = await connect(adapter, {
    accountId: 'account',
    clientId: 'client',
    clientSecret: 'secret',
  });
  const source = await adapter.read({
    ...input,
    documentUrl: zoomRef,
    assertRead: () => {
      guard = true;
    },
  });
  assert.match(source.content, /Agenda/);
  assert.doesNotMatch(JSON.stringify(source), /host-secret|password|pwd=|start_url/);
  meetingId = 99999999999;
  await assert.rejects(() => adapter.read({ ...input, documentUrl: zoomRef }));
  scope = 'user:read:admin';
  await assert.rejects(() => adapter.inspect('test'));
});
test('GitHub reads repository/README, issue and PR with pinned API and strict response identities', async () => {
  let wrong = false;
  let missingReadme = false;
  const paths: string[] = [];
  const adapter = createGithubConnector({
    credentials: store(),
    fetchFn: async (url, init) => {
      const pathname = new URL(String(url)).pathname;
      paths.push(pathname);
      assert.equal(new URL(String(url)).origin, 'https://api.github.com');
      assert.equal(new Headers(init?.headers).get('X-GitHub-Api-Version'), '2026-03-10');
      if (pathname === '/user') return Response.json({ id: 7, login: 'octocat' });
      if (pathname.endsWith('/readme'))
        return missingReadme
          ? Response.json({}, { status: 404 })
          : Response.json({
              type: 'file',
              encoding: 'base64',
              size: 5,
              content: Buffer.from('Hello').toString('base64'),
            });
      if (pathname === '/repos/octocat/hello-world')
        return Response.json({
          id: 1,
          full_name: wrong ? 'other/repo' : 'octocat/hello-world',
          description: 'Demo',
          default_branch: 'main',
          private: true,
          html_url: githubRef,
        });
      const kind = pathname.includes('/issues/') ? 'issues' : 'pull';
      return Response.json({
        number: wrong ? 99 : 12,
        title: 'Read this',
        body: 'Body',
        state: 'open',
        html_url: `${githubRef}/${kind}/12`,
        user: { login: 'octocat' },
        merged: false,
      });
    },
  });
  const input = await connect(adapter, { token: 'github_pat_fixture' });
  assert.match((await adapter.read({ ...input, documentUrl: githubRef })).content, /Hello/);
  assert.match(
    (await adapter.read({ ...input, documentUrl: githubRef + '/issues/12' })).content,
    /Body/,
  );
  assert.match(
    (await adapter.read({ ...input, documentUrl: githubRef + '/pull/12' })).content,
    /Body/,
  );
  missingReadme = true;
  assert.match(
    (await adapter.read({ ...input, documentUrl: githubRef })).content,
    /README.*(?:unavailable|不可用)/i,
  );
  wrong = true;
  await assert.rejects(() => adapter.read({ ...input, documentUrl: githubRef }));
  await assert.rejects(() => adapter.read({ ...input, documentUrl: githubRef + '/issues/12' }));
  assert.ok(paths.includes('/repos/octocat/hello-world/pulls/12'));
});
test('credentials are not persisted after cancelled verification and raw server errors are not exposed', async () => {
  const credentials = store();
  const controller = new AbortController();
  const adapter = createGithubConnector({
    credentials,
    fetchFn: async () => {
      controller.abort();
      return Response.json({ id: 7, login: 'octocat' });
    },
  });
  await assert.rejects(() => connect(adapter, { token: 'github_pat_fixture' }, controller.signal));
  assert.equal(credentials.values.size, 0);
  const bad = createSlackConnector({
    credentials,
    fetchFn: async () => Response.json({ ok: false, error: 'secret-server-dump' }),
  });
  await assert.rejects(
    () => connect(bad, { token: 'xoxb-fixture-token' }),
    (error) => error instanceof Error && !error.message.includes('secret-server-dump'),
  );
});
test('bounded reads reject oversized/chunked payloads, rate limits, and redirects without retry', async () => {
  for (const response of [
    Response.json({}, { status: 429 }),
    Response.redirect('https://evil.test', 302),
    new Response('x'.repeat(1048577)),
    Response.json({ id: 7, login: 'octocat' }, { headers: { 'content-length': '1048577' } }),
  ]) {
    let calls = 0;
    const adapter = createGithubConnector({
      credentials: store(),
      fetchFn: async () => {
        calls++;
        return response;
      },
    });
    await assert.rejects(() => connect(adapter, { token: 'github_pat_fixture' }));
    assert.equal(calls, 1);
  }
});

test('cancellation during credential persistence removes the new secret; failed deletion cannot report success', async () => {
  const credentials = store();
  const controller = new AbortController();
  const adapter = createGithubConnector({
    credentials: {
      ...credentials,
      set: async (k, v) => {
        await credentials.set(k, v);
        controller.abort();
      },
    },
    fetchFn: async () => Response.json({ id: 1, login: 'octocat' }),
  });
  await assert.rejects(() =>
    adapter.run({
      profile: 'test',
      installCli: false,
      signal: controller.signal,
      onProgress: () => {},
      requestInput: async () => ({ token: 'fixture' }),
    }),
  );
  assert.equal(credentials.values.size, 0);
  const retained = store();
  const bad = createGithubConnector({
    credentials: { ...retained, delete: async () => {} },
    fetchFn: async () => Response.json({ id: 1, login: 'octocat' }),
  });
  await connect(bad, { token: 'fixture' });
  await assert.rejects(() => bad.disconnect!('test'));
  assert.equal(retained.values.size, 1);
});
test('GitHub repository README needs its own dispatch check and never returns oversized/truncated content', async () => {
  let revoked = false;
  let large = false;
  let business = 0;
  const adapter = createGithubConnector({
    credentials: store(),
    fetchFn: async (url) => {
      if (String(url).endsWith('/user')) return Response.json({ id: 1, login: 'octocat' });
      business++;
      if (String(url).endsWith('/readme')) {
        const body = 'x'.repeat(131073);
        return Response.json({
          type: 'file',
          encoding: 'base64',
          content: Buffer.from(body).toString('base64'),
          size: body.length,
        });
      }
      revoked = true;
      return Response.json({ id: 1, full_name: 'octocat/hello-world', html_url: githubRef });
    },
  });
  const input = await connect(adapter, { token: 'fixture' });
  await assert.rejects(() =>
    adapter.read({
      ...input,
      documentUrl: githubRef,
      beforeRead: async () => {
        if (revoked && !large) throw Error('revoked');
      },
    }),
  );
  assert.equal(business, 1);
  large = true;
  await assert.rejects(
    () => adapter.read({ ...input, documentUrl: githubRef }),
    (error) => error instanceof Error && /128 KiB/.test(error.message),
  );
  assert.equal(business, 3);
});
test('missing credentials, malformed identities and missing Slack scopes do not create verified connections', async () => {
  let calls = 0;
  const missing = createGithubConnector({
    credentials: store(),
    fetchFn: async () => {
      calls++;
      throw Error('must not run');
    },
  });
  assert.equal((await missing.inspect('test')).identity, undefined);
  await assert.rejects(() => missing.inspect('../outside'));
  await assert.rejects(() =>
    missing.read({
      profile: 'test',
      expected: { authorityId: 'github.com', subjectId: '1', label: 'Test' },
      documentUrl: githubRef,
      beforeRead: async () => {},
      assertRead: () => {},
    }),
  );
  assert.equal(calls, 0);
  for (const body of [null, [], { id: '1', login: 'octocat' }, { id: 1, login: 'bad\nname' }]) {
    const adapter = createGithubConnector({
      credentials: store(),
      fetchFn: async () => Response.json(body),
    });
    await assert.rejects(() => connect(adapter, { token: 'fixture' }));
  }
  const slack = createSlackConnector({
    credentials: store(),
    fetchFn: async () =>
      Response.json(slackIdentity, { headers: { 'x-oauth-scopes': 'chat:write' } }),
  });
  await assert.rejects(
    () => connect(slack, { token: 'xoxb-fixture-token' }),
    (error) => error instanceof Error && /权限/.test(error.message),
  );
});

test('GitHub rate-limit 403 is reported as throttling rather than a scope failure', async () => {
  const adapter = createGithubConnector({
    credentials: store(),
    fetchFn: async () =>
      Response.json({}, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
  });
  await assert.rejects(
    () => connect(adapter, { token: 'fixture' }),
    (error) => error instanceof Error && /次数/.test(error.message),
  );
});
