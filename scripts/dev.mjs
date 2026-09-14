// Dev orchestrator:
//   1) 启动 Vite dev server (renderer)
//   2) esbuild watch main + preload
//   3) 等 Vite 就绪后 spawn electron 指向 dev server URL
//
// Ctrl+C 退出时清理子进程树（Windows 必须 taskkill /t — 否则 cmd.exe wrapper 被杀掉但
// 真正的 vite / esbuild node 子进程作为孤儿继续运行，持有终端 stdin 让 PowerShell 退回
// raw mode，backspace 显示成 ^H、Ctrl+C 显示成 ^C）。

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import waitOn from 'wait-on';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// 直接 spawn 真二进制用的解析路径（见 spawnProc 注释：不再经 `npm run -w` / `npx` 包装）。
//   - NODE         : 当前 node 可执行（跑 vite.js / build-main.mjs）
//   - VITE_BIN     : 提升到 root node_modules 的 vite CLI 入口
//   - ELECTRON_BIN : electron npm 包从 Node import 时导出的是二进制绝对路径（跨平台）
const NODE = process.execPath;
const ELECTRON_BIN = require('electron');
const APPS_DESKTOP = path.join(root, 'apps/desktop');

// vite 的 package.json `exports` 不暴露 ./bin/vite.js（require.resolve 直取会报
// ERR_PACKAGE_PATH_NOT_EXPORTED），改从 package.json 的 bin 字段解析；失败兜底到提升后的
// root node_modules 下的已知路径。
function resolveViteBin() {
  try {
    const pkgPath = require.resolve('vite/package.json');
    const pkg = require('vite/package.json');
    const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.vite;
    if (binRel) return path.join(path.dirname(pkgPath), binRel);
  } catch {
    /* fall through to known path */
  }
  return path.join(root, 'node_modules/vite/bin/vite.js');
}
const VITE_BIN = resolveViteBin();

