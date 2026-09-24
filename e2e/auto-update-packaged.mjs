// Auto-update packaged E2E (Windows NSIS, F022) — 真安装包全链路验证。
//
// 验证链路（对"已安装应用"做真实更新，不 mock electron-updater）：
//   1. Setup-<V>.exe /S 静默安装基线版本（per-user，不弹 UI）
//   2. 本地起 generic feed：latest.yml 声称更高版本，文件指向真实 Setup exe
//   3. 改写已安装应用的 resources/app-update.yml → 指向本地 feed
//   4. Playwright 启动已安装应用 → 等 banner"已就绪"（check → download 全链路）
//   5. 点击"重启并安装" → quitAndInstall(true,true) /S 静默装 → NSIS --force-run 重启
//   6. 断言：应用退出、新进程从安装目录重启、诊断日志有 updater state_changed 链
//   7. 清理：杀进程（含 relaunch 的）、/S 卸载、停 feed、删隔离 profile
//
// 安全护栏：
//   - 机器上已有 KodaX Space 安装实例（默认目录或注册表卸载项）→ 直接 abort，绝不覆盖
//   - 启动/更新全程用 KODAX_TEST_ONBOARDING 隔离 profile，不触碰真实用户数据
//   - 需要 Space 已安装副本以外的正在运行实例时也 abort（单实例锁会抢 launch）
//
// 用法：先 `npm run build:win`，再 `node e2e/auto-update-packaged.mjs`
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { _electron as electron } from 'playwright';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(rootDir, process.env.SPACE_PACK_OUT_DIR || 'out');
const unpackedExe = path.join(outDir, 'win-unpacked', 'KodaX Space.exe');
const rootPackage = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
const spaceVersion = String(rootPackage.version ?? '');
const setupExe = path.join(outDir, `KodaX-Space-Setup-${spaceVersion}.exe`);
// feed 声称的"新版本"：patch 段 +1（semver 下必大于任何 0.1.46-* 预发布；字节用的
// 还是同一个 Setup exe）。不能附加 -e2e99 之类的后缀——预发布标识符按字典序比较，
// "e2e99" < "rc"，fake 版本反而更小，updater 会判定"无更新"。
const fakeFeedVersion = spaceVersion.replace(
  /^(\d+)\.(\d+)\.(\d+).*/,
  (_match, major, minor, patch) => `${major}.${minor}.${Number(patch) + 1}`,
);
const testId = `auto-update-${process.pid}-${Date.now()}`;
const profileDir = path.join(tmpdir(), `kodax-test-${testId}`);
const diagnosticsPath = path.join(
  profileDir,
  'space',
  'electron-user-data',
  'diagnostics',
  'space-main.jsonl',
);
const defaultInstallDir = path.join(
  process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? '', 'AppData', 'Local'),
  'Programs',
  'KodaX Space',
);
const uninstallRegistryPath =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(
    `timeout waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`,
  );
}

function runSync(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...options });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function listAppProcesses() {
  const script =
    `Get-CimInstance Win32_Process -Filter "Name='KodaX Space.exe'" | ` +
    `Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress`;
  const { stdout } = runSync('powershell', ['-NoProfile', '-Command', script]);
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout);
  return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => ({
    pid: Number(entry.ProcessId),
    path: String(entry.ExecutablePath ?? ''),
  }));
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function findExistingInstall() {
  if (existsSync(path.join(defaultInstallDir, 'KodaX Space.exe'))) return defaultInstallDir;
  const { stdout } = runSync('reg', ['query', uninstallRegistryPath, '/s', '/f', 'KodaX Space']);
  const match = stdout.match(/InstallLocation\s+REG_SZ\s+(.+)/);
  if (match) return match[1].trim();
  return null;
}

