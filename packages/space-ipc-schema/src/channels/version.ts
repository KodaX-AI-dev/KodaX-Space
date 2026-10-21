// space.version — 内置自检 channel。FEATURE_001 用过简化版；FEATURE_002 转为完整定义。
//
// 用途：renderer 启动自检，以及连接变化/显式读取后的只读诊断刷新。验证：
// 1) preload 桥可用
// 2) IPC schema 派生的 allowlist 工作正常
// 3) zod parse 在 main 端真的执行（这里 input 是 void——给一个错误 payload 应该被 SCHEMA_INVALID 拒绝）

import { z } from 'zod';

export const spaceCapabilityStatusSchema = z.enum(['supported', 'partial', 'blocked', 'planned']);

export const spaceCapabilitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: spaceCapabilityStatusSchema,
  // Read-only diagnostic state, never an execution or entitlement decision.
  state: z.string().min(1).max(64).optional(),
  detail: z.string().min(1),
  since: z.string().min(1).optional(),
});

export const versionChannel = {
  name: 'space.version',
  direction: 'invoke',
  // 入参约定为 undefined（renderer 不传 payload）。
  // 用 z.undefined() 比 z.void() 在运行时校验上更严——后者会接受任何 undefined-coerced 值。
  input: z.undefined(),
  output: z.object({
    spaceVersion: z.string().min(1),
    nodeVersion: z.string().min(1),
    electronVersion: z.string().min(1),
    chromeVersion: z.string().min(1),
    platform: z.enum(['darwin', 'linux', 'win32']),
    kodaxSdkVersion: z.string().min(1),
    kodaxDependencySpec: z.string().min(1),
    capabilityContract: z.string().min(1),
    capabilities: z.array(spaceCapabilitySchema).min(1),
  }),
} as const;

export type SpaceCapabilityStatus = z.infer<typeof spaceCapabilityStatusSchema>;
export type SpaceCapability = z.infer<typeof spaceCapabilitySchema>;
export type SpaceVersionOutput = z.infer<typeof versionChannel.output>;
