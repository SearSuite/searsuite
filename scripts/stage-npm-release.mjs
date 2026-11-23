#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registry = 'https://registry.npmjs.org/';
const cliArgs = process.argv.slice(2);
const dryRun = cliArgs.includes('--dry-run');
const maxNewArg = cliArgs.find((arg) => arg.startsWith('--max-new='));
const maxNew = maxNewArg ? Number(maxNewArg.split('=')[1]) : Infinity;
const maxRetriesArg = cliArgs.find((arg) => arg.startsWith('--max-retries='));
const maxRetries = maxRetriesArg ? Number(maxRetriesArg.split('=')[1]) : 3;
const minimumGapMs = 30_000;
const retryDelaysMs = [60_000, 5 * 60_000, 15 * 60_000].slice(0, maxRetries);
const auditCache = join(tmpdir(), 'searsuite-stage-audit-cache');

if (cliArgs.some((arg) => arg !== '--dry-run' && !arg.startsWith('--max-new=') && !arg.startsWith('--max-retries='))) {
  throw new Error('Usage: node scripts/stage-npm-release.mjs [--dry-run] [--max-new=N] [--max-retries=0..3]');
}
if ((!Number.isInteger(maxNew) && maxNew !== Infinity) || maxNew < 1) {
  throw new Error('--max-new must be a positive integer.');
}
if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 3) {
  throw new Error('--max-retries must be an integer from 0 to 3.');
}

