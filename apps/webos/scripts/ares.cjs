// Runs an ares command on the packaged app, reading its id and version from appinfo.json so the
// .ipk name never drifts: `node scripts/ares.cjs install|launch|inspect`.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const info = require('../app/appinfo.json');
const ipk = path.join(__dirname, '..', 'out', `${info.id}_${info.version}_all.ipk`);

const commands = {
  install: ['ares-install', '--device', 'tv', ipk],
  launch: ['ares-launch', '--device', 'tv', info.id],
  inspect: ['ares-inspect', '--device', 'tv', '--app', info.id, '--open'],
};

const command = commands[process.argv[2]];
if (!command) {
  console.error(`Usage: node scripts/ares.cjs ${Object.keys(commands).join('|')}`);
  process.exit(1);
}
const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
