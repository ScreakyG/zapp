// Assembles the webOS app folder (build/): the TV bundle of the UI (vite --mode webos) plus the
// manifest and icons, ready for `ares-package`.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const bundle = path.join(root, '..', '..', 'packages', 'ui', 'dist-webos');
const build = path.join(root, 'build');

if (!fs.existsSync(path.join(bundle, 'index.html'))) {
  console.error('Missing UI bundle: run `pnpm --filter @zapp/ui build:webos` first.');
  process.exit(1);
}
fs.rmSync(build, { recursive: true, force: true });
fs.cpSync(bundle, build, { recursive: true });
fs.cpSync(path.join(root, 'app'), build, { recursive: true });
console.log(`webOS app staged in ${path.relative(process.cwd(), build)}`);
