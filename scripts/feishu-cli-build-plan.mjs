const PLATFORM_FLAGS = new Map([
  ['--mac', 'darwin'],
  ['--win', 'win32'],
  ['--linux', 'linux'],
]);
const ARCH_FLAGS = new Map([
  ['--x64', 'x64'],
  ['--arm64', 'arm64'],
]);

export function resolveFeishuCliBuildPlan(
  args,
  hostPlatform = process.platform,
  hostArch = process.arch,
) {
  const platforms = [...PLATFORM_FLAGS].filter(([flag]) => args.includes(flag));
  if (platforms.length > 1) throw new Error('select one package platform per build');
  const platform = platforms[0]?.[1] ?? hostPlatform;
  if (!['darwin', 'linux', 'win32'].includes(platform))
    throw new Error(`unsupported package platform: ${platform}`);
  if (args.some((arg) => ['--ia32', '--armv7l'].includes(arg)))
    throw new Error('unsupported architecture for the bundled Feishu CLI');
  const selected = [...ARCH_FLAGS].filter(([flag]) => args.includes(flag)).map(([, arch]) => arch);
  const arches = selected.length > 0 ? selected : platform === 'darwin' ? [hostArch] : ['x64'];
  if (arches.some((arch) => !['arm64', 'x64'].includes(arch)))
    throw new Error('unsupported architecture for the bundled Feishu CLI');
  if (platform !== 'darwin' && arches.some((arch) => arch !== 'x64'))
    throw new Error(`unsupported ${platform} package architecture for this release`);
  return { platform, targets: arches.map((arch) => `${platform}-${arch}`) };
}
