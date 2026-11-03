// Provider IPC handlers — FEATURE_004
//
// 7 个 invoke channel：
//   provider.list           列出 built-in + custom providers + configured 状态
//   provider.setKey         写 key（main → SDK auth.json；renderer 永不持有 key）
//   provider.removeKey      删 key
//   provider.test           HTTP probe 测连接
//   provider.setDefault     设默认 provider
//   provider.addCustom      新增自定义 provider
//   provider.removeCustom   删自定义 provider
//
// 安全约束：
//   - API key 只走 setKey 流向 main，绝不通过 list / 任何 push 回 renderer
//   - error envelope 内的错误字段已由 register.ts 兜底脱敏（不打原始 Error 对象）
//     这里再额外保证：handler 自己写的 error message 不含 key 值

import { registerChannel } from './register.js';
import {
  loadKodaxCustomProviders,
  loadKodaxCompactionConfig,
  registerKodaxCustomProviders,
  removeKodaxConfigCustomProvider,
  updateKodaxConfigCustomProvider,
} from '../kodax/user-config.js';
import {
  BUILTIN_PROVIDERS,
  isBuiltinId,
  getBuiltin,
  type BuiltinProvider,
} from '../providers/catalog.js';
import { providerConfigStore, type CustomProvider } from '../providers/config.js';
import {
  setKey,
  deleteKey,
  getKey,
  listConfiguredAccounts,
  getBackendStatus,
  describeProviderCredential,
  moveProviderCredential,
  assertProviderCredentialState,
  removeProviderWithCredentials,
  shareProviderCredential,
  useProviderEnvironment,
  retryProviderCredential,
} from '../providers/provider-storage.js';
import { testProvider } from '../providers/test-connection.js';
import { validateBaseUrl } from '../providers/url-guard.js';
import { validateApiKeyEnv } from '../providers/env-guard.js';
import { computeModelContextWindow } from '../providers/context-window.js';
import type { ProviderInfo } from '@kodax-space/space-ipc-schema';
import type { CustomProviderProbe } from '../providers/test-connection.js';
import { refreshDiagnosticRedactionOptions } from '../diagnostics/runtime.js';
import { runtimeHostAdapter } from '../kodax/runtime-host-adapter.js';
import { projectReasoningProfile } from '../kodax/reasoning-effort.js';
import {
  addSpaceCustomProvider,
  customProviderMutationQueue,
  removeSpaceCustomProvider,
  updateSpaceCustomProvider,
} from '../providers/custom-provider-mutations.js';
import { restoreManagedProviderEnvs } from '../providers/managed-env.js';
import {
  ensureProviderKeyInjected,
  listKnownProviderIds,
  providerCredentialSource,
  readProviderCredential,
  setManagedProviderCredentialEnv,
} from '../providers/credentials.js';

export { ensureProviderKeyInjected, listKnownProviderIds, readProviderCredential };

type KnownProvider = BuiltinProvider | CustomProvider | CustomProviderProbe;
type ConfiguredSource = ProviderInfo['configuredSource'];

let injectAllKeysToEnvQueue: Promise<void> = Promise.resolve();
async function reloadCoderConfigBestEffort(context: string): Promise<void> {
  if (!runtimeHostAdapter.isRuntimeSelected()) return;
  await runtimeHostAdapter.reloadRuntimeConfig().catch((error) => {
    console.warn(
      `[${context}] Coder daemon config reload failed:`,
      error instanceof Error ? error.message : error,
    );
  });
}

export function _credentialSourceForTesting(
  providerId: string,
  apiKeyEnv: string,
  keychainAccounts: ReadonlySet<string>,
): ConfiguredSource {
  return providerCredentialSource(providerId, apiKeyEnv, keychainAccounts);
}

export function _setManagedEnvForTesting(apiKeyEnv: string, value: string): void {
  setManagedEnv(apiKeyEnv, value);
}

export function _restoreManagedEnvsForTesting(): void {
  restoreManagedProviderEnvs();
}

function setManagedEnv(apiKeyEnv: string, value: string): void {
  setManagedProviderCredentialEnv(apiKeyEnv, value);
}

