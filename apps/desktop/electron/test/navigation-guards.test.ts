import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WebContents } from 'electron';
import {
  installNavigationGuards,
  PartnerBrowserFrameRegistry,
} from '../window/navigation-guards.js';

const PARTNER_FRAME_NAME = 'kodax-partner-browser-4ef27e2f-c7de-4d8f-9f3a-3013ec6cf6b8';
const RENAMED_PARTNER_FRAME_NAME = 'kodax-partner-browser-85ce53c4-bd67-4ca7-8df7-b0e817566ffc';

test('extension bootstrap is allowed only as a child and cannot navigate to remote or privileged pages', () => {
  const guard = installGuard({ allowPartnerBrowserFrames: true });
  assert.equal(guard.frameNavigate('app://space/__space-extension-frame'), false);
  assert.equal(guard.navigate('app://space/__space-extension-frame'), true);
  assert.equal(guard.frameNavigate('app://space/index.html'), true);
  assert.equal(guard.frameNavigate('https://example.com', 'space-extension'), true);
  assert.equal(guard.frameNavigate('file:///etc/passwd', 'space-extension'), true);
});

type WindowOpenHandler = (details: { url: string }) => { action: 'deny' };
type NavigateHandler = (event: { preventDefault(): void }, url: string) => void;
type FrameNavigateHandler = (details: {
  url: string;
  isMainFrame: boolean;
  frame: TestFrame | null;
  preventDefault(): void;
}) => void;
type FrameRedirectHandler = FrameNavigateHandler;
type DidFrameNavigateHandler = (
  event: unknown,
  url: string,
  httpResponseCode: number,
  httpStatusText: string,
  isMainFrame: boolean,
  frameProcessId: number,
  frameRoutingId: number,
) => void;
type DidNavigateInPageHandler = (
  event: unknown,
  url: string,
  isMainFrame: boolean,
  frameProcessId: number,
  frameRoutingId: number,
) => void;

interface TestFrame {
  readonly url: string;
  readonly name: string;
  readonly frameTreeNodeId: number;
  readonly parent: TestFrame | null;
}

