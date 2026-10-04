import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const marketplace = join(homedir(), '.codex', 'meta-clinic-marketplace');
const plugin = join(marketplace, 'plugins', 'meta-clinic');
await readFile(join(source, 'dist', 'server.mjs'));
await readFile(join(source, 'dist', 'panel.html'));
await mkdir(plugin, { recursive: true });
for (const path of ['plugin.json', '.codex-plugin', 'mcp.json', '.mcp.json', 'dist', 'assets', 'skills', 'README.md', 'CAPABILITIES.md', 'CONNECTIONS.md', 'PLATFORM.md', 'EVENTS.md', 'DEMO.md', 'CARE-WORKFLOWS.md', 'INTAKE.md', 'WORKFLOW-COVERAGE.md', 'WORKFLOW-116.md', 'workflow-116.json', 'VERIFICATION.md', 'SUBMISSION.md']) await cp(join(source, path), join(plugin, path), { recursive: true });
await mkdir(join(marketplace, '.agents', 'plugins'), { recursive: true });
await writeFile(join(marketplace, '.agents', 'plugins', 'marketplace.json'), JSON.stringify({
  name: 'meta-clinic-local', interface: { displayName: 'Meta Clinic' },
  plugins: [{ name: 'meta-clinic', source: { source: 'local', path: './plugins/meta-clinic' }, policy: { installation: 'AVAILABLE', authentication: 'ON_USE' }, category: 'Productivity' }],
}, null, 2));
for (const args of [['plugin', 'marketplace', 'add', marketplace], ['plugin', 'add', 'meta-clinic@meta-clinic-local', '--json']]) {
  // Use the executable directly; shell interpolation is unnecessary.
  const executable = process.env.CODEX_CLI_PATH || 'codex';
  const run = spawnSync(executable, args, { stdio: 'inherit', windowsHide: true, shell: false });
  if (run.error || run.status !== 0) throw new Error(`Codex plugin installation failed: ${run.error?.message || run.status}. Package is preserved at ${plugin}.`);
}
console.log('Meta Clinic installed. Reload plugin tools or open a new chat if the host has not refreshed them.');