/** 校验 apiKey 不含会破坏 HTTP header 的字符（review C2-sec：CRLF injection）。*/
function validateApiKey(key: string): string | null {
  // \r \n \0 都会让 fetch undici 的 header serializer 抛错或（在老 runtime 上）
  // 注入额外 header。明确禁止，给 UI 一个清楚的报错而不是依赖 fetch 报错
  if (/[\r\n\0]/.test(key)) {
    return 'API key cannot contain CR, LF, or NUL bytes';
  }
  return null;
}

/** Compatibility name: restore previously managed env values and initialize file storage.
 * New secrets are resolved by the Main broker, never injected into process.env.
 */
export function injectAllKeysToEnv(): Promise<void> {
  const next = injectAllKeysToEnvQueue
    .then(injectAllKeysToEnvUnlocked, injectAllKeysToEnvUnlocked)
    .finally(refreshDiagnosticRedactionOptions);
  injectAllKeysToEnvQueue = next.catch(() => undefined);
  return next;
}

async function injectAllKeysToEnvUnlocked(): Promise<void> {
  restoreManagedProviderEnvs();
  await getBackendStatus();
}

async function resolveKnownProvider(id: string): Promise<KnownProvider | undefined> {
  if (isBuiltinId(id)) return getBuiltin(id);
  await providerConfigStore.load();
  const custom = providerConfigStore.getCustom(id);
  if (custom) return custom;
  return (await loadKodaxCustomProviders()).find((p) => p.id === id);
}

async function refreshSdkCustomProviderRegistry(): Promise<void> {
  await providerConfigStore.load();
  await registerKodaxCustomProviders(providerConfigStore.listCustom(), { force: true });
}

