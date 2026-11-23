import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { collectWorkspaceImports } from './collect-workspace-imports.mjs';

const packagesRoot = join(process.cwd(), 'packages');
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);

function collectFiles(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(entryPath, files);
    else if (sourceExtensions.has(extname(entry.name))) files.push(entryPath);
  }
  return files;
}

const packages = new Map();
for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
  const directory = join(packagesRoot, entry.name);
  const manifestPath = join(directory, 'package.json');
  if (!entry.isDirectory() || !existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  packages.set(manifest.name, { directory, manifest, manifestPath });
}

let updatedPackages = 0;
for (const [packageName, packageInfo] of packages) {
  const imports = new Set();
  for (const filePath of collectFiles(join(packageInfo.directory, 'src'))) {
    for (const targetName of collectWorkspaceImports(filePath)) {
      if (targetName !== packageName && packages.has(targetName)) imports.add(targetName);
    }
  }

  packageInfo.manifest.dependencies ??= {};
  let changed = false;
  for (const targetName of imports) {
    if (!packageInfo.manifest.dependencies[targetName]) {
      packageInfo.manifest.dependencies[targetName] = 'workspace:*';
      changed = true;
    }
  }
  if (!changed) continue;

  packageInfo.manifest.dependencies = Object.fromEntries(
    Object.entries(packageInfo.manifest.dependencies).sort(([left], [right]) => left.localeCompare(right)),
  );
  writeFileSync(packageInfo.manifestPath, `${JSON.stringify(packageInfo.manifest, null, 2)}\n`);
  updatedPackages++;
}

console.log(`Updated ${updatedPackages} workspace package manifests.`);
