import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const features = ['format-painter', 'clear-style', 'checkbox', 'dropdown'];
const globals = new Set([
  'window',
  'globalThis',
  'self',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'HTMLElement',
  'HTMLCanvasElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'DOMRect',
  'DOMParser',
  'XMLSerializer',
  'getComputedStyle',
  'matchMedia',
  'requestIdleCallback',
  'cancelIdleCallback',
  'CanvasRenderingContext2D',
  'MouseEvent',
  'KeyboardEvent',
  'PointerEvent',
  'ClipboardEvent',
  'Blob',
  'Image',
  'FileReader',
  'fetch',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'performance',
  'process',
  'Buffer',
  'console',
  'Event',
  'EventTarget',
  'Window',
  'Document',
  'URL',
  'OffscreenCanvas',
  'ResizeObserver',
  'MutationObserver',
  'WebSocket',
  'XMLHttpRequest',
  'ImageData',
]);
const violations = [];
function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(root, entry.name)) : entry.name.endsWith('.ts') ? [join(root, entry.name)] : [],
  );
}
for (const feature of features) {
  const root = join(process.cwd(), 'packages', `sear-plugin-${feature}`);
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const dependency of Object.keys(manifest.dependencies ?? {}))
    if (/web-toolbar|web-doc-toolbar|sear-host/.test(dependency))
      violations.push(`${manifest.name}: host dependency ${dependency}`);
  for (const file of files(join(root, 'src'))) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const fail = (node, message) =>
      violations.push(
        `${relative(process.cwd(), file)}:${
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
        }: ${message}`,
      );
    function visit(node) {
      if (
        ts.isIdentifier(node) &&
        (globals.has(node.text) || /^(HTML|SVG)[A-Z]?.*Element$/.test(node.text)) &&
        !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
        !(ts.isPropertySignature(node.parent) && node.parent.name === node)
      )
        fail(node, `native/global identifier ${node.text}`);
      if (ts.isImportDeclaration(node)) {
        if (/^(node:|fs$|path$|os$)|web-toolbar|web-doc-toolbar/.test(node.moduleSpecifier.text))
          fail(node, 'platform-specific import');
        const named = node.importClause?.namedBindings;
        if (named && ts.isNamedImports(named))
          for (const specifier of named.elements)
            if (/^(Web|Browser|DOM|HTML)/.test((specifier.propertyName ?? specifier.name).text))
              fail(specifier, 'concrete platform adapter in feature core');
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const receiver = node.expression.expression.getText(source),
          name = node.expression.name.text;
        if (
          (receiver === 'Date' && name === 'now') ||
          (receiver === 'Math' && name === 'random') ||
          ['toLocaleLowerCase', 'toLocaleUpperCase', 'localeCompare'].includes(name)
        )
          fail(node, 'implicit host clock, identity or locale');
      }
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'Date' &&
        !node.arguments?.length
      )
        fail(node, 'implicit host wall clock');
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else console.log(`Platform boundary check passed for ${features.length} feature cores.`);