const VITE_HOST = '127.0.0.1';
const VITE_PORT = Number.parseInt(process.env.KODAX_SPACE_DEV_PORT ?? '5173', 10);
if (!Number.isInteger(VITE_PORT) || VITE_PORT < 1 || VITE_PORT > 65_535) {
  console.error('[dev] KODAX_SPACE_DEV_PORT must be an integer between 1 and 65535.');
  process.exit(1);
}
const VITE_URL = `http://${VITE_HOST}:${VITE_PORT}`;
const procs = [];
let shuttingDown = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(cmd, args, label, env = {}) {
  console.log(`[dev] $ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(`${label} exited with code ${result.status}`);
  }
}

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

function spawnProc(name, cmd, args, env = {}, opts = {}) {
  // ELECTRON_RUN_AS_NODE=1 在外层 shell 出现时，electron 入口会退化成 Node 脚本，
  // require('electron') 仅返回二进制路径，window 永远不弹。强制在子进程剥掉。
  const baseEnv = { ...process.env };
  delete baseEnv.ELECTRON_RUN_AS_NODE;
  // **stdin 一律 'ignore'**（之前默认 'inherit' 是地雷）：
  //   - Electron child Windows ConPTY：'inherit' 会让 child 持有 parent stdin handle，
  //     console routing 诡异；KodaX 团队 probe 12 步验证与 SDK 无关，是 Electron+ConPTY quirk。
  //   - Vite / esbuild：'inherit' 让它们读 parent stdin → Vite 启用 readline raw-mode
  //     ("press h + enter" 交互)，dev.mjs 退出时若没 tree-kill，孤儿 vite 仍持 stdin，
  //     PowerShell 看到的就是 raw mode（backspace=^H、Ctrl+C=^C）。
  // 调用方仍可 opts.stdinMode='inherit' 显式覆盖（目前没人用到）。
  const stdinMode = opts.stdinMode ?? 'ignore';
  // **shell: false（关键）**：直接 spawn 真二进制（node / electron.exe），proc.pid 即真实进程。
  // 旧版 shell:true + `npm run -w` / `npx` 把进程链拉成 cmd→npm→cmd-shim→node 多层；退出时
  // taskkill /pid <最外层cmd> /t 一旦中间 shim 先退出断链就遍历不到底层 → vite/MCP 变孤儿残留
  // （用户实测 PID 残留）。直跑真二进制后链路扁平，taskkill /t 可靠杀整棵子树。
  const proc = spawn(cmd, args, {
    cwd: opts.cwd ?? root,
    stdio: [stdinMode, 'inherit', 'inherit'],
    shell: false,
    windowsHide: opts.windowsHide ?? true,
    env: { ...baseEnv, ...env },
  });
  proc.on('exit', (code) => {
    if (!shuttingDown) {
      console.log(`[dev] ${name} exited with code ${code}`);
      shutdown(code ?? 1);
    }
  });
  procs.push({ name, proc });
  return proc;
}

/**
 * Windows tree-kill via taskkill /t /f。
 * proc.kill() 只 SIGTERM cmd.exe wrapper，真正的 node/vite 子进程作为孤儿继续运行 →
 * 持有终端 stdin → PowerShell 退回 raw mode。taskkill /t 递归杀整棵进程树。
 */
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-pid, 'SIGTERM'); // POSIX: kill 进程组
    } catch {
      // 没分组就单杀
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* gone already */
      }
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { proc } of procs) {
    killTree(proc.pid);
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// (Removed: @livecanvas/* dev-junction self-heal. The LiveCanvas interactive
// artifact tier was extracted — see F067 — so there's no @livecanvas import to
// keep alive; dev no longer depends on LC being linked. The link:livecanvas
// helper scripts are likewise dead and pending removal.)

// A stale Vite process on the selected port makes wait-on succeed before this run's Vite has
// started. Electron then opens against the stale server and the new Vite exits
// with "Port 5173 is already in use", which presents as a blank window.
if (await isPortOpen(VITE_HOST, VITE_PORT)) {
  console.error(
    `[dev] ${VITE_URL} is already in use. Stop the stale dev server, then run npm run dev again.`,
  );
  console.error(
    `[dev] Windows helper: Get-NetTCPConnection -LocalPort ${VITE_PORT} | Select OwningProcess`,
  );
  process.exit(1);
}

// better-sqlite3 is a native addon. Running Node tests or npm rebuild can leave
// it compiled for plain Node, while Electron needs its own ABI. Check before
// opening the desktop window so artifact catalog load does not fail mid-run.
try {
  run(
    NODE,
    [path.join(root, 'scripts/ensure-sqlite-native.mjs'), 'electron'],
    'ensure better-sqlite3 electron ABI',
  );
} catch (err) {
  console.error('[dev] native dependency check failed:', err);
  process.exit(1);
}

// 1. Vite dev server —— 直接 node 跑 vite.js，cwd=apps/desktop（等价 `npm run dev -w
//    @kodax-space/desktop`，vite 从该 cwd 解析 vite.config）。去掉 npm 包装层，proc.pid 即 vite。
const viteProc = spawnProc(
  'vite',
  NODE,
  [VITE_BIN, '--host', VITE_HOST, '--port', String(VITE_PORT)],
  {},
  { cwd: APPS_DESKTOP },
);

// 2. esbuild watch —— 直接 node 跑 build-main。显式传 NODE_ENV=development，让 build-main 出带
//    sourcemap 的 dev 产物（build-main 默认 production，不靠外层 shell；dev 体验靠这里显式开启）。
spawnProc('esbuild', NODE, [path.join(root, 'scripts/build-main.mjs'), '--watch'], {
  NODE_ENV: 'development',
});

// 3. Electron when Vite AND main bundle are both ready.
// 之前用 setTimeout(1500) 等 esbuild 首轮产出——慢机器/CI 上不稳；改成
// 同步 wait 两个资源都就绪。`file:`/`http:` 两种 resource 类型由 wait-on 区分。
try {
  console.log(`[dev] waiting for ${VITE_URL} + dist-electron/main.js ...`);
  await waitOn({
    resources: [VITE_URL, `file:${path.join(root, 'dist-electron/main.js').replace(/\\/g, '/')}`],
    timeout: 60_000,
    interval: 200,
  });
  await sleep(500);
  if (viteProc.exitCode !== null || viteProc.signalCode !== null) {
    throw new Error('Vite dev server exited before Electron launch');
  }
  console.log('[dev] both ready, launching electron');

  spawnProc(
    'electron',
    ELECTRON_BIN,
    ['dist-electron'],
    {
      VITE_DEV_SERVER_URL: VITE_URL,
      NODE_ENV: 'development',
    },
    // stdinMode 默认就是 'ignore'，留参数显式可读
    { stdinMode: 'ignore', windowsHide: false },
  );
} catch (err) {
  console.error('[dev] failed:', err);
  shutdown(1);
}
