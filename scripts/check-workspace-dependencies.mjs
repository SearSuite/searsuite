import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { collectWorkspaceImports } from './collect-workspace-imports.mjs';

const workspaceRoot = process.cwd();
const packagesRoot = join(workspaceRoot, 'packages');
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function collectWorkspacePackages() {
  const packages = new Map();
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const directory = join(packagesRoot, entry.name);
    const packageJsonPath = join(directory, 'package.json');
    if (!existsSync(packageJsonPath)) continue;

    const packageJson = readJson(packageJsonPath);
    packages.set(packageJson.name, { directory, packageJson });
  }
  return packages;
}

function collectSourceFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];

  function visit(currentDirectory) {
    for (const entry of readdirSync(currentDirectory, {
      withFileTypes: true,
    })) {
      const entryPath = join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
        files.push(entryPath);
      }
    }
  }

  visit(directory);
  return files;
}

function main() {
  const workspacePackages = collectWorkspacePackages();
  const missingDependencies = [];

  for (const [sourceName, sourcePackage] of workspacePackages) {
    const declaredDependencies = sourcePackage.packageJson.dependencies ?? {};
    for (const filePath of collectSourceFiles(join(sourcePackage.directory, 'src'))) {
      for (const targetName of collectWorkspaceImports(filePath)) {
        if (targetName === sourceName || !workspacePackages.has(targetName)) continue;
        if (declaredDependencies[targetName]) continue;
        missingDependencies.push({
          sourceName,
          targetName,
          filePath: relative(workspaceRoot, filePath),
        });
      }
    }
  }

  if (!missingDependencies.length) {
    console.log('Workspace dependency check passed.');
    return;
  }

  console.error('Workspace dependency check failed:');
  for (const dependency of missingDependencies) {
    console.error(`- ${dependency.sourceName} imports ${dependency.targetName} without declaring a dependency (${dependency.filePath})`);
  }
  process.exitCode = 1;
}

main();
