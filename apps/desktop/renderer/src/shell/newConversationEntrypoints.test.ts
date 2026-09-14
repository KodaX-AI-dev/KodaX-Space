import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const browserPath = [
  chromium.executablePath(),
  ...(process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : []),
].find(existsSync);

// Actual entry components and Partner provider; only the external desktop bridge and Vite
// asset environment are supplied by the fixture. No user profile, main process or server.
const fixtureSource = `
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppTopMenu } from './Shell.tsx';
import { LeftSidebar } from './LeftSidebar.tsx';
import { BottomBar } from './BottomBar.tsx';
import { CommandPaletteController } from './CommandPalette.tsx';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { useAppStore } from '../store/appStore.ts';
import { useSurfaceStore } from '../store/surface.ts';
import { SpaceExtensionsProvider } from '../features/extensions/SpaceExtensionsProvider.tsx';
import { PartnerExpertProvider, usePartnerExpert } from '../features/extensions/PartnerExpertProvider.tsx';
const extension = { id: 'library', name: 'Library', description: '', version: '1.0.0', enabled: true, installedAt: 1, expertCount: 1, connectorCount: 0 };
const expert = { extensionId: 'library', extensionVersion: '1.0.0', expert: { id: 'editor', revision: 1, name: 'Draft editor', description: '', prompt: 'Edit.', starterTasks: [] } };
window.kodaxSpace = {
  platform: 'darwin', on: () => () => {},
  invoke: async (channel) => {
    if (channel === 'space.extensions.list') return { ok: true, data: { extensions: [extension] } };
    if (channel === 'space.extensions.resolveExpert') return { ok: true, data: { expert } };
    if (channel === 'session.list') return { ok: true, data: { sessions: [] } };
    if (channel === 'session.listRunning') return { ok: true, data: { peers: [] } };
    if (channel === 'slash.discover') return { ok: true, data: { commands: [] } };
    if (channel === 'project.fileSearch') return { ok: true, data: { paths: [] } };
    return { ok: false, error: { code: 'ERR_TEST_UNAVAILABLE', message: 'Not needed by this scenario' } };
  },
};
useSurfaceStore.getState().setSurface('partner');
useAppStore.getState().setProjects([{ path: '/project', name: 'Project', lastUsedAt: 1 }]);
useAppStore.getState().setCurrentProject('/project');
function Fixture() {
  const context = usePartnerExpert();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [ack, setAck] = useState('waiting');
  const captured = useRef(null);
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  useEffect(() => {
    const close = () => setLibraryOpen(false);
    window.addEventListener('kodax-space.new-conversation', close);
    return () => window.removeEventListener('kodax-space.new-conversation', close);
  }, []);
  async function prepare() {
    await context.binding.select({ extensionId: 'library', expertId: 'editor', revision: 1 });
    captured.current = context.binding.captureDraft(context.binding.getSnapshot().context);
  }
  function deliverAck() {
    const accepted = context.binding.acceptCreatedSession(captured.current, 'old-created-session', expert);
    if (accepted) useAppStore.getState().setCurrentSession('old-created-session');
    setAck(accepted ? 'accepted' : 'rejected');
  }
  return <>
    <AppTopMenu leftSidebarOpen rightSidebarOpen={false} rightSidebarAvailable showHistoryNavigation={false}
      focusMode={false} diagnosticsOpen={false} onToggleLeftSidebar={() => {}} onToggleRightSidebar={() => {}}
      onToggleFocusMode={() => {}} onToggleDiagnostics={() => {}} onOpenSettings={() => {}} />
    <button onClick={prepare}>Prepare selected draft</button><button onClick={deliverAck}>Deliver old create ACK</button>
    <output data-testid="selected-expert">{context.snapshot.state.expert?.expert.name ?? 'none'}</output>
    <output data-testid="ack-result">{ack}</output><output data-testid="active-session">{currentSessionId ?? 'none'}</output>
    <LeftSidebar onOpenSettings={() => {}} pluginsAvailable pluginsActive={libraryOpen}
      onOpenPlugins={() => setLibraryOpen(true)} onNavigate={() => setLibraryOpen(false)} />
    {libraryOpen && <div data-testid="library-view">Opened library</div>}
    <BottomBar /><CommandPaletteController />
  </>;
}
createRoot(document.getElementById('root')).render(<I18nProvider><SpaceExtensionsProvider><PartnerExpertProvider><Fixture /></PartnerExpertProvider></SpaceExtensionsProvider></I18nProvider>);
`;

