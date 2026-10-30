import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** A real native HTTP boundary; callbacks run in Main, never in the shared Host. */
export async function createProviderHttpFixture(t, { name, keyName, stream }) {
  const faults = [];
  const server = createServer(async (request, response) => {
    try {
      let bytes = ''; for await (const chunk of request) bytes += chunk;
      const input = JSON.parse(bytes);
      assert.ok(request.headers['x-api-key'] === 'offline-fixture', 'Fixture received an unexpected credential');
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = value => response.write(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`);
      send({ type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], usage: { input_tokens: 2, output_tokens: 0 } } });
      let index = 0;
      const text = value => {
        send({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
        send({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: value } });
        send({ type: 'content_block_stop', index: index++ });
      };
      try {
        const result = await stream(input.messages, input.tools ?? [], typeof input.system === 'string' ? input.system : (input.system ?? []).map(block => block.text ?? '').join(''), false, { onTextDelta: text });
        for (const block of result.textBlocks ?? []) text(block.text);
        for (const block of result.toolBlocks ?? []) {
          send({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } });
          send({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
          send({ type: 'content_block_stop', index: index++ });
        }
        send({ type: 'message_delta', delta: { stop_reason: result.toolBlocks?.length ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 2 } });
        send({ type: 'message_stop' });
      } catch (error) { if (error.code !== 'ERR_INVALID_ARG_TYPE') faults.push(error.name); send({ type: 'error', error: { type: 'invalid_request_error', message: 'Fixture interrupted after partial output' } }); }
      response.end();
    } catch (error) { faults.push(error.name); response.destroy(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); assert.deepEqual(faults, []); });
  return { name, protocol: 'anthropic', baseUrl: `http://127.0.0.1:${server.address().port}`, apiKeyEnv: keyName, model: 'fixture', reasoning: 'none' };
}
export async function saveFixtureProvider(homeDir, connection) {
  const file = path.join(homeDir, '.kodax', 'config.json');
  await mkdir(path.dirname(file), { recursive: true });
  let current = {};
  try { current = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(file, JSON.stringify({ ...current, customProviders: [connection] }));
}
