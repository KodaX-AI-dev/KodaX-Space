import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPartnerBrowserHistory,
  navigatePartnerBrowser,
  normalizePartnerBrowserUrl,
  partnerBrowserBack,
  partnerBrowserForward,
  reloadPartnerBrowser,
  synchronizePartnerBrowserUrl,
} from './partnerBrowserNavigation.js';
import { PARTNER_BROWSER_MAX_URL_LENGTH } from '@kodax-space/space-ipc-schema';

test('normalizes bare hosts to HTTPS and canonicalizes HTTP(S) URLs', () => {
  assert.deepEqual(normalizePartnerBrowserUrl(' example.com/docs '), {
    ok: true,
    url: 'https://example.com/docs',
  });
  assert.deepEqual(normalizePartnerBrowserUrl('HTTP://EXAMPLE.COM:80/a?q=1#top'), {
    ok: true,
    url: 'http://example.com/a?q=1#top',
  });
  assert.deepEqual(normalizePartnerBrowserUrl('localhost:5173/app'), {
    ok: true,
    url: 'https://localhost:5173/app',
  });
});

test('rejects invalid, credentialed, and non-HTTP(S) addresses', () => {
  for (const input of [
    '',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,hello',
    'https://user:secret@example.com',
    'https://exa mple.com',
    'https://exam\u200bple.com',
    'https://example.com\\@evil.com',
    'https://',
    'http:example.com',
  ]) {
    assert.equal(normalizePartnerBrowserUrl(input).ok, false, input);
  }

  assert.equal(
    normalizePartnerBrowserUrl(`https://example.com/${'a'.repeat(PARTNER_BROWSER_MAX_URL_LENGTH)}`)
      .ok,
    false,
  );
});

test('invalid initial addresses and unavailable navigation remain empty no-ops', () => {
  const history = createPartnerBrowserHistory('file:///etc/passwd');

  assert.equal(history.currentUrl, null);
  assert.equal(partnerBrowserBack(history), history);
  assert.equal(partnerBrowserForward(history), history);
  assert.equal(reloadPartnerBrowser(history), history);
});

test('tracks only submitted addresses as real back and forward history', () => {
  let history = createPartnerBrowserHistory();
  history = navigatePartnerBrowser(history, 'https://example.com/one');
  history = navigatePartnerBrowser(history, 'https://example.com/two');

  assert.equal(history.currentUrl, 'https://example.com/two');
  assert.equal(history.canGoBack, true);
  assert.equal(history.canGoForward, false);

  history = partnerBrowserBack(history);
  assert.equal(history.currentUrl, 'https://example.com/one');
  assert.equal(history.canGoBack, false);
  assert.equal(history.canGoForward, true);

  history = partnerBrowserForward(history);
  assert.equal(history.currentUrl, 'https://example.com/two');
});

test('new navigation truncates forward history and reload changes only frame revision', () => {
  let history = createPartnerBrowserHistory('https://example.com/one');
  history = navigatePartnerBrowser(history, 'https://example.com/two');
  history = partnerBrowserBack(history);
  history = navigatePartnerBrowser(history, 'https://example.com/three');

  assert.deepEqual(history.entries, ['https://example.com/one', 'https://example.com/three']);
  assert.equal(history.canGoForward, false);

  const reloaded = reloadPartnerBrowser(history);
  assert.equal(reloaded.currentUrl, history.currentUrl);
  assert.equal(reloaded.revision, history.revision + 1);
  assert.equal(
    navigatePartnerBrowser(history, history.currentUrl ?? '').revision,
    reloaded.revision,
  );
  assert.equal(navigatePartnerBrowser(history, 'javascript:alert(1)'), history);
});

test('synchronizes actual iframe navigation without duplicating the submitted address', () => {
  let history = createPartnerBrowserHistory('https://example.com/start');

  assert.equal(synchronizePartnerBrowserUrl(history, 'https://example.com/start'), history);
  history = synchronizePartnerBrowserUrl(history, 'https://example.com/final');
  assert.deepEqual(history.entries, ['https://example.com/start', 'https://example.com/final']);
  assert.equal(history.currentUrl, 'https://example.com/final');
  assert.equal(history.canGoBack, true);

  const unsafe = synchronizePartnerBrowserUrl(history, 'file:///etc/passwd');
  assert.equal(unsafe, history);
});
