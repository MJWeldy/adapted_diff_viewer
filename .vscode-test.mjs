import { defineConfig } from '@vscode/test-cli';
import path from 'path';

// Set VSCODE_TEST_PATH to an installed VS Code executable (e.g. /usr/share/code/code)
// to test against it instead of downloading one.
const installPath = process.env.VSCODE_TEST_PATH;

export default defineConfig({
  files: 'out-integration/test/integration/**/*.test.js',
  ...(installPath ? { useInstallation: { fromPath: installPath } } : {}),
  workspaceFolder: path.resolve('src/test/integration/workspace'),
  launchArgs: [
    '--disable-extensions',
    '--disable-gpu',
  ],
  mocha: {
    timeout: 30000,
  },
});
