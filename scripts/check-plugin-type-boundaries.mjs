import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import ts from 'typescript';

const args = process.argv.slice(2);
const argument = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const project = resolve(argument('--project') ?? 'tsconfig.json');
const root = dirname(project);
const config = ts.getParsedCommandLineOfConfigFile(
  project,
  { noEmit: true, allowJs: true },
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic(diagnostic) {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    },
  },
);
if (!config) throw new Error(`Cannot load ${project}.`);
const production = (file) => {
  const path = relative(root, file).split(sep).join('/');
  return (
    !path.startsWith('../') &&
    !/(^|\/)(?:dist|node_modules|vendor|\.generated)(\/|$)/.test(path) &&
    /\.[cm]?[jt]sx?$/.test(path) &&
    !path.endsWith('.d.ts')
  );
};
const authoredFiles = ts.sys.readDirectory(
  root,
  ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
  ['**/node_modules/**', '**/dist/**', '**/vendor/**', '**/.generated/**', '**/coverage/**', '**/.git/**'],
);
const program = ts.createProgram(
  [...new Set([...config.fileNames, ...authoredFiles])].filter(production),
  config.options,
);
const checker = program.getTypeChecker();
const packageNames = new Map();
const packageName = (file) => {
  let path = dirname(file);
  const visited = [];
  while (!packageNames.has(path)) {
    visited.push(path);
    const manifest = resolve(path, 'package.json');
    if (existsSync(manifest)) {
      packageNames.set(path, JSON.parse(readFileSync(manifest, 'utf8')).name ?? '');
      break;
    }
    const parent = dirname(path);
    if (parent === path) {
      packageNames.set(path, '');
      break;
    }
    path = parent;
  }
  const name = packageNames.get(path);
  for (const entry of visited) packageNames.set(entry, name);
  return name;
};
const forbidden = (file) => {
  if (/(?:^|\/)(?:spec|test|tests|scripts)(?:\/|$)/.test(relative(root, file).split(sep).join('/'))) return false;
  const name = packageName(file);
  return (
    /^@searsuite\/sear-render(?:-|$)/.test(name) ||
    /^@searsuite\/sear-assembly-(?:core|setup|workbook)$/.test(name) ||
    name === '@searsuite/sear-sheet-editor-contract'
  );
};
const resolutionErrors = [
  ...program.getSyntacticDiagnostics(),
  ...program
    .getSemanticDiagnostics()
    .filter((diagnostic) => [2304, 2305, 2307, 2552, 2694, 7016].includes(diagnostic.code)),
].filter((diagnostic) => diagnostic.file && !diagnostic.file.fileName.includes('/node_modules/'));
if (resolutionErrors.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(resolutionErrors, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }),
  );
  process.exit(1);
}
const declarations = [];
const candidate = (node) =>
  ts.isClassDeclaration(node) ||
  ts.isClassExpression(node) ||
  ts.isInterfaceDeclaration(node) ||
  (ts.isTypeAliasDeclaration(node) && /Plugin$/.test(node.name.text));