test(
  'every explicit Partner new-conversation entry invalidates a null-session draft and its pending create',
  { skip: !browserPath },
  async (t) => {
    const bundled = await build({
      stdin: {
        contents: fixtureSource,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      logLevel: 'silent',
      define: {
        'import.meta.glob': '__testAssetGlob',
        'import.meta.env': '{}',
        'import.meta.url': '"about:blank"',
      },
      banner: { js: 'const __testAssetGlob = () => ({});' },
      loader: { '.png': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
      plugins: [
        {
          name: 'vite-asset-environment',
          setup(builder) {
            builder.onResolve({ filter: /\?(?:url|inline|worker)$/ }, (args) => ({
              path: args.path,
              namespace: 'test-asset',
            }));
            builder.onLoad({ filter: /.*/, namespace: 'test-asset' }, (args) => ({
              contents: args.path.endsWith('?worker')
                ? 'export default class TestWorker {}'
                : 'export default "";',
              loader: 'js',
            }));
          },
        },
      ],
    });
    const browser = await chromium.launch({ executablePath: browserPath, headless: true });
    t.after(() => browser.close());
    for (const entry of [
      'file-menu',
      'keyboard',
      'command-palette',
      'project-row',
      'sidebar',
    ] as const) {
      await t.test(entry, async () => {
        const page = await browser.newPage({
          viewport: { width: 1600, height: 1000 },
          locale: 'en-US',
        });
        page.setDefaultTimeout(3000);
        page.on('pageerror', (error) => t.diagnostic(error.message));
        try {
          await page.route('**/*', (route) =>
            route.fulfill({ body: '<div id="root"></div>', contentType: 'text/html' }),
          );
          await page.goto('https://partner-entry.test/');
          await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'en-US'));
          await page.addScriptTag({ content: bundled.outputFiles[0]!.text });
          await page.getByRole('button', { name: 'Prepare selected draft', exact: true }).click();
          await page.getByTestId('selected-expert').filter({ hasText: 'Draft editor' }).waitFor();
          await page.locator('textarea').fill('Preserve this draft');
          await page.getByTestId('partner-plugins-nav').click();
          if (entry === 'file-menu') {
            await page.getByRole('button', { name: 'File', exact: true }).click();
            await page.getByRole('menuitem', { name: /^New Session/ }).click();
          } else if (entry === 'keyboard') {
            await page.keyboard.press('Meta+n');
          } else if (entry === 'command-palette') {
            await page.keyboard.press('Meta+Shift+p');
            await page
              .getByRole('dialog')
              .getByRole('button', { name: /New session/ })
              .click();
          } else if (entry === 'project-row') {
            await page
              .getByRole('button', { name: 'New session in this project: Project', exact: true })
              .click();
          } else {
            await page.getByRole('button', { name: 'New session', exact: true }).click();
          }
          const newDraft = {
            expert: await page.getByTestId('selected-expert').textContent(),
            libraryViews: await page.getByTestId('library-view').count(),
            text: await page.locator('textarea').inputValue(),
          };
          await page.getByRole('button', { name: 'Deliver old create ACK', exact: true }).click();
          assert.deepEqual(
            {
              ...newDraft,
              ack: await page.getByTestId('ack-result').textContent(),
              session: await page.getByTestId('active-session').textContent(),
            },
            {
              expert: 'none',
              libraryViews: 0,
              text: 'Preserve this draft',
              ack: 'rejected',
              session: 'none',
            },
          );
        } finally {
          await page.close();
        }
      });
    }
  },
);
