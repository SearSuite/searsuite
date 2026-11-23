import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ts from 'typescript';

const roots = [join(process.cwd(), 'packages')];
const ignoredDirectories = new Set(['dist', 'node_modules', 'spec']);
const injectableDecorators = new Set(['Injectable', 'Singleton']);
const injectDecorators = new Set(['Inject']);
const violations = [];

function decoratorsOf(node) {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
}

function hasDecorator(node, names) {
  return decoratorsOf(node).some((decorator) => {
    const expression = decorator.expression;
    const callee = ts.isCallExpression(expression) ? expression.expression : expression;
    return ts.isIdentifier(callee) && names.has(callee.text);
  });
}

function inspectSource(path, source) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);

  function visit(node) {
    if (ts.isClassDeclaration(node) && hasDecorator(node, injectableDecorators)) {
      for (const member of node.members) {
        if (!ts.isConstructorDeclaration(member)) continue;
        for (const parameter of member.parameters) {
          if (!hasDecorator(parameter, injectDecorators) || !parameter.initializer) continue;
          if (!ts.isNewExpression(parameter.initializer)) continue;
          const line = sourceFile.getLineAndCharacterOfPosition(parameter.getStart(sourceFile)).line + 1;
          violations.push(
            `${relative(process.cwd(), path)}:${line}: injected dependency ${parameter.name.getText(sourceFile)} ` +
              `must be supplied by the owning container, not constructed as a default value`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.isFile() && path.endsWith('.ts') && !path.endsWith('.d.ts')) {
      inspectSource(path, await readFile(path, 'utf8'));
    }
  }
}

for (const root of roots) await visit(root);

if (violations.length > 0) {
  console.error('DI boundary check failed:\n' + violations.join('\n'));
  process.exit(1);
}

console.log('DI boundary check passed.');
