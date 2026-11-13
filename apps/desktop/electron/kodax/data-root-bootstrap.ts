// 数据根引导 —— 必须是 main.ts 的**第一个** import。
//
// settings/store、projects/store、providers/config 等十余个模块在 import 时就把
// getSpaceDataDir()/getKodaxDir() 固化成模块级常量,getKodaxDir() 本身也有缓存;而 SDK 在首次
// 加载时冻结 <KODAX_HOME>/sessions。所以数据根必须在它们求值之前决定好,不能放在 main.ts
// 主体里。本模块只依赖 electron 与 data-paths/data-root(都不触碰 store),求值时:
//   1. 按 测试模式 > 设置项 > KODAX_HOME > 默认 解析数据根;
//   2. 设置项生效时强制覆盖 process.env.KODAX_HOME(不再"已设就尊重"),并留下标记,
//      让继承了这个环境的下一个 Space 进程能还原用户原本的值;
//   3. 调用 applySdkHomeEnv() 把 SDK 与 Space 对齐到同一个根,并转换已弃用的 KODAX_PROFILE_DIR。
// 结果保存在模块级,供启动对话框、诊断和设置页读取。

import { app } from 'electron';
import path from 'node:path';
import { applySdkHomeEnv } from './data-paths.js';
import {
  KODAX_HOME_OVERRIDE_ENV,
  kodaxHomeOverrideMark,
  resolveDataRoot,
  userKodaxHome,
  type ResolvedDataRoot,
} from './data-root.js';

/** 指针文件所在目录名固定,不随数据根、应用名或测试模式变化。 */
const POINTER_DIRECTORY_NAME = 'KodaX Space';
const POINTER_FILE_NAME = 'data-root.json';

export function getDataRootPointerFile(): string {
  return path.join(app.getPath('appData'), POINTER_DIRECTORY_NAME, POINTER_FILE_NAME);
}

// 先撤销上一个 Space 进程注入并经重启/更新/子进程继承下来的 KODAX_HOME,只看用户自己的值。
const userHome = userKodaxHome(process.env);
if (userHome === undefined) delete process.env.KODAX_HOME;
else process.env.KODAX_HOME = userHome;
delete process.env[KODAX_HOME_OVERRIDE_ENV];

const resolved: ResolvedDataRoot = resolveDataRoot({
  env: process.env,
  pointerFile: getDataRootPointerFile(),
});
if (resolved.source === 'setting' && resolved.settingRoot !== null) {
  process.env.KODAX_HOME = resolved.settingRoot;
}
const applied = applySdkHomeEnv();
if (resolved.source === 'setting' && process.env.KODAX_HOME !== undefined) {
  process.env[KODAX_HOME_OVERRIDE_ENV] = kodaxHomeOverrideMark(userHome, process.env.KODAX_HOME);
}

/** 本次启动的解析结果(设置页展示"来源/环境变量冲突"、启动对话框处理 problem 时使用)。 */
export function getResolvedDataRoot(): ResolvedDataRoot {
  return resolved;
}

/** 已弃用的 KODAX_PROFILE_DIR 值(有效且未被忽略时),供 main 记录告警。 */
export function getDeprecatedProfileDir(): string | null {
  return applied.deprecatedProfileDir;
}
