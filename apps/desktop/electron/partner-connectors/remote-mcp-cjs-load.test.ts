import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);

test('Electron CommonJS can load the remote MCP factories without requiring the ESM-only SDK subpath', async () => {
  const outputDir = await mkdtemp(path.join(process.cwd(), '.remote-mcp-cjs-'));
  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  const clientBundle = path.join(outputDir, 'remote-mcp-client.cjs');
  const oauthBundle = path.join(outputDir, 'remote-mcp-oauth.cjs');

  try {
    await Promise.all([
      build({
        entryPoints: [path.join(sourceDir, 'remote-mcp-client.ts')],
        outfile: clientBundle,
        bundle: true,
        platform: 'node',
        target: 'node24',
        format: 'cjs',
        external: ['@kodax-ai/kodax/mcp'],
        logLevel: 'silent',
      }),
      build({
        entryPoints: [path.join(sourceDir, 'remote-mcp-oauth.ts')],
        outfile: oauthBundle,
        bundle: true,
        platform: 'node',
        target: 'node24',
        format: 'cjs',
        external: ['@kodax-ai/kodax/mcp'],
        logLevel: 'silent',
      }),
    ]);

    const clientModule = require(clientBundle) as {
      defineRemoteMcpProvider(definition: unknown): unknown;
      createRemoteMcpClient(options: unknown): unknown;
    };
    const oauthModule = require(oauthBundle) as {
      createRemoteMcpOAuth(config: unknown, dependencies: unknown): unknown;
    };

    const provider = clientModule.defineRemoteMcpProvider({
      serverId: 'notion',
      endpoint: 'https://mcp.notion.com/mcp',
      allowedHosts: ['mcp.notion.com'],
      readTools: {
        fetch_page: {
          inputSchema: {
            type: 'object',
            properties: { pageId: { type: 'string' } },
            required: ['pageId'],
          },
        },
      },
    });
    assert.equal(
      typeof clientModule.createRemoteMcpClient({
        provider,
        bearerToken: 'token',
        cacheDir: path.join(outputDir, 'cache'),
      }),
      'object',
    );
    assert.equal(
      typeof oauthModule.createRemoteMcpOAuth(
        {
          providerId: 'notion',
          serverUrl: 'https://mcp.notion.com/mcp',
          clientName: 'KodaX Space',
          clientId: 'public-client',
          isAuthorizationEndpoint: () => true,
          isTokenEndpoint: () => true,
          isRegistrationEndpoint: () => true,
        },
        {
          credentials: {
            get: async () => undefined,
            set: async () => {},
            delete: async () => {},
          },
        },
      ),
      'object',
    );
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
