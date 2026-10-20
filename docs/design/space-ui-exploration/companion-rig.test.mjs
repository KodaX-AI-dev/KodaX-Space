import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from './companion-rig.js';

test('all thirteen actions keep finite, continuous poses within the stage', () => {
  assert.equal(Object.keys(ACTIONS).length, 13);
  for (const [name, action] of Object.entries(ACTIONS)) {
    let previous = action(0, 0);
    for (let frame = 1; frame <= 60 * 30; frame++) {
      const pose = action(frame / 60, frame / 60);
      for (const [key, value] of Object.entries(pose)) {
        assert.ok(Number.isFinite(value), `${name}.${key} must stay finite`);
        if (key.endsWith('X') || key.endsWith('Y')) {
          assert.ok(value >= 0 && value <= 256, `${name}.${key} leaves the stage`);
          assert.ok(Math.abs(value - previous[key]) < 5, `${name}.${key} jumps between frames`);
        }
      }
      assert.ok(pose.eyeOpen >= 0 && pose.eyeOpen <= 1);
      assert.ok(pose.shadow > 0 && pose.shadow <= 1);
      previous = pose;
    }
  }
});

test('complete and acknowledge settle into the same ongoing idle pose', () => {
  for (const time of [2.4, 2.401, 3, 5, 9]) {
    assert.deepEqual(ACTIONS.complete(time, time), ACTIONS.idle(time, time));
    assert.deepEqual(ACTIONS.acknowledge(time, time), ACTIONS.idle(time, time));
  }
  const before = ACTIONS.complete(2.4 - 1e-5, 2.4 - 1e-5);
  const after = ACTIONS.complete(2.4, 2.4);
  for (const key of Object.keys(after)) assert.ok(Math.abs(before[key] - after[key]) < 0.01, key);
});

test('each walking foot closes its cycle and has a grounded support phase', () => {
  const first = ACTIONS.walking(0, 0);
  const next = ACTIONS.walking(0.95, 0.95);
  for (const limb of ['foreNear', 'foreFar', 'hindNear', 'hindFar']) {
    for (const axis of ['X', 'Y'])
      assert.ok(Math.abs(first[limb + axis] - next[limb + axis]) < 1e-6);
    const floor = limb.endsWith('Near') ? 235 : 232;
    let contacts = 0;
    for (let frame = 0; frame < 120; frame++) {
      const y = ACTIONS.walking((frame / 120) * 0.95, 0)[limb + 'Y'];
      assert.ok(y <= floor && y >= floor - 14.001);
      if (Math.abs(y - floor) < 1e-6) contacts++;
    }
    assert.ok(contacts >= 70 && contacts <= 74, `${limb}: ${contacts} support samples`);
  }
});

test('thinking and walking return the body and limbs to their cycle start without a jump', () => {
  for (const [state, duration] of [
    ['thinking', 4.8],
    ['walking', 0.95],
  ]) {
    const first = ACTIONS[state](0, 0);
    const last = ACTIONS[state](duration, duration);
    for (const key of Object.keys(first)) {
      assert.ok(Math.abs(first[key] - last[key]) < 1e-6, `${state}.${key} has a loop seam`);
    }
  }
});
