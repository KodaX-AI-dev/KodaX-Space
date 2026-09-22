import { z } from 'zod';

/** Remote previews are HTTPS pages, never local files, application pages or credentials. */
export function normalizeWebPreviewUrl(raw: string): string | null {
  if (!raw || raw.length > 8192 || /[\x00-\x20\x7f]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/\.$/, '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !host.includes('.') ||
      host.startsWith('[') ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|lan)$/.test(host)
    )
      return null;
    return url.href.length <= 8192 ? url.href : null;
  } catch {
    return null;
  }
}

const id = z.string().uuid();
const url = z
  .string()
  .max(8192)
  .refine((value) => normalizeWebPreviewUrl(value) !== null);
export const webPreviewPrepareChannel = {
  name: 'webPreview.prepare',
  direction: 'invoke',
  input: z.object({ url }).strict(),
  output: z.object({ id, url }),
} as const;
export const webPreviewReleaseChannel = {
  name: 'webPreview.release',
  direction: 'invoke',
  input: z.object({ id }).strict(),
  output: z.object({ released: z.boolean() }),
} as const;
export const webPreviewFailedChannel = {
  name: 'webPreview.failed',
  direction: 'push',
  payload: z.object({ id }),
} as const;
