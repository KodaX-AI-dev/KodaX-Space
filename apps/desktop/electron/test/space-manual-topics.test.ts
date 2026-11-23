import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import {
  KODAX_UNDERLYING_CAPABILITY_TOPICS,
  MANUAL_REGISTRY,
  resolveKodaXManual,
} from '@kodax-ai/kodax/coding';
import { buildSpaceManual, SPACE_PRODUCT_NAME } from '../kodax/space-manual-topics.js';

const manifest = createRequire(import.meta.url)('../../../../package.json') as {
  readonly version: string;
};
const installedSdk = createRequire(import.meta.url)('@kodax-ai/kodax/package.json') as {
  version: string;
};
const sdkManual = buildSpaceManual({ KODAX_UNDERLYING_CAPABILITY_TOPICS, MANUAL_REGISTRY });
const SPACE_MANUAL_BASE_TOPICS = sdkManual.baseTopics;
const SPACE_MANUAL_TOPICS = sdkManual.topics;
const INHERITED = '## Inherited KodaX SDK mechanism';

function resolve(topic?: string) {
  return resolveKodaXManual(topic ? { topic } : {}, {
    productName: SPACE_PRODUCT_NAME,
    baseTopics: SPACE_MANUAL_BASE_TOPICS,
    extraTopics: SPACE_MANUAL_TOPICS,
  });
}

/** The Space-authored part of a topic, without the inherited SDK body. */
function own(id: string): string {
  return SPACE_MANUAL_TOPICS.find((topic) => topic.id === id)?.body.split(INHERITED)[0] ?? '';
}

test('Space manual topics have unique ids and resolvable nextTopics', () => {
  const ids = new Set(SPACE_MANUAL_TOPICS.map((topic) => topic.id));
  assert.equal(ids.size, SPACE_MANUAL_TOPICS.length, 'manual topic ids must be unique');
  for (const topic of SPACE_MANUAL_TOPICS) {
    for (const next of topic.nextTopics ?? []) {
      assert.ok(ids.has(next), `${topic.id} references missing next topic ${next}`);
    }
  }
});

test('Space kodax_manual preserves the installed SDK mechanism manual', () => {
  assert.deepEqual(SPACE_MANUAL_BASE_TOPICS, [...KODAX_UNDERLYING_CAPABILITY_TOPICS]);

  const overlays = new Map(SPACE_MANUAL_TOPICS.map((topic) => [topic.id, topic]));
  for (const id of KODAX_UNDERLYING_CAPABILITY_TOPICS) {
    const overlay = overlays.get(id);
    if (!overlay) continue;
    const sdkTopic = MANUAL_REGISTRY[id];
    assert.ok(overlay.body.includes(sdkTopic.body), `${id} must retain the SDK manual body`);
    for (const source of sdkTopic.sources) {
      assert.ok(
        overlay.sources?.some((c) => c.label === source.label && c.path === source.path),
        `${id} must retain SDK source ${source.path}`,
      );
    }
    for (const alias of sdkTopic.aliases ?? []) {
      assert.ok(overlay.aliases?.includes(alias), `${id} must retain SDK alias ${alias}`);
    }
  }

  const effectiveIds = new Set(resolve().topics.map((topic) => topic.id));
  for (const id of KODAX_UNDERLYING_CAPABILITY_TOPICS) {
    assert.ok(effectiveIds.has(id), `effective manual must retain SDK topic ${id}`);
  }
  for (const topic of SPACE_MANUAL_TOPICS) {
    assert.ok(effectiveIds.has(topic.id), `effective manual must include Space topic ${topic.id}`);
  }

  const config = resolve('config').content;
  assert.match(config, /~\/\.kodax\/integrations\/mcp\.json/);
  assert.match(config, /~\/\.kodax\/integrations\/a2a\.json/);
  assert.match(config, /~\/\.kodax\/integrations\/extensions\.json/);
  assert.match(config, /kodax integrations migrate --apply/);
});

test('the Space-authored manual is a current reference, not release history', () => {
  for (const topic of SPACE_MANUAL_TOPICS) {
    const body = own(topic.id);
    assert.doesNotMatch(
      `${topic.summary}\n${body}`.replace(
        `v${manifest.version} 发行依赖声明 KodaX ${installedSdk.version}`,
        '',
      ),
      /v0\.1\.\d+|\b0\.7\.\d+|beta\.\d+|alpha\.\d+|\bF1\d\d\b|FEATURE_\d+|Issues? \d+/,
      `${topic.id} narrates release history`,
    );
    for (const alias of topic.aliases ?? []) {
      assert.doesNotMatch(alias, /^v\d+\.\d+/, `${topic.id} has a version alias ${alias}`);
    }
  }
});

test('the manual states the declared Space and SDK versions and routes usage questions to space_manual', () => {
  assert.ok(own('runtime-host').includes(`v${manifest.version} 发行依赖声明 KodaX ${installedSdk.version}`));
  const selfManual = resolve('self-manual').content;
  assert.match(selfManual, /space_manual.*共享 Host/);
  assert.match(selfManual, /kodax_manual.*SDK\/CLI/);
});

test('the manual describes the shared Host, its startup retry and safe exit', () => {
  assert.match(own('runtime-host'), /共享 Host/);
  assert.match(own('runtime-host'), /30 秒、1、2、4 分钟/);
  assert.doesNotMatch(own('runtime-host'), /MCP 面板中的 server 进程/);
  assert.match(own('background-runtime'), /kodax daemon stop --timeout-ms 10000 --json/);
  assert.match(own('background-runtime'), /只取消当前 Space 自己发起的 Run/);
  assert.match(own('troubleshooting'), /重试启动/);
  assert.match(own('troubleshooting'), /不要删除锁文件/);
});

test('the manual describes current composer, permission and ask_user behavior', () => {
  assert.match(own('composer'), /取回消息/);
  assert.match(own('composer'), /GIF 取首帧/);
  assert.match(own('permissions'), /Auto\[LLM\]/);
  assert.match(own('permissions'), /-LiteralPath/);
  assert.match(own('permissions'), /unanswered/);
  assert.match(own('ui-map'), /1-9 快选/);
  assert.match(own('skills'), /allowed-tools 字段会被忽略/);
});

test('the manual describes RepoIntel auto as git tools with an opt-in semantic index', () => {
  const repo = own('repo-intelligence');
  assert.match(repo, /Git：默认 auto 模式.*repo_overview、changed_scope、changed_diff/);
  assert.match(repo, /repoIntelligenceMode 设为 full 或 light/);
  assert.match(own('tools'), /repoIntelligenceMode 设为 full 或 light/);
});

test('the manual locates providers, data roots and the terminal environment correctly', () => {
  assert.match(SPACE_MANUAL_TOPICS.find((t) => t.id === 'providers')?.summary ?? '', /模型与服务商/);
  assert.match(own('context-window-and-session-tokens'), /自动压缩阈值/);
  assert.match(own('config'), /\.kodax-copy-incomplete/);
  assert.match(own('config'), /内置终端不传入 KODAX_HOME/);
  assert.match(own('preview-terminal'), /KODAX_HOME）都不会传入/);
  assert.match(own('artifacts'), /host:<leaseId>:create_artifact/);
});

test('the SDK sandbox topic is served as shipped, without a Space overlay', () => {
  assert.equal(
    SPACE_MANUAL_TOPICS.some((topic) => topic.id === 'sandbox'),
    false,
  );
  assert.equal(resolve('sandbox').content.includes(MANUAL_REGISTRY.sandbox.body), true);
});
