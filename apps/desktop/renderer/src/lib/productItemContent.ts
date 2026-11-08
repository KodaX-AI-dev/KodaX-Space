import type { ChannelOutput, SessionProductItem } from '@kodax-space/space-ipc-schema';

async function readBeforeDeadline(
  read: () => Promise<ChannelOutput<'session.productItem'>>,
  deadline: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('SDK item body read timed out.')),
          Math.max(0, deadline - Date.now()),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function productItemBodyLength(
  item: SessionProductItem,
  part: 'text' | 'input',
): number | undefined {
  if (part === 'input') return item.tool?.totalInputLength;
  // A positive offset denotes a suffix, even if an older snapshot omitted the optional total.
  const offset = item.textOffset ?? 0;
  return item.totalTextLength ?? (offset > 0 ? offset + item.text.length : undefined);
}

export function isProductItemPreview(item: SessionProductItem, part: 'text' | 'input'): boolean {
  const length = productItemBodyLength(item, part);
  if (length === undefined) return false;
  return part === 'input'
    ? (item.tool?.inputText ?? '').length !== length
    : item.text.length !== length || (item.textOffset ?? 0) !== 0;
}

/** Frozen SDK body read: identity, state, revision and UTF-16 offsets must all agree. */
export async function readProductItemText(
  item: SessionProductItem,
  read: (offset: number) => Promise<ChannelOutput<'session.productItem'>>,
  part: 'text' | 'input' | 'original' = 'text',
  source: 'view' | 'history' = 'view',
): Promise<string> {
  let length = part === 'original' ? undefined : productItemBodyLength(item, part);
  const preview = part === 'input' ? (item.tool?.inputText ?? '') : item.text;
  if (part !== 'original' && !isProductItemPreview(item, part)) return preview;
  if (length !== undefined && length > 16 * 1024 * 1024)
    throw new Error('SDK item exceeds the body read limit.');
  let text = '';
  let offset = 0;
  const deadline = Date.now() + 15_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('SDK item body read timed out.');
    const chunk = await readBeforeDeadline(() => read(offset), deadline);
    if (part === 'original' && length === undefined && chunk) length = chunk.totalLength;
    if (length === undefined || length > 16 * 1024 * 1024)
      throw new Error('SDK item exceeds the body read limit.');
    if (
      !chunk ||
      chunk.id !== item.id ||
      chunk.offset !== offset ||
      chunk.totalLength !== length ||
      (source === 'view' &&
        part !== 'original' &&
        (chunk.outputState !== item.outputState || chunk.textRevision !== item.textRevision)) ||
      offset + chunk.text.length > length
    )
      throw new Error('SDK item changed during body read.');
    text += chunk.text;
    if (chunk.nextOffset === undefined) {
      if (text.length !== length)
        throw new Error('SDK item body ended before its declared length.');
      return text;
    }
    if (chunk.nextOffset <= offset || chunk.nextOffset !== text.length)
      throw new Error('SDK item changed during body read.');
    offset = chunk.nextOffset;
  }
}
