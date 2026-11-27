import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectWorkspaceImports } from './collect-workspace-imports.mjs';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesRoot = join(repositoryRoot, 'packages');
const fixtureRoot = join(repositoryRoot, 'scripts', 'fixtures', 'external-consumer');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'searsuite-external-consumer-'));
const tarballRoot = join(temporaryRoot, 'tarballs');

try {
  await mkdir(tarballRoot, { recursive: true });
  // Pack the current source state so ignored `dist` directories cannot go stale.
  run('pnpm', ['run', 'build'], repositoryRoot);

  const packageEntries = [];
  for (const directoryName of (await readdir(packagesRoot)).sort()) {
    const packageRoot = join(packagesRoot, directoryName);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (manifest.private === true || typeof manifest.name !== 'string') continue;
    packageEntries.push({ name: manifest.name, root: packageRoot });
  }

  const tarballs = new Map();
  for (const entry of packageEntries) {
    const before = new Set(await readdir(tarballRoot));
    run('pnpm', ['pack', '--pack-destination', tarballRoot], entry.root);
    const created = (await readdir(tarballRoot)).filter((file) => !before.has(file) && file.endsWith('.tgz'));
    if (created.length !== 1) {
      throw new Error(`Expected one tarball for ${entry.name}, received ${created.length}.`);
    }
    tarballs.set(entry.name, join(tarballRoot, created[0]));
  }

  const directDependencies = [
    ...new Set([
      ...collectWorkspaceImports(join(fixtureRoot, 'consumer.ts')),
      ...collectWorkspaceImports(join(fixtureRoot, 'headless.mjs')),
    ]),
  ].sort();
  const manifest = {
    name: 'searsuite-external-consumer-contract',
    version: '0.0.0',
    private: true,
    // Keep fixture installation on the repository's package-manager version.
    packageManager: JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')).packageManager,
    dependencies: Object.fromEntries(
      directDependencies.map((name) => [name, `file:${requireTarball(tarballs, name)}`]),
    ),
    pnpm: {
      overrides: Object.fromEntries([...tarballs.entries()].map(([name, tarball]) => [name, `file:${tarball}`])),
    },
  };
  await writeFile(join(temporaryRoot, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await copyFile(join(fixtureRoot, 'consumer.ts'), join(temporaryRoot, 'consumer.ts'));
  await copyFile(join(fixtureRoot, 'tsconfig.json'), join(temporaryRoot, 'tsconfig.json'));
  await copyFile(join(fixtureRoot, 'headless.mjs'), join(temporaryRoot, 'headless.mjs'));

  run('pnpm', ['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'], temporaryRoot);
  run('pnpm', ['exec', 'tsc', '-p', join(temporaryRoot, 'tsconfig.json'), '--noEmit'], temporaryRoot);
  run(process.execPath, [join(temporaryRoot, 'headless.mjs')], temporaryRoot);
  console.log(`External consumer contract passed for ${packageEntries.length} packed packages.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function requireTarball(tarballs, packageName) {
  const tarball = tarballs.get(packageName);
  if (!tarball) throw new Error(`Missing packed dependency ${packageName}.`);
  return tarball;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status === 0) return;
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  throw new Error(`${command} ${args.join(' ')} failed in ${cwd}.\n${output}`);
}
