/**
 * Builds the web game and puts it in the repo root, ready to commit.
 *
 * GitHub Pages serves this repo straight from `main` (Settings -> Pages ->
 * Deploy from a branch -> main, / (root)), with no Actions. So the built
 * site lives in the root alongside the source: index.html, favicon.ico,
 * metadata.json and _expo/, plus .nojekyll so Pages does not run Jekyll
 * (which would drop _expo/ and show the README instead).
 *
 *   npm run publish:web     typecheck, test, build, copy into the root
 *
 * Then commit and push to main. PAGES_BASE_URL overrides the site path
 * (default /Harbour-Tycoon, the repo name).
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, env = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });

// Never publish a build that fails its own checks.
run('npm run typecheck');
run('npm test');

const base = process.env.PAGES_BASE_URL ?? '/Harbour-Tycoon';
rmSync(join(root, 'dist'), { recursive: true, force: true });
run('npx expo export --platform web --output-dir dist', { PAGES_BASE_URL: base });

// Replace the last build: the bundle's file name changes every time.
const published = ['index.html', 'favicon.ico', 'metadata.json', '_expo'];
for (const name of published) rmSync(join(root, name), { recursive: true, force: true });
for (const name of published) {
  const from = join(root, 'dist', name);
  if (existsSync(from)) cpSync(from, join(root, name), { recursive: true });
}
writeFileSync(join(root, '.nojekyll'), '');

console.log(`\nPublished the web build into the repo root (served at ${base}/).`);
console.log('Commit index.html, favicon.ico, metadata.json, _expo/ and .nojekyll, then push to main.');