export function registerProviderChannels(): void {
  // provider.list
  registerChannel('provider.list', async () => {
    await providerConfigStore.load();
    const keychainAccounts = new Set(await listConfiguredAccounts(await listKnownProviderIds()));
    const defaultId = providerConfigStore.getDefaultProviderId();

    // v0.1.6：configured 同时认两种来源——
    //   1) Space keychain 里存了 key (写时同时注入 process.env[apiKeyEnv])
    //   2) Space 启动前 shell 已经 export 了 apiKeyEnv (用户本地直接配 env，不走 Space 设置)
    // 之前只看 keychain，导致用户在 shell export 过 KIMI_API_KEY/ARK_API_KEY 等的 provider
    // 显示成 not configured，UI 让人困惑。
    const list: ProviderInfo[] = [];
    const seenProviderIds = new Set<string>();

    // catalog 模块顶层已经从 SDK JSON 单一事实源 load 完整 provider 数据 ——
    // BuiltinProvider 的 apiKeyEnv / defaultModel / models 就是 SDK 的真相，
    // 不再需要每次 provider.list 调用时二次 dynamic-import SDK 取值。
    for (const b of BUILTIN_PROVIDERS) {
      const source = providerCredentialSource(b.id, b.apiKeyEnv, keychainAccounts);
      seenProviderIds.add(b.id);
      list.push({
        id: b.id,
        displayName: b.displayName,
        apiKeyEnv: b.apiKeyEnv,
        protocol: b.protocol,
        defaultModel: b.defaultModel,
        models: b.models ? [...b.models] : undefined,
        configured: source !== 'none',
        configuredSource: source,
        isDefault: defaultId === b.id,
        isCustom: false,
      });
    }
    for (const c of providerConfigStore.listCustom()) {
      const source = providerCredentialSource(c.id, c.apiKeyEnv, keychainAccounts);
      seenProviderIds.add(c.id);
      list.push({
        id: c.id,
        displayName: c.displayName,
        apiKeyEnv: c.apiKeyEnv,
        protocol: c.protocol,
        defaultModel: c.defaultModel,
        models: c.models ? [...c.models] : undefined,
        configured: source !== 'none',
        configuredSource: source,
        isDefault: defaultId === c.id,
        isCustom: true,
        baseUrl: c.baseUrl,
        skipBaseUrlValidation: c.skipBaseUrlValidation,
        ...(c.promptCacheAffinity === true ? { promptCacheAffinity: true } : {}),
        ...(c.imageInput === true ? { imageInput: true } : {}),
        ...(c.contextWindow !== undefined ? { contextWindow: c.contextWindow } : {}),
        ...(c.reasoning !== undefined ? { reasoning: c.reasoning } : {}),
      });
    }
    for (const c of await loadKodaxCustomProviders()) {
      if (seenProviderIds.has(c.id)) continue;
      const source = providerCredentialSource(c.id, c.apiKeyEnv, keychainAccounts);
      seenProviderIds.add(c.id);
      list.push({
        id: c.id,
        displayName: c.displayName,
        apiKeyEnv: c.apiKeyEnv,
        protocol: c.protocol,
        defaultModel: c.defaultModel,
        models: c.models ? [...c.models] : undefined,
        configured: source !== 'none',
        configuredSource: source,
        isDefault: defaultId === c.id,
        isCustom: true,
        baseUrl: c.baseUrl,
        skipBaseUrlValidation: c.skipBaseUrlValidation,
        ...(c.promptCacheAffinity === true ? { promptCacheAffinity: true } : {}),
        ...(c.imageInput === true ? { imageInput: true } : {}),
        ...(c.contextWindow !== undefined ? { contextWindow: c.contextWindow } : {}),
        ...(c.reasoning !== undefined ? { reasoning: c.reasoning } : {}),
      });
    }

    const detailed = await Promise.all(
      list.map(async (p) => {
        const credentialState = await describeProviderCredential(p.id);
        if (
          ['connection-changed', 'source-required', 'unavailable'].includes(
            credentialState.migration,
          ) &&
          !credentialState.authentication
        ) {
          return { ...p, credentialState, configured: false, configuredSource: 'none' as const };
        }
        const environment = credentialState.environmentAvailable === true;
        const source: ProviderInfo['configuredSource'] =
          credentialState.authentication ??
          (credentialState.configured || credentialState.migration === 'pending'
            ? environment
              ? 'both'
              : 'file'
            : environment &&
                (credentialState.origin === 'env' || credentialState.origin === undefined)
              ? 'env'
              : credentialState.origin === undefined && p.configuredSource === 'runtime'
                ? 'runtime'
                : 'none');
        return {
          ...p,
          credentialState,
          configured: credentialState.authentication
            ? credentialState.authenticationConfigured === true
            : source !== 'none',
          configuredSource: source,
        };
      }),
    );
    const effectiveDefaultId =
      defaultId && detailed.some((p) => p.id === defaultId && p.configured) ? defaultId : null;
    const providers = detailed.map((p) => ({ ...p, isDefault: p.id === effectiveDefaultId }));
    const keychainBackend = await getBackendStatus();
    return { providers, defaultProviderId: effectiveDefaultId, keychainBackend };
  });

  // provider.setKey — renderer 把 key 推给 main 后立即写 keychain + 注入 env
  registerChannel('provider.setKey', async (input) => {
    if (!(await resolveKnownProvider(input.providerId))) {
      // 未知 provider — 拒绝（防 LLM 诱导写 key 到任意 account 名占用 keychain 空间）
      throw new Error('unknown providerId');
    }
    // C2-sec：拒绝含 CRLF/NUL 的 key
    const keyErr = validateApiKey(input.apiKey);
    if (keyErr) throw new Error(keyErr);

    await setKey(input.providerId, input.apiKey, input.expected);
    await injectAllKeysToEnv();
    return { ok: true };
  });

  // provider.removeKey
  registerChannel('provider.removeKey', async (input) => {
    const removed = await deleteKey(input.providerId, input.expected);
    // 重新跑一遍全量注入——如果该 provider 跟其他共享 apiKeyEnv，
    // 删它的 key 之后那个 env 应回到另一个共享者的值（或被默认 provider 覆盖）
    await injectAllKeysToEnv();
    return { ok: removed };
  });

  registerChannel('provider.shareKey', async (input) => {
    if (!(await resolveKnownProvider(input.providerId))) throw new Error('unknown providerId');
    await shareProviderCredential(input.providerId, input.expected, input.mode);
    await injectAllKeysToEnv();
    return { ok: true };
  });
  registerChannel('provider.retryCredential', async (input) => {
    if (!(await resolveKnownProvider(input.providerId))) throw new Error('unknown providerId');
    await retryProviderCredential(input.providerId, input.expected);
    return { ok: true };
  });
  registerChannel('provider.useEnvironment', async (input) => {
    if (!(await resolveKnownProvider(input.providerId))) throw new Error('unknown providerId');
    await useProviderEnvironment(input.providerId, input.expected);
    return { ok: true };
  });

  // provider.test
  registerChannel('provider.test', async (input) => {
    const probe = await resolveKnownProvider(input.providerId);
    if (!probe) {
      return { ok: false, error: 'unknown provider' };
    }
    // testProvider binds an exact keychain credential without mutating process.env.
    // The Provider instance owns the authoritative unconfigured/network result.
    return testProvider(probe, { timeoutMs: 8000 });
  });

  // provider.setDefault
  registerChannel('provider.setDefault', async (input) => {
    const provider = await resolveKnownProvider(input.providerId);
    if (!provider) {
      throw new Error('unknown providerId');
    }
    const configured = await ensureProviderKeyInjected(input.providerId);
    if (!configured) {
      throw new Error('provider is not configured; add an API key before setting it as default');
    }
    await providerConfigStore.setDefault(input.providerId);
    // 切默认 provider 时重新注入——共享 env 时让它胜出
    await injectAllKeysToEnv();
    // The durable default and process environment are already updated. A daemon config reload
    // is best-effort and can wait for a cold Runtime; do not keep a completed picker selection
    // pending on that background synchronization.
    void reloadCoderConfigBestEffort('provider.setDefault');
    return { ok: true };
  });

  // provider.addCustom
  //
  // 三道校验门：
  //   1) baseUrl 必须是 https://、不是 IP literal、hostname 不在内网黑名单（C1-sec SSRF）
  //   2) apiKeyEnv 是合法的 env var 名 + 不在 reserved blocklist（H2-sec NODE_OPTIONS 注入）
  //   3) displayName / defaultModel 由 schema 已经限了长度
  registerChannel('provider.addCustom', (input) =>
    customProviderMutationQueue.run(async () => {
      const urlCheck = validateBaseUrl(input.baseUrl, {
        skipValidation: input.skipBaseUrlValidation === true,
      });
      if (!urlCheck.ok || !urlCheck.normalizedUrl) {
        throw new Error(`baseUrl rejected: ${urlCheck.error}`);
      }
      const envErr = validateApiKeyEnv(input.apiKeyEnv);
      if (envErr) throw new Error(envErr);

      const id = await addSpaceCustomProvider({
        displayName: input.displayName,
        protocol: input.protocol,
        baseUrl: urlCheck.normalizedUrl,
        skipBaseUrlValidation: input.skipBaseUrlValidation === true ? true : undefined,
        apiKeyEnv: input.apiKeyEnv,
        defaultModel: input.defaultModel,
        models: input.models,
        ...(input.promptCacheAffinity === true ? { promptCacheAffinity: true } : {}),
        ...(input.imageInput === true ? { imageInput: true } : {}),
        ...(input.contextWindow !== undefined ? { contextWindow: input.contextWindow } : {}),
        ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
      });

      await refreshSdkCustomProviderRegistry();
      return { ok: true, providerId: id, credentialState: await describeProviderCredential(id) };
    }),
  );

  // provider.updateCustom
  registerChannel('provider.updateCustom', (input) =>
    customProviderMutationQueue.run(async () => {
      await providerConfigStore.load();
      const beforeCredential = await assertProviderCredentialState(
        input.providerId,
        input.expectedCredential,
      );
      let movedCredential: Awaited<ReturnType<typeof moveProviderCredential>>;

      const urlCheck = validateBaseUrl(input.baseUrl, {
        skipValidation: input.skipBaseUrlValidation === true,
      });
      if (!urlCheck.ok || !urlCheck.normalizedUrl) {
        throw new Error(`baseUrl rejected: ${urlCheck.error}`);
      }
      const envErr = validateApiKeyEnv(input.apiKeyEnv);
      if (envErr) throw new Error(envErr);

      const update = {
        displayName: input.displayName,
        protocol: input.protocol,
        baseUrl: urlCheck.normalizedUrl,
        skipBaseUrlValidation: input.skipBaseUrlValidation === true ? true : undefined,
        apiKeyEnv: input.apiKeyEnv,
        defaultModel: input.defaultModel,
        models: input.models,
        ...(input.promptCacheAffinity === true ? { promptCacheAffinity: true } : {}),
        ...(input.imageInput === true ? { imageInput: true } : {}),
        ...(input.contextWindow !== undefined ? { contextWindow: input.contextWindow } : {}),
        ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
      };

      let nextProviderId = input.providerId;
      if (providerConfigStore.getCustom(input.providerId)) {
        const updated = await updateSpaceCustomProvider(input.providerId, update);
        if (!updated) {
          throw new Error('unknown writable custom providerId');
        }
      } else {
        const nextProviderIdCandidate = input.displayName.trim();
        if (nextProviderIdCandidate !== input.providerId) {
          if (isBuiltinId(nextProviderIdCandidate)) {
            throw new Error(
              `custom providerId conflicts with built-in provider: ${nextProviderIdCandidate}`,
            );
          }
          if (providerConfigStore.getCustom(nextProviderIdCandidate)) {
            throw new Error(
              `custom providerId conflicts with an existing Space provider: ${nextProviderIdCandidate}`,
            );
          }
          const collidingConfigProvider = (await loadKodaxCustomProviders()).some(
            (provider) =>
              provider.id === nextProviderIdCandidate && provider.id !== input.providerId,
          );
          if (collidingConfigProvider) {
            throw new Error(
              `custom providerId conflicts with an existing KodaX config provider: ${nextProviderIdCandidate}`,
            );
          }
        }

        const existingKey =
          nextProviderIdCandidate !== input.providerId ? await getKey(input.providerId) : undefined;
        const previousCredential =
          existingKey || beforeCredential.origin === 'env'
            ? await describeProviderCredential(input.providerId)
            : undefined;

        const updated = await updateKodaxConfigCustomProvider(
          input.providerId,
          update,
          previousCredential
            ? async (name) => {
                movedCredential = await moveProviderCredential(name, previousCredential);
              }
            : undefined,
        );
        if (!updated.updated) throw new Error('unknown writable custom providerId');
        nextProviderId = updated.providerId;
        if (nextProviderId !== input.providerId) {
          if (providerConfigStore.getDefaultProviderId() === input.providerId) {
            await providerConfigStore.setDefault(nextProviderId);
          }
        }
      }

      await refreshSdkCustomProviderRegistry();
      await injectAllKeysToEnv();
      await reloadCoderConfigBestEffort('provider.updateCustom');
      const afterCredential = await describeProviderCredential(nextProviderId);
      const sameConnection =
        beforeCredential.binding.connectionFingerprint ===
        afterCredential.binding.connectionFingerprint;
      const credentialState = movedCredential ?? {
        ...afterCredential,
        revision: sameConnection ? beforeCredential.revision : null,
        configured: sameConnection && beforeCredential.configured,
      };
      return { ok: true, providerId: nextProviderId, credentialState };
    }),
  );
  // provider.removeCustom
  registerChannel('provider.removeCustom', (input) =>
    customProviderMutationQueue.run(async () => {
      await providerConfigStore.load();
      const removed = await removeProviderWithCredentials(
        input.providerId,
        input.expected,
        async () => {
          let removed = false;

          if (providerConfigStore.getCustom(input.providerId)) {
            removed = await removeSpaceCustomProvider(input.providerId);
          } else {
            removed = await removeKodaxConfigCustomProvider(input.providerId);
            if (removed && providerConfigStore.getDefaultProviderId() === input.providerId) {
              await providerConfigStore.clearDefault();
            }
          }

          return removed;
        },
      );

      if (removed) {
        // 删 custom 时同步删 keychain 中的 key

        await injectAllKeysToEnv();
        if (input.providerId !== 'mock' && !isBuiltinId(input.providerId)) {
          await refreshSdkCustomProviderRegistry();
        }
        await reloadCoderConfigBestEffort('provider.removeCustom');
      }
      return { ok: removed };
    }),
  );
  // provider.modelContextWindow — SDK-driven 上下文窗口查询
  //
  // 替代之前 renderer 端 modelContextCaps.ts 的硬编码表。SDK runtime 用 resolveContextWindow
  // 决定真正的 compaction 触发窗口；UI 用同一函数 = single source of truth.
  //
  // Custom provider (`custom_*` id) 不进 SDK resolveProvider — 走 catalog hardcoded fallback
  // 或者 200k 默认（SDK 的 hard fallback 也是 200k）。
  //
  // Lazy SDK import — main bundle 是 CJS，SDK 是 ESM-only subpath；必须 `await import`
  // 否则撞 ERR_PACKAGE_PATH_NOT_EXPORTED（同 sdk-providers.ts 的处理）。
  registerChannel('provider.modelContextWindow', async (input) => {
    const configuredCompaction = await loadKodaxCompactionConfig();
    const compaction = {
      enabled: configuredCompaction?.enabled ?? true,
      triggerPercent: configuredCompaction?.triggerPercent ?? 75,
      ...(configuredCompaction?.triggerTokens
        ? { triggerTokens: configuredCompaction.triggerTokens }
        : {}),
      ...(configuredCompaction?.contextWindow !== undefined
        ? { contextWindow: configuredCompaction.contextWindow }
        : {}),
    };
    try {
      if (input.providerId !== 'mock' && !isBuiltinId(input.providerId)) {
        await refreshSdkCustomProviderRegistry();
      }
      const [
        { resolveProvider },
        { calculateMaxContextInputTokens, resolveCompactionPolicy, resolveContextWindow },
        { resolveModelCapabilities },
      ] = await Promise.all([
        import('@kodax-ai/kodax/coding'),
        import('@kodax-ai/kodax/agent'),
        import('@kodax-ai/kodax/llm'),
      ]);
      const provider = resolveProvider(input.providerId);
      const capabilities = resolveModelCapabilities(input.providerId, input.model);
      // 上下文窗口走 SDK runtime-authoritative 级联（= runtime 决定 compaction 触发的同一算法），
      // 而非 resolveModelCapabilities().contextWindow（0.7.58 default-model bug 会返回 200k）。
      // 逻辑 + 回归守卫见 providers/context-window.ts / context-window.test.ts。
      const { contextWindow: cw, source } = computeModelContextWindow(
        provider as { getEffectiveContextWindow?: unknown; getContextWindow?: unknown },
        input.model,
        resolveContextWindow,
        compaction,
      );
      const reservedResponseTokens =
        (
          provider as { getEffectiveMaxOutputTokens?: (model?: string) => number }
        ).getEffectiveMaxOutputTokens?.(input.model) ?? 0;
      const effectiveTriggerTokens = Math.max(
        1,
        resolveCompactionPolicy(
          compaction,
          cw,
          calculateMaxContextInputTokens(cw, reservedResponseTokens),
        ).triggerTokens,
      );
      // Reasoning 效力档同理走 provider.getReasoningProfile(model)（走 model 级 descriptor,
      // 不受 0.7.58 default-model bug 影响）；capabilities.reasoningProfile 仅作 provider 无此
      // 方法时的兜底。今天两处数据碰巧一致,但 default model 的 reasoningProfile 迟早会与
      // provider 级快照分叉(与 contextWindow 同一类漂移),锚定 model 级 resolver 才稳。
      type ReasoningProfileT = NonNullable<typeof capabilities>['reasoningProfile'];
      const providerReasoningProfile = (
        provider as { getReasoningProfile?: (model: string) => ReasoningProfileT }
      ).getReasoningProfile?.(input.model);
      const reasoningProfile = providerReasoningProfile ?? capabilities?.reasoningProfile;
      const reasoning = projectReasoningProfile(reasoningProfile);
      const multimodalSupport = (await import('../providers/model-images.js')).modelImageSupport(
        capabilities,
        provider.getCapabilityProfile(input.model),
      );
      return {
        contextWindow: cw,
        source,
        compactionTriggerPercent: compaction.triggerPercent,
        ...(compaction.triggerTokens ? { compactionTriggerTokens: compaction.triggerTokens } : {}),
        compactionEffectiveTriggerTokens: effectiveTriggerTokens,
        ...(reasoning.supportedEfforts ? { supportedEfforts: reasoning.supportedEfforts } : {}),
        ...(reasoning.defaultEffort ? { defaultEffort: reasoning.defaultEffort } : {}),
        canDisableThinking: reasoning.canDisableThinking,
        ...(multimodalSupport !== undefined ? { multimodalSupport } : {}),
      };
    } catch (err) {
      // resolveProvider 不识别 custom_* id 时会 throw — 报 fallback 200k 让 UI 渲染
      // 而不是阻断。renderer 自己的 modelContextCaps.ts 还能作为二级 fallback (从 SDK 升上
      // 来期间).
      console.warn(
        `[provider.modelContextWindow] SDK resolve failed for ${input.providerId}/${input.model}:`,
        err instanceof Error ? err.message : err,
      );
      return {
        contextWindow: compaction.contextWindow ?? 200_000,
        source: compaction.contextWindow !== undefined ? 'provider' : 'fallback',
        compactionTriggerPercent: compaction.triggerPercent,
        ...(compaction.triggerTokens ? { compactionTriggerTokens: compaction.triggerTokens } : {}),
      };
    }
  });
}
