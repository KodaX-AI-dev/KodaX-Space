import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const assets = JSON.parse(fs.readFileSync(path.join(directory, 'source-assets.json'), 'utf8'));
const files = ['index.html', 'graphite.html', 'paper.html', 'focus.html'];
if (fs.existsSync(path.join(directory, 'components.html'))) files.push('components.html');
if (fs.existsSync(path.join(directory, 'settings.html'))) files.push('settings.html');
for (const filename of ['integrated.html', 'integrated-settings.html']) {
  if (fs.existsSync(path.join(directory, filename))) files.push(filename);
}
const themeBridge = fs.readFileSync(path.join(directory, 'theme-bridge.js'), 'utf8');

for (const filename of files) {
  const target = path.join(directory, filename);
  if (!fs.existsSync(target)) throw new Error(`Preview is missing: ${filename}`);
  const source = fs.readFileSync(target, 'utf8');
  let output = source
    .replaceAll('__FONT_FACES__', assets.fonts)
    .replaceAll('__SPACE_LOGO__', assets.logo)
    .replaceAll('__LUCIDE_ICONS__', JSON.stringify(assets.icons));
  if (['graphite.html', 'paper.html', 'focus.html', 'integrated.html'].includes(filename)) {
    output = output.replace(/<script data-preview-theme-bridge>[\s\S]*?<\/script>\s*/g, '');
    output = output.replace(
      '</body>',
      `<script data-preview-theme-bridge>${themeBridge}</script>\n</body>`,
    );
  }
  fs.writeFileSync(target, output);
  process.stdout.write(`${filename}: embedded local logo, fonts and icons\n`);
}
