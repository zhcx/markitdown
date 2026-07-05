const { execFileSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const sourceIcon = path.join(projectRoot, 'src-tauri', 'icons', 'icon.png');
const tauriCli = require.resolve('@tauri-apps/cli/tauri.js');

// Use the canonical application artwork to create every platform-specific icon
// required by Tauri, including icon.ico for Windows and icon.icns for macOS.
execFileSync(process.execPath, [tauriCli, 'icon', sourceIcon], {
  cwd: projectRoot,
  stdio: 'inherit',
});
