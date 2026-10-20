/**
 * Builds the web game and puts it in the repo root, ready to commit.
 *
 * GitHub Pages serves this repo straight from `main` (Settings -> Pages ->
 * Deploy from a branch -> main, / (root)), with no Actions. So the built
 * site lives in the root alongside the source: index.html, favicon.ico,
 * metadata.json, _expo/ and assets/assets/, plus .nojekyll so Pages does not run Jekyll
 * (which would drop _expo/ and show the README instead).
 *
 *   npm run publish:web     typecheck, test, build, copy into the root
 *
 * Then commit and push to main.
 *
 * The site is served at the root of its custom domain (see CNAME), so it is
 * built with no base path: bundled assets such as the sounds are fetched
 * from /assets/... . To serve it from a subpath instead (say the plain
 * github.io address with no custom domain), set PAGES_BASE_URL=/Harbour-Tycoon.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, env = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });

// Never publish a build that fails its own checks.
run('npm run typecheck');
run('npm test');

const base = process.env.PAGES_BASE_URL ?? '';
rmSync(join(root, 'dist'), { recursive: true, force: true });
run('npx expo export --platform web --output-dir dist', { PAGES_BASE_URL: base });

// Replace the last build: the bundle's file name changes every time.
// Bundled assets (the sounds) are served from /assets/assets/..., mirroring
// their source path; that folder is generated, and sits inside the source
// assets/ folder only because the URL says so.
const published = ['index.html', 'favicon.ico', 'metadata.json', '_expo', 'assets/assets'];
for (const name of published) rmSync(join(root, name), { recursive: true, force: true });
for (const name of published) {
  const from = join(root, 'dist', name);
  if (existsSync(from)) cpSync(from, join(root, name), { recursive: true });
}
writeFileSync(join(root, '.nojekyll'), '');

// Point the page at its own script and icon relatively, so it at least
// loads wherever it is served. (Assets the bundle fetches, like the sounds,
// still use the base path.)
const page = join(root, 'index.html');
writeFileSync(page, readFileSync(page, 'utf8').replaceAll(`"${base}/`, '"./'));

console.log(`\nPublished the web build into the repo root (served at ${base || 'the domain root'}/).`);
console.log('Commit index.html, favicon.ico, metadata.json, _expo/, assets/assets/ and .nojekyll, then push to main.');
