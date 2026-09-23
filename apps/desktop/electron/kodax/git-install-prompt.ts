let sdkPromise: Promise<typeof import('@kodax-ai/kodax/agent')> | undefined;

/** Keep the SDK lazy on macOS and out of ordinary Windows/Linux Git calls. */
export async function assertNoGitInstallPrompt(cwd: string): Promise<void> {
  if (process.platform !== 'darwin') return;
  sdkPromise ??= import('@kodax-ai/kodax/agent');
  const sdk = await sdkPromise;
  await sdk.assertNoGitInstallPrompt({ cwd });
}
