import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WebContents } from 'electron';
import { installNavigationGuards } from '../window/navigation-guards.js';
import { remoteWebPreviewRegistry } from '../window/remote-web-preview.js';

type WindowOpenHandler = (details: { url: string }) => { action: 'deny' };
type NavigateHandler = (event: { preventDefault(): void }, url: string) => void;
type FrameNavigateHandler = (details: {
  url: string;
  isMainFrame: boolean;
  frame: { url: string } | null;
  preventDefault(): void;
}) => void;

function installGuard(deps: {
  readonly devServerUrl?: string;
  readonly allowedAppOrigin?: string;
  readonly allowedDataUrls?: readonly string[];
  readonly openExternal?: (url: string) => void;
  readonly previewId?: string;
}): {
  readonly openHandler: WindowOpenHandler;
  readonly navigate: (url: string) => boolean;
  readonly frameNavigate: (url: string, currentUrl?: string) => boolean;
  readonly frameRedirect: (url: string) => boolean;
} {
  let openHandler: WindowOpenHandler | null = null;
  let navigateHandler: NavigateHandler | null = null;
  let frameNavigateHandler: FrameNavigateHandler | null = null;
  let frameRedirectHandler: FrameNavigateHandler | null = null;
  const mainFrame = { name: '', parent: null };
  const childFrame = {
    url: 'about:blank',
    name: deps.previewId ? `space-web-preview-${deps.previewId}` : '',
    parent: mainFrame,
  };
  const wc = {
    id: 42,
    mainFrame,
    setWindowOpenHandler(handler: WindowOpenHandler) {
      openHandler = handler;
    },
    on(event: string, handler: NavigateHandler | FrameNavigateHandler) {
      if (event === 'will-redirect') frameRedirectHandler = handler as FrameNavigateHandler;
      if (event === 'will-navigate') navigateHandler = handler as NavigateHandler;
      if (event === 'will-frame-navigate') {
        frameNavigateHandler = handler as FrameNavigateHandler;
      }
    },
  } as unknown as WebContents;

  installNavigationGuards(wc, {
    devServerUrl: deps.devServerUrl,
    allowedAppOrigin: deps.allowedAppOrigin ?? 'app://space',
    allowedDataUrls: deps.allowedDataUrls,
    openExternal: deps.openExternal ?? (() => undefined),
  });

  assert.ok(openHandler);
  assert.ok(navigateHandler);
  assert.ok(frameNavigateHandler);
  return {
    openHandler,
    frameRedirect(url: string): boolean {
      let prevented = false;
      frameRedirectHandler?.({
        url,
        isMainFrame: false,
        frame: childFrame,
        preventDefault() {
          prevented = true;
        },
      });
      return prevented;
    },
    navigate(url: string): boolean {
      let prevented = false;
      navigateHandler?.(
        {
          preventDefault() {
            prevented = true;
          },
        },
        url,
      );
      return prevented;
    },
    frameNavigate(url: string, currentUrl = 'about:blank'): boolean {
      let prevented = false;
      frameNavigateHandler?.({
        url,
        isMainFrame: false,
        frame: { ...childFrame, url: currentUrl },
        preventDefault() {
          prevented = true;
        },
      });
      return prevented;
    },
  };
}

test('navigation guard allows the exact packaged app origin and denies lookalikes', () => {
  const guard = installGuard({});

  assert.equal(guard.navigate('app://space/index.html'), false);
  assert.equal(guard.navigate('app://space/assets/main.js'), false);
  assert.equal(guard.navigate('app://other/index.html'), true);
  assert.equal(guard.navigate('app://space.evil/index.html'), true);
  assert.equal(guard.navigate('app://user@space/index.html'), true);
  assert.equal(guard.navigate('file:///app/index.html'), true);
});

test('only an explicitly granted remote preview may navigate HTTPS, never local app pages', () => {
  const grant = remoteWebPreviewRegistry.create(42, 'https://example.feishu.cn/docx/report');
  try {
    const opened: string[] = [];
    const guard = installGuard({ previewId: grant.id, openExternal: (url) => opened.push(url) });
    assert.equal(guard.frameNavigate(grant.url), false);
    assert.equal(guard.frameRedirect('https://accounts.feishu.cn/login'), false);
    for (const url of [
      'app://space/__artifact_html_sandbox__',
      'file:///etc/passwd',
      'https://user:secret@example.org/',
      'http://example.org/',
    ]) {
      assert.equal(guard.frameNavigate(url), true);
      assert.equal(guard.frameRedirect(url), true);
    }
    assert.deepEqual(opened, []);
    remoteWebPreviewRegistry.release(42, grant.id);
    assert.equal(guard.frameNavigate(grant.url), true);
  } finally {
    remoteWebPreviewRegistry.release(42);
  }
});

test('navigation guard allows only exact trusted data URLs', () => {
  const allowedDataUrl = 'data:text/html;charset=utf-8,%3C!doctype%20html%3E';
  const guard = installGuard({ allowedDataUrls: [allowedDataUrl] });

  assert.equal(guard.navigate(allowedDataUrl), false);
  assert.equal(
    guard.navigate('data:text/html;charset=utf-8,%3Cscript%3Ealert(1)%3C%2Fscript%3E'),
    true,
  );
  assert.equal(guard.navigate(`${allowedDataUrl}%3Cscript%3Ealert(1)%3C%2Fscript%3E`), true);
});

test('navigation guard denies window.open and routes https externally', () => {
  const opened: string[] = [];
  const guard = installGuard({ openExternal: (url) => opened.push(url) });

  assert.deepEqual(guard.openHandler({ url: 'https://example.com' }), { action: 'deny' });
  assert.deepEqual(opened, ['https://example.com']);
  assert.deepEqual(guard.openHandler({ url: 'file:///etc/passwd' }), { action: 'deny' });
  assert.deepEqual(opened, ['https://example.com']);
});

test('navigation guard confines child frames to preview endpoints', () => {
  const opened: string[] = [];
  const guard = installGuard({ openExternal: (url) => opened.push(url) });
  const preview = 'app://preview-00000000000000000000000000000001/index.html';

  assert.equal(guard.frameNavigate(preview), false);
  assert.equal(guard.frameNavigate(new URL('./page.html', preview).toString(), preview), false);
  assert.equal(guard.frameNavigate('app://space/__artifact_html_sandbox__'), false);
  assert.equal(guard.frameNavigate('app://space/index.html', preview), true);
  assert.equal(guard.frameNavigate('file:///etc/passwd', preview), true);
  assert.equal(guard.frameNavigate('https://example.com', preview), true);
  assert.deepEqual(opened, []);
});

test('extension bootstrap remains a child-frame endpoint and remote frame navigation stays denied', () => {
  const guard = installGuard({});
  assert.equal(guard.frameNavigate('app://space/__space-extension-frame'), false);
  assert.equal(guard.navigate('app://space/__space-extension-frame'), true);
  assert.equal(guard.frameNavigate('https://example.com'), true);
  assert.equal(guard.frameRedirect('https://example.com'), true);
  assert.equal(guard.frameRedirect('app://space/index.html'), true);
  assert.equal(guard.frameRedirect('app://space/__space-extension-frame'), false);
  assert.equal(guard.frameNavigate('http://localhost:5173'), true);
  assert.equal(guard.frameNavigate('app://space/index.html'), true);
});
