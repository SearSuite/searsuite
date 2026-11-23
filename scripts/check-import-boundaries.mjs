import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const workspaceRoot = process.cwd();
const sourceRoots = ['packages', 'scripts'];
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const ignoredDirectories = new Set(['coverage', 'dist', 'node_modules', 'playwright-report', 'test-results']);
const violations = [];

function collectSourceFiles(directory) {
  const files = [];

  function visit(currentDirectory) {
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      if (ignoredDirectories.has(entry.name)) continue;
      const entryPath = join(currentDirectory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (sourceExtensions.has(extname(entry.name))) files.push(entryPath);
    }
  }

  visit(directory);
  return files;
}

function findOwnerDirectory(filePath) {
  const workspacePath = relative(workspaceRoot, filePath);
  const segments = workspacePath.split(sep);
  if (segments[0] === 'packages' && segments[1]) return join(workspaceRoot, segments[0], segments[1]);
  if (segments[0] === 'scripts') return join(workspaceRoot, segments[0]);
  return null;
}

function collectRelativeSpecifiers(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const specifiers = [];

  function addStringLiteral(node) {
    if (node && ts.isStringLiteralLike(node) && node.text.startsWith('.')) specifiers.push(node.text);
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addStringLiteral(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      addStringLiteral(node.moduleReference.expression);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isDynamicImport || isRequire) addStringLiteral(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function isWithin(directory, candidate) {
  const pathFromDirectory = relative(directory, candidate);
  return (
    pathFromDirectory === '' ||
    (!pathFromDirectory.startsWith(`..${sep}`) && pathFromDirectory !== '..' && !isAbsolute(pathFromDirectory))
  );
}

for (const sourceRoot of sourceRoots) {
  const absoluteRoot = join(workspaceRoot, sourceRoot);
  for (const filePath of collectSourceFiles(absoluteRoot)) {
    const ownerDirectory = findOwnerDirectory(filePath);
    if (!ownerDirectory) continue;
    for (const specifier of collectRelativeSpecifiers(filePath)) {
      const targetPath = resolve(dirname(filePath), specifier);
      if (isWithin(ownerDirectory, targetPath)) continue;
      violations.push({ filePath, ownerDirectory, specifier });
    }
  }
}

if (violations.length > 0) {
  console.error('Import boundary check failed. Use a workspace package name or configured absolute alias:');
  for (const violation of violations) {
    console.error(
      `- ${relative(workspaceRoot, violation.filePath)} imports ${violation.specifier} outside ${relative(
        workspaceRoot,
        violation.ownerDirectory,
      )}`,
    );
  }
  process.exitCode = 1;
} else {
  console.log('Import boundary check passed.');
}
