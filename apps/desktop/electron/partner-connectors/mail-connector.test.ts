import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createMailConnector,
  parseMailResource,
  type MailClient,
  type MailCredentials,
} from './mail-connector.js';
import { ReadConnectorError } from './read-connector.js';

const profile = 'space-mail-test';
const secret = { email: 'person@qq.com', authorizationCode: 'client-authorization-code' };
const expected = { authorityId: 'imap.qq.com', subjectId: secret.email, label: secret.email };
const reference = 'mail://qq/inbox/42/601';
const source = Buffer.from(
  'From: Sender <sender@example.com>\r\nTo: person@qq.com\r\nSubject: Test mail\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nRead only body',
);

function fixture() {
  const saved = new Map<string, string>();
  const calls: Array<{ name: string; args?: unknown }> = [];
  let supplied: MailCredentials = secret;
  const mailbox = { uidValidity: 42n, uidNext: 1001, exists: 50 };
  const client: MailClient = {
    authenticated: secret.email,
    mailbox,
    connect: async () => {
      calls.push({ name: 'connect' });
    },
    close: () => {
      calls.push({ name: 'close' });
    },
    mailboxOpen: async (...args) => {
      calls.push({ name: 'mailboxOpen', args });
      return mailbox;
    },
    search: async (...args) => {
      calls.push({ name: 'search', args });
      return [601, 700];
    },
    fetchOne: async (...args) => {
      calls.push({ name: 'fetchOne', args });
      return {
        uid: Number(args[0]),
        size: source.length,
        source,
        envelope: { subject: 'Test mail', from: [{ address: 'sender@example.com' }] },
      };
    },
  };
  const options: unknown[] = [];
  const connector = createMailConnector({
    id: 'qq-mail-imap',
    credentials: {
      get: async (key) => saved.get(key),
      set: async (key, value) => {
        saved.set(key, value);
      },
      delete: async (key) => {
        saved.delete(key);
      },
    },
    requestCredentials: async () => supplied,
    clientFactory: (configuration) => {
      options.push(configuration);
      return client;
    },
  });
  const authorize = () =>
    connector.run({
      profile,
      installCli: false,
      signal: new AbortController().signal,
      onProgress: () => {},
    });
  const input = {
    profile,
    expected,
    documentUrl: reference,
    beforeRead: async () => {},
    assertRead: () => {},
  };
  return {
    connector,
    client,
    mailbox,
    calls,
    options,
    saved,
    authorize,
    input,
    supply: (next: MailCredentials) => {
      supplied = next;
    },
  };
}

test('mail resources require the fixed provider, inbox, UIDVALIDITY and UID', () => {
  assert.deepEqual(parseMailResource(reference), {
    provider: 'qq',
    mailbox: 'INBOX',
    uidValidity: '42',
    uid: 601,
  });
  for (const bad of [
    'mail://qq/inbox/0/1',
    'mail://qq/inbox/42/0',
    'mail://qq/inbox/42/4294967296',
    'mail://qq/inbox/42/1?host=evil',
    'mail://qq/INBOX/42/1',
    'mail://qq/inbox/042/1',
    'mail://qq/sent/42/1',
    'imap://qq/inbox/42/1',
  ])
    assert.equal(parseMailResource(bad), undefined, bad);
});

test('mail verifies the provider login before storing a credential, pins TLS and disables logs', async () => {
  const f = fixture();
  await f.authorize();
  assert.equal(f.saved.size, 1);
  const config = f.options[0] as Record<string, unknown>;
  assert.equal(config.host, 'imap.qq.com');
  assert.equal(config.port, 993);
  assert.equal(config.secure, true);
  assert.equal(config.logger, false);
  assert.equal(config.logRaw, false);
  assert.equal(config.emitLogs, false);
  assert.deepEqual(config.tls, { minVersion: 'TLSv1.2', rejectUnauthorized: true });
  assert.deepEqual((await f.connector.inspect(profile)).identity, expected);
  assert.equal(
    f.calls.filter((call) => call.name === 'mailboxOpen').length,
    0,
    'login does not read mailbox content',
  );
});

