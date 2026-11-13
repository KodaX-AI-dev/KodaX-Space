// 复制数据根期间的进度小窗。Space 的主窗口此时已因安全退出而隐藏,没有它用户会看到
// 一段长时间"什么都没发生"。窗口只加载内联页面,页面不访问 IPC 或网络。

import { BrowserWindow } from 'electron';
import type { DataRootCopyProgress } from '../kodax/data-root-change.js';

export interface DataRootProgressWindow {
  update(progress: DataRootCopyProgress): void;
  close(): void;
}

const COPY = {
  'zh-CN': { title: '正在复制数据', hint: '请勿关闭,完成后 Space 会自动重新打开。' },
  en: { title: 'Copying data', hint: 'Please wait. Space will reopen when this finishes.' },
} as const;

function pageHtml(locale: 'zh-CN' | 'en'): string {
  const text = COPY[locale];
  return `<!doctype html><meta charset="utf-8"><title>${text.title}</title>
<body style="font:14px system-ui,sans-serif;margin:20px;color:#222">
<div style="font-weight:600;margin-bottom:10px">${text.title}</div>
<progress id="p" max="100" value="0" style="width:100%"></progress>
<div id="t" style="margin:8px 0;color:#555"></div>
<div style="color:#777;font-size:12px">${text.hint}</div></body>`;
}

const mebibytes = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);

/** The SDK reports after every file; repaint at most this often (the last update always paints). */
const REPAINT_INTERVAL_MS = 100;

/** Throws when the window cannot be created; the caller logs it and copies without progress. */
export function openDataRootProgressWindow(locale: 'zh-CN' | 'en'): DataRootProgressWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 150,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    alwaysOnTop: true,
    title: COPY[locale].title,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pageHtml(locale))}`);
  let lastPaint = 0;
  return {
    update(progress) {
      const now = Date.now();
      const done = progress.files >= progress.totalFiles;
      if (win.isDestroyed() || (!done && now - lastPaint < REPAINT_INTERVAL_MS)) return;
      lastPaint = now;
      const percent = progress.totalBytes > 0 ? (progress.bytes / progress.totalBytes) * 100 : 100;
      const label = `${progress.files} / ${progress.totalFiles} · ${mebibytes(progress.bytes)} / ${mebibytes(progress.totalBytes)} MiB`;
      // A repaint can only fail while the page is still loading or the window is closing; the
      // next repaint (or the closed window) supersedes it, and the copy itself is unaffected.
      void win.webContents
        .executeJavaScript(
          `document.getElementById('p').value=${JSON.stringify(percent)};document.getElementById('t').textContent=${JSON.stringify(label)};`,
        )
        .catch(() => undefined);
    },
    close() {
      if (win.isDestroyed()) return;
      win.setClosable(true);
      win.destroy();
    },
  };
}
