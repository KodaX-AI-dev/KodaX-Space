// projectOrder persistence tests (拖排几何在 shell/sortPreview.test.ts).
//
// 直接 import store 测 setProjectOrder 行为 — 不挂 React,只跑 set/get。这是
// pure reducer 逻辑,不需要 renderer runtime。

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useAppStore } from '../../renderer/src/store/appStore.js';

// localStorage shim — node 没有 window;store 内部 lsGet/lsSet 会 fallthrough 到 try/catch
// 静默处理。这里不需要真持久化(每个 test 独立 setProjectOrder 即可)。

// 把 store 重置到 known state — 不重建 store (zustand 模块级单例),只设需要的字段。
function resetStore(order: readonly string[]): void {
  useAppStore.setState({ projectOrder: order });
}

beforeEach(() => {
  resetStore([]);
});

test('setProjectOrder replaces the order with the visible order', () => {
  resetStore(['/a', '/b']);
  useAppStore.getState().setProjectOrder(['/c', '/a', '/b']);
  assert.deepEqual(useAppStore.getState().projectOrder, ['/c', '/a', '/b']);
});

test('setProjectOrder caps at the persisted read limit', () => {
  const many = Array.from({ length: 300 }, (_, i) => `/p${i}`);
  useAppStore.getState().setProjectOrder(many);
  assert.equal(useAppStore.getState().projectOrder.length, 256);
});