// 本地 generic feed：/latest.yml 声称 fakeFeedVersion，实体是真实 Setup exe
async function startFeedServer() {
  const exeName = path.basename(setupExe);
  const exeBytes = await stat(setupExe);
  const sha512 = createHash('sha512').update(await readFile(setupExe)).digest('base64');
  const latestYml =
    `version: ${fakeFeedVersion}\n` +
    `releaseDate: '${new Date().toISOString()}'\n` +
    `releaseName: 'e2e local feed'\n` +
    `files:\n` +
    `  - url: ${exeName}\n` +
    `    sha512: ${sha512}\n` +
    `    size: ${exeBytes.size}\n` +
    `path: ${exeName}\n` +
    `sha512: ${sha512}\n`;
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url ?? '');
    // electron-updater 带 ?noCache=... 查询参数，必须按 pathname 匹配
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname.endsWith('latest.yml')) {
      response.writeHead(200, { 'Content-Type': 'text/yaml', 'Cache-Control': 'no-cache' });
      response.end(latestYml);
      return;
    }
    if (pathname.includes(exeName)) {
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': exeBytes.size,
        'Cache-Control': 'no-cache',
      });
      createReadStreamSafe(setupExe, response);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('feed server has no port');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function createReadStreamSafe(filePath, response) {
  createReadStream(filePath)
    .on('error', () => response.destroy())
    .pipe(response);
}

