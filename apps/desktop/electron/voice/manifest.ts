import type { VoiceAsset } from './installer.js';

export const VOICE_COMPONENT_VERSION = 'whisper-base-q5_1-node-1.1.3';

const model: VoiceAsset = {
  name: 'model.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base-q5_1.bin',
  bytes: 59707625,
  sha256: '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898',
};

const engines: Readonly<Record<string, VoiceAsset>> = {
  'darwin-arm64': {
    name: 'whisper.node',
    url: 'https://registry.npmjs.org/@fugood/node-whisper-darwin-arm64/-/node-whisper-darwin-arm64-1.1.3.tgz',
    bytes: 1516419,
    sha256: 'cb54d7e9050a896d794193367769b0c93e77c51e34861d521140c2dd8cc501dc',
    native: {
      bytes: 4349592,
      sha256: 'bf59fd6a3187941567e89243912f8ba06568d68494a6cf46289c1da03805dad9',
    },
  },
  'darwin-x64': {
    name: 'whisper.node',
    url: 'https://registry.npmjs.org/@fugood/node-whisper-darwin-x64/-/node-whisper-darwin-x64-1.1.3.tgz',
    bytes: 1642873,
    sha256: '8f9af3930e94f7b4123cc39ae8fea2554477404e65d4d5ad6a0ca142a6add591',
    native: {
      bytes: 4844568,
      sha256: '5acefe48a4eec722e0ee9b14ccf2e6302509ce1b3a3484279356738add71f90d',
    },
  },
  'win32-x64': {
    name: 'whisper.node',
    url: 'https://registry.npmjs.org/@fugood/node-whisper-win32-x64/-/node-whisper-win32-x64-1.1.3.tgz',
    bytes: 1205460,
    sha256: '25d54aff191d51833a4941ed77d54beeef034fad585c485938fb34e59f32cb4a',
    native: {
      bytes: 2756608,
      sha256: '86961243d773fcd53889ce5675f1a8fa1c0378fb0cc7f8ab4a7b9b126d6b326f',
    },
  },
  'linux-x64': {
    name: 'whisper.node',
    url: 'https://registry.npmjs.org/@fugood/node-whisper-linux-x64/-/node-whisper-linux-x64-1.1.3.tgz',
    bytes: 1279405,
    sha256: 'd847231487492e4bcaef2d6d47e06e4b4ea872ee621fc988d01b7f0733006224',
    native: {
      bytes: 2906024,
      sha256: 'e32b5b898033b5cfe1f23eed2394c7aae41e1ad15855abf3d3e2c454edd55455',
    },
  },
};

export function voiceAssets(
  platform = process.platform,
  arch = process.arch,
): readonly VoiceAsset[] {
  const engine = engines[`${platform}-${arch}`];
  return engine ? [engine, model] : [];
}
