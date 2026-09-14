import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INVOKE_CHANNEL_NAMES,
  PUSH_CHANNEL_NAMES,
  invokeChannels,
  pushChannels,
} from '../index.js';
import {
  PARTNER_BROWSER_FRAME_NAME_PREFIX,
  PARTNER_BROWSER_MAX_URL_LENGTH,
  partnerBrowserNavigatedChannel,
  windowSetBadgeCountChannel,
} from './window.js';

test('window.setBadgeCount is registered with a bounded integer count', () => {
  assert.equal(invokeChannels['window.setBadgeCount'], windowSetBadgeCountChannel);
  assert.ok(INVOKE_CHANNEL_NAMES.has('window.setBadgeCount'));
  assert.equal(windowSetBadgeCountChannel.input.safeParse({ count: 0 }).success, true);
  assert.equal(windowSetBadgeCountChannel.input.safeParse({ count: 9999 }).success, true);

  for (const count of [-1, 1.5, 10_000, Number.NaN]) {
    assert.equal(windowSetBadgeCountChannel.input.safeParse({ count }).success, false);
  }
  assert.equal(
    windowSetBadgeCountChannel.input.safeParse({ count: 1, image: 'renderer-controlled' }).success,
    false,
  );
  assert.equal(windowSetBadgeCountChannel.output.safeParse({ applied: true }).success, true);
  assert.equal(windowSetBadgeCountChannel.output.safeParse({ applied: 'yes' }).success, false);
});

test('partner browser navigation push is registered and accepts only named safe HTTP(S) frames', () => {
  assert.equal(pushChannels['partner.browserNavigated'], partnerBrowserNavigatedChannel);
  assert.ok(PUSH_CHANNEL_NAMES.has('partner.browserNavigated'));
  assert.equal(
    partnerBrowserNavigatedChannel.payload.safeParse({
      frameName: `${PARTNER_BROWSER_FRAME_NAME_PREFIX}4ef27e2f`,
      url: 'https://example.com/final#section',
    }).success,
    true,
  );
  assert.equal(
    partnerBrowserNavigatedChannel.payload.safeParse({
      frameName: `${PARTNER_BROWSER_FRAME_NAME_PREFIX}4ef27e2f`,
      url: `https://example.com/${'a'.repeat(PARTNER_BROWSER_MAX_URL_LENGTH)}`,
    }).success,
    false,
  );

  for (const payload of [
    { frameName: 'other-frame', url: 'https://example.com' },
    {
      frameName: `${PARTNER_BROWSER_FRAME_NAME_PREFIX}4ef27e2f`,
      url: 'https://user:secret@example.com',
    },
    {
      frameName: `${PARTNER_BROWSER_FRAME_NAME_PREFIX}4ef27e2f`,
      url: 'file:///etc/passwd',
    },
  ]) {
    assert.equal(partnerBrowserNavigatedChannel.payload.safeParse(payload).success, false);
  }
});