function childTestEnv() {
  const env = { ...process.env, KODAX_TEST_ONBOARDING: testId, SPACE_TEST_BYPASS_COMPLETE_EXIT: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.KODAX_HOME;
  delete env.KODAX_PROFILE_DIR;
  return env;
}

async function readUpdaterDiagnostics() {
  try {
    const lines = (await readFile(diagnosticsPath, 'utf8')).split(/\r?\n/);
    return lines.filter((line) => line.includes('updater') && line.includes('state_changed'));
  } catch {
    return [];
  }
}

// ---- 主流程 ----

if (process.platform !== 'win32') throw new Error('this e2e drives the Windows NSIS flow only');
if (!existsSync(unpackedExe)) throw new Error(`win-unpacked missing, run npm run build:win: ${unpackedExe}`);
if (!existsSync(setupExe)) throw new Error(`setup installer missing, run npm run build:win: ${setupExe}`);

const running = listAppProcesses();
if (running.length > 0) {
  throw new Error(`KodaX Space is already running (pid ${running.map((p) => p.pid).join(', ')}); close it first`);
}
const existingInstall = findExistingInstall();
if (existingInstall) {
  throw new Error(
    `a KodaX Space install already exists at "${existingInstall}"; this e2e refuses to clobber it`,
  );
}

console.log(`[e2e] baseline silent install: ${setupExe}`);
const baseline = runSync(setupExe, ['/S'], { cwd: outDir });
if (baseline.status !== 0 && baseline.status !== null) {
  throw new Error(`Setup /S exited ${baseline.status}: ${baseline.stderr}`);
}
const installedExe = await waitFor(
  () => (existsSync(path.join(defaultInstallDir, 'KodaX Space.exe')) ? defaultInstallDir : null),
  180_000,
  'NSIS silent install to finish',
);
console.log(`[e2e] installed at ${installedExe}`);

const feed = await startFeedServer();
console.log(`[e2e] local feed at ${feed.url} claiming v${fakeFeedVersion}`);
const appUpdateYmlPath = path.join(installedExe, 'resources', 'app-update.yml');
await writeFile(appUpdateYmlPath, `provider: generic\nurl: ${feed.url}\n`);

let relaunchedPid = null;
let succeeded = false;
try {
  console.log('[e2e] launching installed app via playwright');
  const app = await electron.launch({
    executablePath: path.join(installedExe, 'KodaX Space.exe'),
    args: [],
    cwd: installedExe,
    env: childTestEnv(),
    timeout: 120_000,
  });
  const oldPid = app.process().pid;
  const window = await waitFor(
    () => app.windows().find((candidate) => candidate.url().startsWith('app://space/')),
    120_000,
    'installed application renderer',
  );
  await window.waitForLoadState('domcontentloaded');

  // check → available → downloading → ready；本地 feed 下载极快，直接等 ready 态 banner
  const banner = window
    .locator('[role="status"]')
    .filter({ hasText: /已就绪|ready/i })
    .first();
  try {
    await banner.waitFor({ state: 'visible', timeout: 180_000 });
  } catch (error) {
    // 失败取证：banner 实际内容 / feed 收到的请求 / 诊断日志，profile 留在现场不删
    console.error('[e2e] banner wait failed; dumping evidence');
    console.error('[e2e] feed requests:', JSON.stringify(feed.requests));
    for (const status of await window.locator('[role="status"]').all()) {
      try {
        console.error('[e2e] visible banner:', (await status.innerText()).replace(/\s+/g, ' '));
      } catch {
        // banner 可能刚好卸载，读不到就算了
      }
    }
    for (const line of await readUpdaterDiagnostics()) {
      console.error('[e2e] diag:', line.slice(0, 300));
    }
    await window
      .screenshot({ path: path.join(outDir, 'auto-update-e2e-failure.png') })
      .catch(() => null);
    throw error;
  }
  console.log('[e2e] update banner visible (state=ready)');
  console.log('[e2e] banner text:', (await banner.innerText()).replace(/\s+/g, ' '));
  const checksBeforeInstall = feed.requests.filter((url) => url.includes('latest.yml')).length;
  console.log(`[e2e] feed saw ${checksBeforeInstall} latest.yml request(s) before install click`);

  await window
    .locator('[role="status"]')
    .filter({ hasText: /已就绪|ready/i })
    .getByRole('button')
    .first()
    .click();
  console.log('[e2e] clicked Restart & install; expecting quit + silent install + relaunch');

  await waitFor(() => (isPidAlive(oldPid) ? null : true), 30_000, 'old app process to exit');
  console.log(`[e2e] old app (pid ${oldPid}) exited`);
  const relaunched = await waitFor(
    () =>
      listAppProcesses().find(
        (candidate) =>
          candidate.path.startsWith(installedExe) && candidate.pid !== oldPid,
      ) ?? null,
    150_000,
    'NSIS --force-run relaunch of the updated app',
  );
  relaunchedPid = relaunched.pid;
  console.log(`[e2e] relaunched pid ${relaunched.pid} from ${relaunched.path}`);

  // 更新安装器会用打包内置的 github feed 覆写 resources/app-update.yml——这本身
  // 就是"静默安装真实完成、资源被重写"的硬证据；relaunch 的实例此后走官方 feed，
  // 不会再请求本地 feed（断言按此设计）。
  const rewritten = await readFile(appUpdateYmlPath, 'utf8');
  if (rewritten.includes('127.0.0.1')) {
    throw new Error('app-update.yml still points at local feed; silent install did not rewrite resources');
  }
  console.log('[e2e] installer rewrote resources/app-update.yml (stock github feed restored)');
  const checkCount = feed.requests.filter((url) => url.includes('latest.yml')).length;
  console.log(`[e2e] feed saw ${checkCount} latest.yml request(s) total (boot check only)`);

  const diagnostics = await readUpdaterDiagnostics();
  console.log(`[e2e] updater diagnostics (${diagnostics.length} entries):`);
  for (const line of diagnostics.slice(-8)) console.log('       ', line.slice(0, 200));
  if (diagnostics.length === 0) throw new Error('no updater state_changed entries in diagnostics log');

  await app.close().catch(() => null);
  succeeded = true;
  console.log('[e2e] PASS: detect → download → silent install → relaunch all verified');
} catch (failure) {
  console.error(`[e2e] FAIL (profile kept for inspection: ${profileDir}):`, failure.message);
  process.exitCode = 1;
} finally {
  if (relaunchedPid !== null) {
    runSync('taskkill', ['/PID', String(relaunchedPid), '/T', '/F']);
  }
  await sleep(2_000);
  const uninstaller = path.join(installedExe, 'Uninstall KodaX Space.exe');
  if (existsSync(uninstaller)) {
    runSync(uninstaller, ['/S']);
    await waitFor(
      () => (existsSync(path.join(installedExe, 'KodaX Space.exe')) ? null : true),
      60_000,
      'NSIS uninstall to finish',
    );
    console.log('[e2e] uninstalled baseline copy');
  }
  await feed.close();
  if (succeeded) {
    await rm(profileDir, { recursive: true, force: true }).catch(() => null);
  }
}
