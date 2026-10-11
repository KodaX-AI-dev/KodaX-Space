import type { RuntimeSessionService } from '@kodax-ai/kodax/runtime';
import type { ClientSessionView, ClientViewItem } from '@kodax-ai/kodax/client';

export type RuntimeViewReader = Pick<RuntimeSessionService, 'observeView' | 'readViewItem'>;

/** A complete current view replaces the removed event journal read boundary. */
export async function readRuntimeSessionView(
  service: RuntimeViewReader,
  sessionId: string,
): Promise<ClientSessionView> {
  let view: ClientSessionView | undefined;
  let abandoned = false;
  const pending = service
    .observeView(sessionId, (current) => {
      view = current;
    })
    .then((observation) => {
      if (abandoned) observation.close();
      return observation;
    });
  let observation;
  try {
    observation = await withinViewDeadline(() => pending, Date.now() + 5_000);
    if (!view || view.session.id !== sessionId)
      throw new Error('Runtime did not deliver a complete current Session view.');
    return view;
  } finally {
    abandoned = true;
    observation?.close();
  }
}

export async function readRuntimeViewText(
  service: RuntimeViewReader,
  sessionId: string,
  item: ClientViewItem,
  part: 'text' | 'input' = 'text',
): Promise<string> {
  const length = part === 'input' ? item.tool?.totalInputLength : item.totalTextLength;
  let text = part === 'input' ? (item.tool?.inputText ?? '') : item.text;
  if (
    Buffer.byteLength(text) > 16 * 1024 * 1024 ||
    (length !== undefined &&
      (!Number.isSafeInteger(length) || length < 0 || length > 16 * 1024 * 1024))
  )
    throw new Error('Runtime view recovery exceeds the read limit.');
  if (
    length === undefined ||
    (part === 'text' ? !item.textOffset && text.length === length : text.length === length)
  )
    return text;
  text = '';
  let offset = 0;
  const deadline = Date.now() + 5_000;
  for (;;) {
    const chunk = await withinViewDeadline(
      () => service.readViewItem(sessionId, item.id, { offset, part }),
      deadline,
    );
    if (
      !chunk ||
      chunk.id !== item.id ||
      chunk.offset !== offset ||
      chunk.outputState !== item.outputState ||
      chunk.textRevision !== item.textRevision ||
      chunk.totalLength !== length ||
      offset + chunk.text.length > length
    ) {
      throw new Error('Runtime view content changed during recovery.');
    }
    text += chunk.text;
    if (Buffer.byteLength(text) > 16 * 1024 * 1024)
      throw new Error('Runtime view recovery exceeds the read limit.');
    if (chunk.nextOffset === undefined) {
      if (text.length !== length)
        throw new Error('Runtime view content ended before its declared length.');
      return text;
    }
    if (chunk.nextOffset <= offset || chunk.nextOffset !== offset + chunk.text.length)
      throw new Error('Runtime view read offset did not advance.');
    offset = chunk.nextOffset;
  }
}

async function withinViewDeadline<T>(read: () => Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Runtime view recovery timed out.')),
          Math.max(0, deadline - Date.now()),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
