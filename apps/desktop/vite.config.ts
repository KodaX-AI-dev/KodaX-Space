import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vite renderer 配置。Electron main 不经 Vite，由 scripts/build-main.mjs 用 esbuild 打包。
export default defineConfig({
  root: __dirname,
  base: './', // Electron file:// 加载时需要相对路径
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'renderer/src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Match the main bundle (build-main.mjs): production builds ship no source maps.
    sourcemap: false,
    target: 'es2022',
  },
  // F011: xterm.js 是 CJS-only 包 (no module field)。预声明让 vite 首次启动就预优化，
  // 避免运行时检测到 new deps 再 reload 触发 cycle（白屏 root cause）。
  optimizeDeps: {
    include: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links'],
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  clearScreen: false,
});