test('mail rejects other email domains, invalid profiles and failed identity without persisting secrets', async () => {
  for (const email of ['person@163.com', 'person@qq.com.evil', 'person@qq.com\r\nX: bad']) {
    const f = fixture();
    f.supply({ ...secret, email });
    await assert.rejects(f.authorize(), ReadConnectorError);
    assert.equal(f.saved.size, 0);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  f.client.authenticated = 'another@qq.com';
  await assert.rejects(
    f.authorize(),
    (error: unknown) => error instanceof ReadConnectorError && error.code === 'identity_changed',
  );
  assert.equal(f.saved.size, 0);
});

test('mail read uses UID, read-only mailbox and bounded source while keeping identity and stale-mailbox guards', async () => {
  const f = fixture();
  await f.authorize();
  const result = await f.connector.read(f.input);
  assert.equal(result.url, reference);
  assert.match(result.content, /Read only body/);
  assert.match(result.content, /sender@example.com/);
  assert.deepEqual(f.calls.find((call) => call.name === 'mailboxOpen')?.args, [
    'INBOX',
    { readOnly: true },
  ]);
  const fetch = f.calls.find((call) => call.name === 'fetchOne')?.args as unknown[];
  assert.equal(fetch[0], '601');
  assert.deepEqual(fetch[2], { uid: true });
  assert.deepEqual(
    (fetch[1] as Record<string, unknown>).source,
    undefined,
    'metadata checked before body',
  );
  f.mailbox.uidValidity = 43n;
  const count = f.calls.filter((call) => call.name === 'fetchOne').length;
  await assert.rejects(
    f.connector.read(f.input),
    (error: unknown) => error instanceof ReadConnectorError && error.code === 'invalid_resource',
  );
  assert.equal(f.calls.filter((call) => call.name === 'fetchOne').length, count);
});

test('mail search constrains UID window and returns stable references plus an explicit continuation', async () => {
  const f = fixture();
  await f.authorize();
  const result = await f.connector.search({
    ...f.input,
    query: { subject: 'invoice', unreadOnly: true },
    limit: 1,
  });
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0]?.reference, 'mail://qq/inbox/42/700');
  assert.equal(typeof result.nextCursor, 'string');
  assert.deepEqual(f.calls.find((call) => call.name === 'search')?.args, [
    { uid: '501:1000', subject: 'invoice', seen: false },
    { uid: true },
  ]);
});

test('mail does not dispatch body after scope is revoked or credentials change during guard', async () => {
  const f = fixture();
  await f.authorize();
  await assert.rejects(
    f.connector.read({
      ...f.input,
      beforeRead: async () => {
        f.saved.clear();
      },
    }),
    ReadConnectorError,
  );
  assert.equal(f.calls.filter((call) => call.name === 'fetchOne').length, 0);
});

test('mail cancellation closes the connection and a failed login never exposes raw provider output', async () => {
  const f = fixture();
  f.client.connect = async () => {
    throw new Error(`AUTH failed with ${secret.authorizationCode}`);
  };
  await assert.rejects(
    f.authorize(),
    (error: unknown) =>
      error instanceof ReadConnectorError && !error.message.includes(secret.authorizationCode),
  );
  assert.equal(f.saved.size, 0);
  assert.equal(f.calls.at(-1)?.name, 'close');
});

test('mail disconnect deletes only the pinned credential and verifies it cannot be read back', async () => {
  const f = fixture();
  await f.authorize();
  await f.connector.disconnect(profile);
  assert.equal(f.saved.size, 0);
  assert.equal((await f.connector.inspect(profile)).identity, undefined);
});

test('mail abort during login promptly closes transport and never saves the authorization code', async () => {
  const f = fixture();
  const controller = new AbortController();
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.client.connect = async () => {
    entered();
    return new Promise<void>(() => {});
  };
  const run = f.connector.run({
    profile,
    installCli: false,
    signal: controller.signal,
    onProgress: () => {},
  });
  await started;
  controller.abort();
  await assert.rejects(
    run,
    (error: unknown) => error instanceof ReadConnectorError && error.code === 'cancelled',
  );
  assert.equal(f.saved.size, 0);
  assert.ok(f.calls.some((call) => call.name === 'close'));
});

test('mail late search response is rejected after session scope changes', async () => {
  const f = fixture();
  await f.authorize();
  let allowed = true;
  let complete!: (uids: number[]) => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.client.search = async () => {
    started();
    return new Promise<number[]>((resolve) => {
      complete = resolve;
    });
  };
  const search = f.connector.search({
    ...f.input,
    query: {},
    assertRead: () => {
      if (!allowed) throw new ReadConnectorError('cancelled');
    },
  });
  await entered;
  allowed = false;
  complete([700]);
  await assert.rejects(
    search,
    (error: unknown) => error instanceof ReadConnectorError && error.code === 'cancelled',
  );
  assert.equal(f.calls.filter((call) => call.name === 'fetchOne').length, 0);
});

test('mail refuses oversized source before requesting body and never returns a truncated document', async () => {
  const f = fixture();
  await f.authorize();
  let bodyReads = 0;
  f.client.fetchOne = async (_uid, query) => {
    if (query.source) bodyReads++;
    return { uid: 601, size: 2 * 1024 * 1024 + 1, source, envelope: { subject: 'Oversized' } };
  };
  await assert.rejects(f.connector.read(f.input), (error: unknown) => {
    assert.ok(error instanceof ReadConnectorError);
    assert.equal(error.code, 'mail_message_too_large');
    assert.match(error.message, /原始邮件（含附件）超过 2 MiB/);
    assert.match(error.message, /未读取正文/);
    return true;
  });
  assert.equal(bodyReads, 0);
  f.client.fetchOne = async () => ({ uid: 601, size: source.length + 1, source });
  await assert.rejects(
    f.connector.read(f.input),
    (error: unknown) => error instanceof ReadConnectorError && error.code === 'invalid_response',
  );
});