function command(binary, args, options = {}) {
  try {
    return execFileSync(binary, args, {
      cwd: options.cwd ?? root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (options.allowFailure) {
      return { code: error.status, output: `${error.stdout ?? ''}\n${error.stderr ?? ''}` };
    }
    throw new Error(`${binary} ${args.join(' ')} failed:\n${error.stderr ?? error.message}`);
  }
}

function workspacePackages() {
  const packagesDir = join(root, 'packages');
  const packages = new Map();
  for (const folder of readdirSync(packagesDir)) {
    const path = join(packagesDir, folder, 'package.json');
    if (!statSafe(path)?.isFile()) continue;
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    if (manifest.private) continue;
    if (!manifest.name?.startsWith('@searsuite/') || !manifest.version) {
      throw new Error(`Unexpected publishable package: ${path}`);
    }
    packages.set(manifest.name, { ...manifest, folder: join(packagesDir, folder) });
  }
  if (packages.size === 0) throw new Error('No publishable workspace packages found.');

  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Workspace dependency cycle involving ${name}`);
    visiting.add(name);
    const manifest = packages.get(name);
    for (const dependency of Object.keys(manifest.dependencies ?? {}).sort()) {
      if (packages.has(dependency)) visit(dependency);
    }
    visiting.delete(name);
    visited.add(name);
    ordered.push(manifest);
  }
  for (const name of [...packages.keys()].sort()) visit(name);
  return ordered;
}

function statSafe(path) {
  try {
    return statSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function auditTarball(tarball) {
  const entries = command('tar', ['-tzf', tarball]).split('\n').filter(Boolean);
  for (const entry of entries) {
    const name = entry.replace(/\/$/, '');
    if (name.startsWith('/') || name.split('/').some((part) => part === '..' || part === '.')) {
      throw new Error(`Unsafe archive path in ${tarball}: ${entry}`);
    }
    const basename = name.split('/').at(-1);
    if (/^(?:AGENTS|CLAUDE|SKILL)\.md$/i.test(basename) || /^\.?(?:env|npmrc|git|codex|cursor)$/i.test(basename)) {
      throw new Error(`Forbidden file in ${tarball}: ${entry}`);
    }
    if (!['package', 'package/dist', 'package/LICENSE', 'package/README.md', 'package/package.json'].includes(name)
      && !name.startsWith('package/dist/')) {
      throw new Error(`Unexpected file in ${tarball}: ${entry}`);
    }
  }
  const types = command('tar', ['-tvzf', tarball]).split('\n').filter(Boolean);
  if (types.some((entry) => !['-', 'd'].includes(entry[0]))) {
    throw new Error(`Archive contains a link or special file: ${tarball}`);
  }
  return createHash('sha1').update(readFileSync(tarball)).digest('hex');
}

function sortedJson(value) {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedJson(value[key])]));
  }
  return value;
}

function archiveContents(tarball, destination) {
  auditTarball(tarball);
  mkdirSync(destination, { recursive: true });
  command('tar', ['-xzf', tarball, '-C', destination]);
  const contents = new Map();
  function visit(folder, prefix = '') {
    for (const entry of readdirSync(folder)) {
      const path = join(folder, entry);
      const name = prefix ? `${prefix}/${entry}` : entry;
      const stat = lstatSync(path);
      if (stat.isDirectory()) visit(path, name);
      else if (stat.isFile()) {
        const bytes = readFileSync(path);
        const normalized = name === 'package.json'
          ? JSON.stringify(sortedJson(JSON.parse(bytes.toString('utf8'))))
          : bytes;
        contents.set(name, createHash('sha256').update(normalized).digest('hex'));
      } else throw new Error(`Archive contains a non-file: ${name}`);
    }
  }
  visit(join(destination, 'package'));
  return contents;
}

function sameArchiveContents(local, staged, destination) {
  const localContents = archiveContents(local, join(destination, 'local'));
  const stagedContents = archiveContents(staged, join(destination, 'staged'));
  return localContents.size === stagedContents.size
    && [...localContents].every(([name, hash]) => stagedContents.get(name) === hash);
}

function pack(manifest, destination) {
  command('pnpm', ['pack', '--pack-destination', destination], { cwd: manifest.folder });
  const filename = `${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz`;
  const tarball = join(destination, filename);
  if (!statSafe(tarball)?.isFile()) throw new Error(`pnpm pack did not create ${tarball}`);
  return { tarball, shasum: auditTarball(tarball) };
}

function publishedVersion(name, version) {
  const result = command('npm', ['view', `${name}@${version}`, 'version', '--json', '--registry', registry], {
    allowFailure: true,
  });
  if (typeof result === 'string') return JSON.parse(result) === version;
  if (/E404|404 Not Found/.test(result.output)) return false;
  throw new Error(`Could not check ${name}@${version}:\n${result.output.slice(-700)}`);
}

const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

async function downloadStage(stage) {
  mkdirSync(auditCache, { recursive: true });
  const existing = () => readdirSync(auditCache)
    .filter((file) => file.endsWith(`-${stage.id}.tgz`))
    .map((file) => join(auditCache, file));
  for (let attempt = 0; attempt < 4; attempt++) {
    const matches = existing();
    if (matches.length === 1 && createHash('sha1').update(readFileSync(matches[0])).digest('hex') === stage.shasum) {
      return matches[0];
    }
    for (const path of matches) unlinkSync(path);
    const result = command('npm', ['stage', 'download', stage.id, '--registry', registry], {
      cwd: auditCache,
      allowFailure: true,
    });
    if (typeof result === 'string') {
      const downloaded = existing();
      if (downloaded.length === 1
        && createHash('sha1').update(readFileSync(downloaded[0])).digest('hex') === stage.shasum) {
        return downloaded[0];
      }
    }
    if (attempt === 3) throw new Error(`Could not download staged ${stage.packageName}:\n${result.output.slice(-700)}`);
    await sleep([2_000, 10_000, 30_000][attempt]);
  }
  throw new Error(`Staged archive checksum does not match npm for ${stage.packageName}.`);
}

async function stage(tarball, name, version) {
  const args = ['stage', 'publish', tarball, '--access', 'public', '--registry', registry];
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    const result = command('npm', args, { allowFailure: true });
    const output = typeof result === 'string' ? result : result.output;
    if (typeof result === 'string') {
      const id = output.match(/staged with id ([a-f0-9-]+)/)?.[1];
      if (!id) throw new Error(`Could not read stage ID for ${name}@${version}:\n${output.slice(-700)}`);
      return id;
    }
    if (!/E429|429 Too Many Requests/.test(output)) {
      throw new Error(`Could not stage ${name}@${version}:\n${output.slice(-700)}`);
    }
    if (attempt === retryDelaysMs.length) {
      throw new Error(`npm still rate-limits staging ${name}@${version}. Re-run release:stage:resume later; already staged versions will be skipped.`);
    }
    const delay = retryDelaysMs[attempt];
    console.warn(`npm rate limit for ${name}@${version}; retrying in ${Math.round(delay / 60_000)} minute(s).`);
    await sleep(delay);
  }
}

async function main() {
  const account = command('npm', ['whoami', '--registry', registry]);
  const packages = workspacePackages();
  const staged = JSON.parse(command('npm', ['stage', 'list', '--json', '--registry', registry]));
  const stagedByName = new Map(staged.map((item) => [item.packageName, item]));
  const destination = mkdtempSync(join(tmpdir(), 'searsuite-stage-'));
  console.log(`npm account: ${account}; packages: ${packages.length}; already staged: ${staged.length}`);
  console.log(`Tarballs: ${destination}`);
  let skippedStaged = 0;
  let skippedPublished = 0;
  let pending = 0;
  let newlyStaged = 0;

  for (const manifest of packages) {
    const { tarball, shasum } = pack(manifest, destination);
    const existing = stagedByName.get(manifest.name);
    if (existing) {
      if (existing.version !== manifest.version || existing.access !== 'public') {
        throw new Error(`Staged ${manifest.name} differs from the local ${manifest.version} tarball. Review and reject the old stage before retrying.`);
      }
      if (existing.shasum !== shasum) {
        const stagedTarball = await downloadStage(existing);
        if (!sameArchiveContents(tarball, stagedTarball, join(destination, `${manifest.name.split('/')[1]}-compare`))) {
          throw new Error(`Staged ${manifest.name} has different file contents. Reject that stage before retrying.`);
        }
        console.log(`Verified equivalent staged contents for ${manifest.name} (tarball bytes differ).`);
      }
      skippedStaged++;
      continue;
    }
    if (dryRun) {
      pending++;
      continue;
    }
    if (newlyStaged >= maxNew) {
      pending++;
      continue;
    }
    if (publishedVersion(manifest.name, manifest.version)) {
      skippedPublished++;
      continue;
    }
    if (newlyStaged > 0) await sleep(minimumGapMs);
    const id = await stage(tarball, manifest.name, manifest.version);
    newlyStaged++;
    console.log(`Staged ${newlyStaged}: ${manifest.name}@${manifest.version} (${id})`);
  }
  console.log(`Done: ${skippedStaged} already staged, ${skippedPublished} already published, ${newlyStaged} newly staged, ${pending} pending.`);
  if (dryRun) console.log('Dry run: no packages were uploaded.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
