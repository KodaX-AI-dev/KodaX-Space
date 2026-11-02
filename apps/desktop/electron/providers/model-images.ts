export type MultimodalSupport = 'none' | 'image-input' | 'full';
/** The selected model descriptor overrides the provider default, including explicit none. */
export function modelImageSupport(
  model: { readonly multimodalSupport?: MultimodalSupport } | null | undefined,
  provider: { readonly multimodalSupport?: MultimodalSupport } | undefined,
): MultimodalSupport | undefined {
  return model?.multimodalSupport ?? provider?.multimodalSupport;
}
export async function readModelImageSupport(
  providerId: string,
  model?: string,
): Promise<MultimodalSupport | undefined> {
  if (providerId === 'mock') return undefined;
  const { resolveModelCapabilities, resolveProvider } = await import('@kodax-ai/kodax/llm');
  const provider = resolveProvider(providerId);
  return modelImageSupport(
    resolveModelCapabilities(providerId, model ?? provider.getModel()),
    provider.getCapabilityProfile(model),
  );
}