test('mail MIME content becomes plain text with attachment metadata and no executable HTML or attachment data', async () => {
  const f = fixture();
  await f.authorize();
  const mime = Buffer.from(
    [
      'Subject: HTML mail',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="boundary"',
      '',
      '--boundary',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<h1>Hello</h1><script>window.bad()</script><img src="https://invalid.example/tracker.png">',
      '--boundary',
      'Content-Type: text/plain; name="../notes.txt"',
      'Content-Disposition: attachment; filename="../notes.txt"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('ATTACHMENT_ONLY_SECRET').toString('base64'),
      '--boundary--',
      '',
    ].join('\r\n'),
  );
  f.client.fetchOne = async () => ({
    uid: 601,
    size: mime.length,
    source: mime,
    envelope: { subject: 'HTML mail' },
  });
  const result = await f.connector.read(f.input);
  assert.match(result.content, /Hello/iu);
  assert.match(result.content, /notes.txt/);
  assert.match(result.content, /text\/plain/);
  assert.doesNotMatch(result.content, /<script>|window.bad|ATTACHMENT_ONLY_SECRET/);
});

test('mail cursor resumes without missing matches and is bound to account, query and UIDVALIDITY', async () => {
  const f = fixture();
  await f.authorize();
  const first = await f.connector.search({ ...f.input, query: { subject: 'invoice' }, limit: 1 });
  f.client.search = async (query) => {
    assert.equal(query.uid, '200:699');
    return [601];
  };
  const second = await f.connector.search({
    ...f.input,
    query: { subject: 'invoice' },
    cursor: first.nextCursor,
    limit: 1,
  });
  assert.equal(second.messages[0]?.reference, reference);
  await assert.rejects(
    f.connector.search({ ...f.input, query: { subject: 'changed' }, cursor: first.nextCursor }),
    ReadConnectorError,
  );
  f.mailbox.uidValidity = 43n;
  await assert.rejects(
    f.connector.search({ ...f.input, query: { subject: 'invoice' }, cursor: first.nextCursor }),
    ReadConnectorError,
  );
});

test('mail rejects malformed search filters before opening a network connection', async () => {
  const f = fixture();
  await f.authorize();
  const count = f.calls.length;
  for (const query of [
    { subject: 'x\r\nUID ALL' },
    { since: '2026-02-31' },
    { before: 'invalid' },
  ]) {
    await assert.rejects(f.connector.search({ ...f.input, query }), ReadConnectorError);
  }
  assert.equal(f.calls.length, count);
});

test('mail empty inbox has no continuation and does not dispatch a reversed UID range', async () => {
  const f = fixture();
  await f.authorize();
  f.mailbox.uidNext = 1;
  f.mailbox.exists = 0;
  const result = await f.connector.search({ ...f.input, query: {} });
  assert.deepEqual(result.messages, []);
  assert.equal(result.hasMore, false);
  assert.deepEqual(result.scannedUidRange, { from: 0, to: 0 });
  assert.equal(f.calls.filter((call) => call.name === 'search').length, 0);
});

test('mail onboarding callback errors are sanitized and cannot leak an authorization code', async () => {
  const connector = createMailConnector({
    id: 'qq-mail-imap',
    credentials: { get: async () => undefined, set: async () => {}, delete: async () => {} },
    requestCredentials: async () => {
      throw new Error(secret.authorizationCode);
    },
  });
  await assert.rejects(
    connector.run({
      profile,
      installCli: false,
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
    (error: unknown) =>
      error instanceof ReadConnectorError && !error.message.includes(secret.authorizationCode),
  );
});

test('NetEase adapter pins the 163 endpoint and keeps its profile credential separate from QQ', async () => {
  const f = fixture();
  f.client.authenticated = 'person@163.com';
  const configurations: Array<Record<string, unknown>> = [];
  const connector = createMailConnector({
    id: 'netease-mail-imap',
    credentials: {
      get: async (key) => f.saved.get(key),
      set: async (key, value) => {
        f.saved.set(key, value);
      },
      delete: async (key) => {
        f.saved.delete(key);
      },
    },
    requestCredentials: async () => ({
      email: 'Person@163.com',
      authorizationCode: secret.authorizationCode,
    }),
    clientFactory: (configuration) => {
      configurations.push(configuration as unknown as Record<string, unknown>);
      return f.client;
    },
  });
  await connector.run({
    profile,
    installCli: false,
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  assert.equal(configurations[0]?.host, 'imap.163.com');
  assert.equal((await connector.inspect(profile)).identity?.subjectId, 'person@163.com');
  assert.equal(connector.acceptsResource('mail://netease/inbox/42/601'), true);
  assert.equal(connector.acceptsResource(reference), false);
  assert.equal((await f.connector.inspect(profile)).identity, undefined);
});

test('mail read and search authorize before asserting the service dispatch guard', async () => {
  const f = fixture();
  await f.authorize();
  for (const operation of ['read', 'search'] as const) {
    let checked = false;
    const input = {
      ...f.input,
      beforeRead: async () => {
        checked = true;
      },
      assertRead: () => {
        assert.equal(checked, true, 'service requires beforeRead before assertRead');
      },
    };
    if (operation === 'read') await f.connector.read(input);
    else await f.connector.search({ ...input, query: {} });
  }
});
