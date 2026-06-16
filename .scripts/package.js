#!/usr/bin/env node
/**
 * Build cinderblock and package the standalone tree into a tar.gz
 * artifact suitable for shipyard deploy.
 *
 * Output: ./dist/cinderblock-release.tar.gz
 *
 * Called by the pre_upload hook in shipyard.yaml at the repo root.
 * Mirrors the shape of ~/projects/shipyard/web/.scripts/package.js so
 * both projects look the same when read side-by-side.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const standalone = resolve(repoRoot, '.next/standalone');
const distDir = resolve(repoRoot, 'dist');
const archive = resolve(distDir, 'cinderblock-release.tar.gz');

function run(cmd, env = {}) {
  console.log(`▸ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: repoRoot, env: { ...process.env, ...env } });
}

console.log('━━━ packaging cinderblock ━━━');

// Bump Node's old-space ceiling for the next build step — Cinderblock's
// docs tree generates enough static pages that Node 25's default ~4GB
// heap hits SIGKILL near the build-trace stage. 8GB is comfortably
// above what the build actually needs.
run('npm run build', { NODE_OPTIONS: '--max-old-space-size=8192' });

const standaloneStatic = resolve(standalone, '.next/static');
const standalonePublic = resolve(standalone, 'public');
mkdirSync(dirname(standaloneStatic), { recursive: true });
cpSync(resolve(repoRoot, '.next/static'), standaloneStatic, { recursive: true });
if (existsSync(resolve(repoRoot, 'public'))) {
  cpSync(resolve(repoRoot, 'public'), standalonePublic, { recursive: true });
}

mkdirSync(distDir, { recursive: true });
if (existsSync(archive)) rmSync(archive);
run(`tar -czf ${archive} -C ${standalone} .`);

console.log(`━━━ packaged: ${archive} ━━━`);