function installGuard(deps: {
  readonly devServerUrl?: string;
  readonly allowedAppOrigin?: string;
  readonly allowedDataUrls?: readonly string[];
  readonly openExternal?: (url: string) => void;
  readonly allowPartnerBrowserFrames?: boolean;
  readonly onPartnerBrowserNavigated?: (payload: {
    readonly frameName: string;
    readonly url: string;
  }) => void;
}): {
  readonly openHandler: WindowOpenHandler;
  readonly navigate: (url: string) => boolean;
  readonly registerFrame: (
    frameName: string,
    directChild?: boolean,
    frameTreeNodeId?: number,
  ) => boolean;
  readonly frameNavigate: (
    url: string,
    frameName?: string,
    directChild?: boolean,
    frameTreeNodeId?: number,
  ) => boolean;
  readonly frameRedirect: (
    url: string,
    frameName?: string,
    directChild?: boolean,
    frameTreeNodeId?: number,
  ) => boolean;
  readonly didFrameNavigate: (
    url: string,
    frameName?: string,
    directChild?: boolean,
    frameTreeNodeId?: number,
  ) => void;
  readonly didNavigateInPage: (
    url: string,
    frameName?: string,
    directChild?: boolean,
    frameTreeNodeId?: number,
  ) => void;
} {
  let openHandler: WindowOpenHandler | null = null;
  let navigateHandler: NavigateHandler | null = null;
  let frameNavigateHandler: FrameNavigateHandler | null = null;
  let frameRedirectHandler: FrameRedirectHandler | null = null;
  let didFrameNavigateHandler: DidFrameNavigateHandler | null = null;
  let didNavigateInPageHandler: DidNavigateInPageHandler | null = null;
  let resolvedFrame: TestFrame | null = null;
  const mainFrame: TestFrame = {
    url: 'app://space/index.html',
    name: '',
    frameTreeNodeId: 1,
    parent: null,
  };
  const makeFrame = (name: string, directChild: boolean, frameTreeNodeId: number): TestFrame => ({
    url: 'about:blank',
    name,
    frameTreeNodeId,
    parent: directChild
      ? mainFrame
      : { url: 'https://example.com', name: 'nested', frameTreeNodeId: 99, parent: mainFrame },
  });
  const partnerBrowserFrames = new PartnerBrowserFrameRegistry();
  const wc = {
    mainFrame,
    setWindowOpenHandler(handler: WindowOpenHandler) {
      openHandler = handler;
    },
    on(
      event: string,
      handler:
        | NavigateHandler
        | FrameNavigateHandler
        | FrameRedirectHandler
        | DidFrameNavigateHandler
        | DidNavigateInPageHandler,
    ) {
      if (event === 'will-navigate') navigateHandler = handler as NavigateHandler;
      if (event === 'will-frame-navigate') {
        frameNavigateHandler = handler as FrameNavigateHandler;
      }
      if (event === 'will-redirect') frameRedirectHandler = handler as FrameRedirectHandler;
      if (event === 'did-frame-navigate') {
        didFrameNavigateHandler = handler as DidFrameNavigateHandler;
      }
      if (event === 'did-navigate-in-page') {
        didNavigateInPageHandler = handler as DidNavigateInPageHandler;
      }
    },
  } as unknown as WebContents;

  installNavigationGuards(wc, {
    devServerUrl: deps.devServerUrl,
    allowedAppOrigin: deps.allowedAppOrigin ?? 'app://space',
    allowedDataUrls: deps.allowedDataUrls,
    openExternal: deps.openExternal ?? (() => undefined),
    allowPartnerBrowserFrames: deps.allowPartnerBrowserFrames,
    onPartnerBrowserNavigated: deps.onPartnerBrowserNavigated,
    resolveFrame: () => resolvedFrame as never,
    resolvePartnerBrowserFrameName: (frame) => partnerBrowserFrames.resolveName(frame, mainFrame),
  });

  assert.ok(openHandler);
  assert.ok(navigateHandler);
  assert.ok(frameNavigateHandler);
  assert.ok(frameRedirectHandler);
  assert.ok(didFrameNavigateHandler);
  assert.ok(didNavigateInPageHandler);
  const tryFrameNavigation = (
    handler: FrameNavigateHandler | FrameRedirectHandler | null,
    url: string,
    frameName: string,
    directChild: boolean,
    frameTreeNodeId: number,
  ): boolean => {
    let prevented = false;
    handler?.({
      url,
      isMainFrame: false,
      frame: makeFrame(frameName, directChild, frameTreeNodeId),
      preventDefault() {
        prevented = true;
      },
    });
    return prevented;
  };
  return {
    openHandler,
    registerFrame(frameName: string, directChild = true, frameTreeNodeId = 2): boolean {
      return partnerBrowserFrames.register(
        makeFrame(frameName, directChild, frameTreeNodeId),
        mainFrame,
      );
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
    frameNavigate(url: string, frameName = '', directChild = true, frameTreeNodeId = 2): boolean {
      return tryFrameNavigation(frameNavigateHandler, url, frameName, directChild, frameTreeNodeId);
    },
    frameRedirect(url: string, frameName = '', directChild = true, frameTreeNodeId = 2): boolean {
      return tryFrameNavigation(frameRedirectHandler, url, frameName, directChild, frameTreeNodeId);
    },
    didFrameNavigate(url: string, frameName = '', directChild = true, frameTreeNodeId = 2): void {
      resolvedFrame = makeFrame(frameName, directChild, frameTreeNodeId);
      didFrameNavigateHandler?.({}, url, 200, 'OK', false, 7, 11);
    },
    didNavigateInPage(url: string, frameName = '', directChild = true, frameTreeNodeId = 2): void {
      resolvedFrame = makeFrame(frameName, directChild, frameTreeNodeId);
      didNavigateInPageHandler?.({}, url, false, 7, 11);
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

test('navigation guard keeps remote child frames disabled by default', () => {
  const opened: string[] = [];
  const guard = installGuard({ openExternal: (url) => opened.push(url) });
  const preview = 'app://preview-00000000000000000000000000000001/index.html';

  assert.equal(guard.frameNavigate(preview), false);
  assert.equal(guard.frameNavigate(new URL('./page.html', preview).toString()), false);
  assert.equal(guard.frameNavigate('app://space/__artifact_html_sandbox__'), false);
  assert.equal(guard.frameNavigate('app://space/index.html'), true);
  assert.equal(guard.frameNavigate('file:///etc/passwd'), true);
  assert.equal(guard.frameNavigate('https://example.com', 'kodax-partner-browser-disabled'), true);
  assert.equal(
    guard.frameNavigate('http://127.0.0.1:5173', 'kodax-partner-browser-disabled'),
    true,
  );
  assert.equal(guard.frameNavigate('https://user:secret@example.com'), true);
  assert.equal(guard.frameNavigate('javascript:alert(1)'), true);
  assert.deepEqual(opened, []);
});

test('navigation guard allows only creation-registered Partner browser frames', () => {
  const navigated: Array<{ frameName: string; url: string }> = [];
  const guard = installGuard({
    allowPartnerBrowserFrames: true,
    onPartnerBrowserNavigated: (payload) => navigated.push(payload),
  });
  assert.equal(guard.registerFrame(PARTNER_FRAME_NAME), true);
  assert.equal(guard.registerFrame(PARTNER_FRAME_NAME, false, 3), false);

  assert.equal(guard.frameNavigate('https://example.com', PARTNER_FRAME_NAME), false);
  assert.equal(guard.frameNavigate('http://127.0.0.1:5173', PARTNER_FRAME_NAME), false);
  assert.equal(guard.frameNavigate('https://example.com', 'other-frame', true, 4), true);
  assert.equal(guard.frameNavigate('https://example.com', PARTNER_FRAME_NAME, false, 3), true);
  assert.equal(guard.frameNavigate('https://user:secret@example.com', PARTNER_FRAME_NAME), true);
  assert.equal(guard.frameRedirect('https://example.com/final', PARTNER_FRAME_NAME), false);
  assert.equal(guard.frameRedirect('file:///etc/passwd', PARTNER_FRAME_NAME), true);
  assert.equal(guard.frameRedirect('https://example.com/final', 'other-frame', true, 4), true);

  guard.didFrameNavigate('https://example.com/final', PARTNER_FRAME_NAME);
  guard.didNavigateInPage('https://example.com/final#section', PARTNER_FRAME_NAME);
  guard.didFrameNavigate('https://example.com/ignored', 'other-frame', true, 4);
  guard.didFrameNavigate('https://example.com/ignored', PARTNER_FRAME_NAME, false, 3);
  assert.deepEqual(navigated, [
    { frameName: PARTNER_FRAME_NAME, url: 'https://example.com/final' },
    { frameName: PARTNER_FRAME_NAME, url: 'https://example.com/final#section' },
  ]);
});

test('navigation guard rejects a project preview that forges window.name after creation', () => {
  const guard = installGuard({ allowPartnerBrowserFrames: true });

  assert.equal(guard.registerFrame('project-web-preview', true, 7), false);
  assert.equal(guard.registerFrame(PARTNER_FRAME_NAME, true, 7), false);
  assert.equal(guard.registerFrame('kodax-partner-browser-not-a-uuid', true, 8), false);
  assert.equal(guard.frameNavigate('https://attacker.example', PARTNER_FRAME_NAME, true, 7), true);
  assert.equal(guard.frameRedirect('https://attacker.example', PARTNER_FRAME_NAME, true, 7), true);
});

test('navigation guard keeps the original Partner identity after child content renames itself', () => {
  const navigated: Array<{ frameName: string; url: string }> = [];
  const guard = installGuard({
    allowPartnerBrowserFrames: true,
    onPartnerBrowserNavigated: (payload) => navigated.push(payload),
  });

  assert.equal(guard.registerFrame(PARTNER_FRAME_NAME, true, 9), true);
  assert.equal(guard.registerFrame(RENAMED_PARTNER_FRAME_NAME, true, 9), true);
  assert.equal(
    guard.frameNavigate('https://example.com/renamed', RENAMED_PARTNER_FRAME_NAME, true, 9),
    false,
  );
  guard.didFrameNavigate('https://example.com/renamed', RENAMED_PARTNER_FRAME_NAME, true, 9);

  assert.deepEqual(navigated, [
    { frameName: PARTNER_FRAME_NAME, url: 'https://example.com/renamed' },
  ]);
});
