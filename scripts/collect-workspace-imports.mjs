import { readFileSync } from 'node:fs';
import ts from 'typescript';

const workspacePackagePattern = /^@searsuite\/[^/]+$/;

function addWorkspacePackage(imports, specifier) {
  const packageName = specifier.split('/').slice(0, 2).join('/');
  if (workspacePackagePattern.test(packageName)) imports.add(packageName);
}

/** Collects workspace package references from actual module syntax, excluding comments and documentation examples. */
export function collectWorkspaceImports(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, false);
  const imports = new Set();

  function addModuleSpecifier(moduleSpecifier) {
    if (moduleSpecifier && ts.isStringLiteralLike(moduleSpecifier)) {
      addWorkspacePackage(imports, moduleSpecifier.text);
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addModuleSpecifier(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      addModuleSpecifier(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      addModuleSpecifier(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}
