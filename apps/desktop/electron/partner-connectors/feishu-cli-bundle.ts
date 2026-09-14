import path from 'node:path';
import { bundledFeishuCliArchivePath } from './feishu-cli-install.js';

interface FeishuCliBundleContext {
  readonly isPackaged: boolean;
  readonly mainDirectory: string;
  readonly resourcesPath: string;
  readonly platform?: NodeJS.Platform;
  readonly arch?: string;
}

/** Resolve only installer/build-owned paths; no renderer or extension input reaches this seam. */
export function resolveBundledFeishuCliArchivePath(context: FeishuCliBundleContext): string {
  const root = context.isPackaged
    ? path.join(context.resourcesPath, 'managed-components')
    : path.resolve(context.mainDirectory, '../.managed-components');
  return bundledFeishuCliArchivePath(root, context.platform, context.arch);
}