const inheritsPlugin = (node, visited = new Set()) => {
  if (visited.has(node)) return false;
  visited.add(node);
  if (/Plugin$/.test(node.name?.text ?? '')) return true;
  for (const clause of node.heritageClauses ?? []) {
    for (const type of clause.types) {
      let symbol = checker.getSymbolAtLocation(type.expression);
      if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      if (symbol?.declarations?.some((declaration) => candidate(declaration) && inheritsPlugin(declaration, visited)))
        return true;
    }
  }
  return false;
};
const viewDeclarations = [];
const inheritsView = (node, visited = new Set()) => {
  if (visited.has(node)) return false;
  visited.add(node);
  if (['ViewExtensionBase', 'ViewExtension'].includes(node.name?.text)) return true;
  return (node.heritageClauses ?? []).some((clause) =>
    clause.types.some((type) => {
      let symbol = checker.getSymbolAtLocation(type.expression);
      if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      return symbol?.declarations?.some((declaration) => candidate(declaration) && inheritsView(declaration, visited));
    }),
  );
};
for (const file of program.getSourceFiles()) {
  if (!production(file.fileName)) continue;
  const visit = (node) => {
    if (candidate(node) && inheritsPlugin(node)) declarations.push(node);
    if (candidate(node) && inheritsView(node)) viewDeclarations.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
}
const dependencyCache = new Map();
const dependencies = (declaration) => {
  if (dependencyCache.has(declaration)) return dependencyCache.get(declaration);
  const result = new Set();
  const visit = (node) => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      let symbol = checker.getSymbolAtLocation(node);
      if (symbol?.flags & ts.SymbolFlags.Alias) {
        for (const imported of symbol.declarations ?? []) {
          let statement = imported;
          while (statement && !ts.isImportDeclaration(statement)) statement = statement.parent;
          if (!statement || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
          const resolved = ts.resolveModuleName(
            statement.moduleSpecifier.text,
            imported.getSourceFile().fileName,
            config.options,
            ts.sys,
          ).resolvedModule;
          if (resolved && forbidden(resolved.resolvedFileName)) {
            const source =
              program.getSourceFile(resolved.resolvedFileName) ??
              ts.createSourceFile(
                resolved.resolvedFileName,
                readFileSync(resolved.resolvedFileName, 'utf8'),
                ts.ScriptTarget.Latest,
                true,
              );
            result.add(source);
          }
        }
        symbol = checker.getAliasedSymbol(symbol);
      }
      for (const dependency of symbol?.declarations ?? []) {
        if (dependency !== declaration && !dependency.getSourceFile().fileName.includes('/node_modules/typescript/'))
          result.add(dependency);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration);
  dependencyCache.set(declaration, result);
  return result;
};
const viewHooks = new Set([
  'render',
  'dirtyRect',
  'onRender',
  'onMouseDown',
  'onMouseMove',
  'onMouseUp',
  'onDblClick',
  'initializeView',
  'destroyView',
  'onCoreInitialized',
  'registerCellVisualReaders',
  'onResize',
  'onScroll',
  'onClick',
  'registerKeyboardHandlers',
  'getPluginConfig',
  'getConfig',
]);
const describe = (node) => {
  const source = node.getSourceFile();
  const location = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${relative(root, source.fileName)}:${location.line + 1} ${
    node.name?.getText(source) ?? ts.SyntaxKind[node.kind]
  }`;
};
const violations = [];
for (const file of program.getSourceFiles()) {
  if (!production(file.fileName) || !forbidden(file.fileName) || !file.fileName.endsWith('/index.ts')) continue;
  const module = checker.getSymbolAtLocation(file);
  if (!module) continue;
  for (let symbol of checker.getExportsOfModule(module)) {
    const exportedName = symbol.name;
    if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    if (symbol.declarations?.some((node) => candidate(node) && inheritsPlugin(node)))
      violations.push(`${relative(root, file.fileName)}: composition entry point re-exports plugin ${exportedName}`);
  }
}
for (const plugin of declarations) {
  const pluginType = checker.getTypeAtLocation(plugin);
  const instanceType = pluginType.getConstructSignatures()[0]?.getReturnType() ?? pluginType;
  for (const member of instanceType.getProperties())
    if (viewHooks.has(member.name)) violations.push(`${describe(plugin)}: obsolete view hook ${member.name}`);
  const queue = [[plugin]],
    visited = new Set();
  while (queue.length) {
    const chain = queue.shift(),
      node = chain.at(-1);
    if (visited.has(node)) continue;
    visited.add(node);
    if (forbidden(node.getSourceFile().fileName)) {
      violations.push(chain.map(describe).join(' -> '));
      break;
    }
    if (
      /\/node_modules\//.test(node.getSourceFile().fileName) &&
      !packageName(node.getSourceFile().fileName).startsWith('@searsuite/')
    )
      continue;
    for (const dependency of dependencies(node)) if (!visited.has(dependency)) queue.push([...chain, dependency]);
  }
}
for (const view of viewDeclarations) {
  const type = checker.getTypeAtLocation(view);
  const instance = type.getConstructSignatures()[0]?.getReturnType() ?? type;
  for (const member of instance.getProperties())
    if (
      ['registerState', 'apply', 'registerCellStyles', 'projectTransaction', 'transactionOT', 'documentState'].includes(
        member.name,
      )
    )
      violations.push(`${describe(view)}: business state hook on view ${member.name}`);
}
for (const file of program.getSourceFiles()) {
  if (!production(file.fileName)) continue;
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const expression = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
      let symbol = checker.getSymbolAtLocation(expression);
      if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      const name = symbol?.name ?? expression.getText(file);
      if (/^create.*Headless(?:Workbook)?Editor$|^createSheetKernelEditor$|^createWorkbookRuntime$/.test(name)) {
        const input = node.arguments[0];
        if (input && ts.isObjectLiteralExpression(input))
          for (const property of input.properties) {
            const key = property.name?.getText(file).replace(/^['"]|['"]$/g, '');
            if (
              ['viewport', 'viewExtensions', 'sheetViews', 'embeddedEditor', 'presentation'].includes(key) ||
              (name === 'createHeadlessEditor' && key === 'documentState')
            )
              violations.push(`${describe(node)}: obsolete option ${key} on ${name}`);
          }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}
const result = {
  project,
  declarations: declarations.map(describe),
  viewDeclarations: viewDeclarations.map(describe),
  violations,
};
if (argument('--json')) writeFileSync(resolve(argument('--json')), JSON.stringify(result, null, 2) + '\n');
if (violations.length) {
  console.error('Plugin type boundary check failed:\n' + violations.join('\n'));
  process.exitCode = 1;
} else console.log(`Plugin type boundary check passed for ${declarations.length} declarations.`);
