import { randomUUID } from 'node:crypto';
import { normalizeWebPreviewUrl } from '@kodax-space/space-ipc-schema';

export interface PreviewFrame {
  readonly name: string;
  readonly parent: PreviewFrame | null;
}

/** Window-owned grants for ProjectWebPreview, never for plugin/artifact frames. */
export class RemoteWebPreviewRegistry {
  private readonly owners = new Map<number, Set<string>>();
  create(owner: number, raw: string): { id: string; url: string } {
    const url = normalizeWebPreviewUrl(raw);
    if (!url) throw new Error('Invalid web preview URL');
    const grants = this.owners.get(owner) ?? new Set<string>();
    if (grants.size >= 32) throw new Error('Close an existing web preview first');
    const id = randomUUID();
    grants.add(id);
    this.owners.set(owner, grants);
    return { id, url };
  }
  release(owner: number, id?: string): void {
    if (id) this.owners.get(owner)?.delete(id);
    if (!id || this.owners.get(owner)?.size === 0) this.owners.delete(owner);
  }
  forFrame(owner: number, frame: PreviewFrame | null, main: PreviewFrame): string | null {
    let root = frame;
    for (let depth = 0; root && depth < 32; depth++) {
      if (root.parent === main) {
        if (!root.name.startsWith('space-web-preview-')) return null;
        const id = root.name.slice('space-web-preview-'.length);
        return this.owners.get(owner)?.has(id) ? id : null;
      }
      root = root.parent;
    }
    return null;
  }
}

export const remoteWebPreviewRegistry = new RemoteWebPreviewRegistry();
