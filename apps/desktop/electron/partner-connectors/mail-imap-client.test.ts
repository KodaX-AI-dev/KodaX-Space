import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { test } from 'node:test';
import { createMailImapClient } from './mail-connector.js';

/** A local protocol peer exercises the pinned library, not a second IMAP implementation. */
async function protocolFixture(t: { after(fn: () => Promise<void>): void }, preauth = false) {
  const commands: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write(`* ${preauth ? 'PREAUTH' : 'OK'} [CAPABILITY IMAP4rev1 NAMESPACE] local test\r\n`);
    let buffered = '';
    socket.on('data', (chunk) => {
      buffered += chunk.toString('utf8');
      while (buffered.includes('\r\n')) {
        const end = buffered.indexOf('\r\n');
        const line = buffered.slice(0, end);
        buffered = buffered.slice(end + 2);
        const [tag, command] = line.split(' ');
        // Credentials are fixture-only; record command names instead of LOGIN arguments.
        commands.push(command === 'LOGIN' ? `${tag} LOGIN` : line);
        if (command === 'CAPABILITY') socket.write('* CAPABILITY IMAP4rev1 NAMESPACE\r\n');
        else if (command === 'NAMESPACE') socket.write('* NAMESPACE (("" "/")) NIL NIL\r\n');
        else if (command === 'EXAMINE') {
          socket.write(
            '* FLAGS (\\Seen)\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 42] valid\r\n* OK [UIDNEXT 602] next\r\n',
          );
        } else if (command === 'UID' && line.includes('FETCH')) {
          const body = Buffer.from('Read-only fixture body');
          socket.write(`* 1 FETCH (UID 601 BODY[]<0> {${body.length}}\r\n`);
          socket.write(body);
          socket.write(')\r\n');
        }
        socket.write(`${tag} OK ${command === 'EXAMINE' ? '[READ-ONLY] ' : ''}done\r\n`);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const client = createMailImapClient({
    host: '127.0.0.1',
    port: address.port,
    secure: false,
    doSTARTTLS: false,
    auth: { user: 'fixture@qq.com', pass: 'fixture-auth-code', loginMethod: 'LOGIN' },
    logger: false,
    disableAutoIdle: true,
    disableCompression: true,
    disableAutoEnable: true,
  });
  return { client, commands };
}

test('real ImapFlow login maps boolean auth state to verified username and sends EXAMINE + BODY.PEEK', async (t) => {
  const { client, commands } = await protocolFixture(t);
  try {
    await client.connect();
    assert.equal(client.authenticated, 'fixture@qq.com');
    const mailbox = await client.mailboxOpen('INBOX', { readOnly: true });
    assert.equal(mailbox.uidValidity, 42n);
    const result = await client.fetchOne(
      '601',
      { source: { start: 0, maxLength: 128 } },
      { uid: true },
    );
    assert.ok(result);
    assert.equal(result.source?.toString(), 'Read-only fixture body');
    assert.ok(commands.some((command) => command.includes('EXAMINE INBOX')));
    assert.ok(commands.some((command) => command.includes('BODY.PEEK[]<0.128>')));
    assert.ok(commands.every((command) => !/\bSTORE\b|\bAPPEND\b|\bSELECT\b/u.test(command)));
  } finally {
    client.close();
  }
});

test('real ImapFlow PREAUTH does not count as validation of the supplied mailbox credentials', async (t) => {
  const { client, commands } = await protocolFixture(t, true);
  try {
    await client.connect();
    assert.equal(client.authenticated, false);
    assert.ok(commands.every((command) => !command.includes('LOGIN')));
  } finally {
    client.close();
  }
});
