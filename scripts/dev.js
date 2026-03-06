/**
 * Dev server wrapper.
 * Injects fix-eperm-preload.cjs into NODE_OPTIONS so that Shopify CLI's
 * file watcher doesn't crash on EPERM when encountering '+types' directories
 * created by React Router typegen on Windows 10 Build 1803.
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Forward slashes required — backslashes are stripped when Node.js parses NODE_OPTIONS
const preload = join(__dirname, 'fix-eperm-preload.cjs').replace(/\\/g, '/');

const existing = process.env.NODE_OPTIONS || '';
const nodeOptions = `${existing} --require ${preload}`.trim();

const child = spawn('shopify', ['app', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});

child.on('exit', (code) => process.exit(code ?? 0));
