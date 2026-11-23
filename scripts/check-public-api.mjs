import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const packagesRoot = resolve('packages');
const failures = [];
let publicPackageCount = 0;

for (const directory of readdirSync(packagesRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const root = join(packagesRoot, directory.name);
  const manifestPath = join(root, 'package.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.private === true) continue;
  publicPackageCount += 1;

  const expectedRoot = { types: './dist/index.d.ts', default: './dist/index.js' };
  if (JSON.stringify(manifest.exports?.['.']) !== JSON.stringify(expectedRoot)) {
    failures.push(`${manifest.name}: exports["."] must expose only dist/index types and runtime files`);
  }
  if (manifest.exports?.['./package.json'] !== './package.json') {
    failures.push(`${manifest.name}: exports["./package.json"] must remain available to tooling`);
  }
  if (manifest.main !== './dist/index.js' || manifest.types !== './dist/index.d.ts') {
    failures.push(`${manifest.name}: main/types must use explicit dist file extensions`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length !== 1 || manifest.files[0] !== 'dist') {
    failures.push(`${manifest.name}: published files must be restricted to dist`);
  }
  if (!existsSync(join(root, 'src', 'index.ts')))
    failures.push(`${manifest.name}: missing public src/index.ts entry point`);
}

if (failures.length > 0) {
  console.error('Public API manifest check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Public API manifest check passed for ${publicPackageCount} packages.`);
}
