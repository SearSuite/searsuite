import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';

const packageRoot = join(process.cwd(), 'packages');
const violations = [];
const warnings = [];
const ignoredDirectories = new Set(['dist', 'node_modules']);
const transactionDefinitionPath = join(packageRoot, 'sear-domain-transaction', 'src', 'index.ts');
const domainOTSourceRoot = join(packageRoot, 'sear-domain-ot', 'src');
const semanticOTNamespaces = new Set(['MatrixOTActionName', 'RectOTActionName']);
const stateSubclassDeclarations = [];
const commandScopeOwners = new Set([
  'sear-assembly-commands/src/SheetCommandBus.ts',
  'sear-assembly-commands/src/DocCommandBus.ts',
  'sear-assembly-workbook-kernel/src/WorkbookCommandBus.ts',
  'sear-assembly-sheet-doc/src/SearCoreEditSession.ts',
]);

function createsSemanticOTDirectly(path, source) {
  if (path.startsWith(domainOTSourceRoot)) return false;
  if (!path.includes('/src/')) return false;
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  let violation = false;

  function visit(node) {
    if (violation) return;
    if (ts.isObjectLiteralExpression(node)) {
      const hasPath = node.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          ((ts.isIdentifier(property.name) && property.name.text === 'p') ||
            (ts.isStringLiteralLike(property.name) && property.name.text === 'p')),
      );
      const hasSemanticAction = node.properties.some((property) => {
        if (!ts.isPropertyAssignment(property) || !ts.isComputedPropertyName(property.name)) return false;
        const expression = property.name.expression;
        return (
          ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.expression) &&
          semanticOTNamespaces.has(expression.expression.text)
        );
      });
      if (hasPath && hasSemanticAction) {
        violation = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violation;
}

function collectStateSubclassDeclarations(path, sourceFile) {
  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name) {
      const extension = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]
        ?.expression;
      if (extension && ts.isIdentifier(extension)) {
        const privateFields = node.members.filter(
          (member) => ts.isPropertyDeclaration(member) && ts.isPrivateIdentifier(member.name),
        );
        stateSubclassDeclarations.push({
          name: node.name.text,
          parent: extension.text,
          path,
          privateFields: privateFields.map((field) => field.name.getText(sourceFile)),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function isPluginSource(path) {
  return /packages\/sear-plugin-[^/]+\/src\//.test(path);
}

function isPluginCommandContract(path) {
  return isPluginSource(path) && /Commands\.ts$/.test(path);
}

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.isFile() && path.endsWith('.ts')) {
      const source = await readFile(path, 'utf8');
      if (/\bcreateSheetTransactionBuilder\b/.test(source))
        violations.push(
          `${path}: createSheetTransactionBuilder is not allowed; command factories must create complete transactions from semantic input`,
        );
      if (/\bextends\s+(?:SheetOperationCommand|TransactionCommand)\b/.test(source))
        violations.push(
          `${path}: legacy command classes are not allowed; export typed definitions with defineSheetCommand`,
        );
      if (/\bexport\s+class\s+\w*TransactionCommand\b/.test(source))
        violations.push(`${path}: exported transaction command class shells are not allowed`);
      if (isPluginCommandContract(path)) {
        if (/\b(?:interface|type)\s+\w*(?:Command)?Input\b[\s\S]{0,500}\bTransaction\b/.test(source))
          violations.push(`${path}: sheet plugin command inputs must not expose Transaction`);
        if (/\b(?:interface|type)\s+\w*(?:Command)?Input\b[\s\S]{0,500}\bPipeline\b/.test(source))
          violations.push(`${path}: sheet plugin command inputs must not expose Pipeline`);
        if (
          /\btype\s+\w*CommandInput\s*=\s*\(\s*\)\s*=>/.test(source) ||
          /\breadonly\s+run\s*:\s*\(\s*\)\s*=>/.test(source)
        )
          violations.push(`${path}: sheet plugin command inputs must not expose callback wrapper actions`);
      }
      if (/\bnew\s+Transaction\s*\(/.test(source))
        violations.push(`${path}: plugin code must create sheet changes through @searsuite/sear-assembly-commands`);
      if (/\.dispatch\s*\(/.test(source))
        violations.push(`${path}: plugin code must dispatch through SheetCommandDispatcher`);
      if (/\bsearCore\.executePipeline\s*\(/.test(source))
        violations.push(`${path}: plugin code must execute interaction pipelines through SheetCommandBus`);
      if (/\b(?:this\.)?(?:commands|commandBus)\??\.execute\s*\(/.test(source))
        violations.push(
          `${path}: plugin commands must be registered as factories and invoked through SheetCommandBus.run`,
        );
      if (/\bthis\.commands\??\.register\s*\(/.test(source))
        warnings.push(
          `${path}: direct this.commands?.register(...) bypasses the plugin command lifecycle; use registerCommands(commands) instead`,
        );
      if (/\b(?:this\.)?(?:commands|commandBus)\??\.(?:register|run)\s*\(\s*['"`]/.test(source))
        violations.push(`${path}: plugin commands must use independently exported typed command definitions`);
    }
  }
}

async function visitProductionSource(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visitProductionSource(path);
      continue;
    }
    if (!entry.isFile() || !path.endsWith('.ts') || path.endsWith('.d.ts')) continue;
    const source = await readFile(path, 'utf8');
    if (path.includes('/src/'))
      collectStateSubclassDeclarations(path, ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true));
    if (
      path.includes('/src/') &&
      /\brunInsideCommandExecution\s*\(/.test(source) &&
      !commandScopeOwners.has(path.slice(packageRoot.length + 1)) &&
      path !== join(packageRoot, 'sear-assembly-core', 'src', 'CommandExecutionScope.ts')
    ) {
      violations.push(
        `${path}: only command buses and embedded edit-session components may open command execution scope`,
      );
    }
    if (path !== transactionDefinitionPath && /\bnew\s+Transaction(?:\s*<[^>]+>)?\s*\(/.test(source))
      violations.push(`${path}: Transaction must be created through createTransaction(...)`);
    if (createsSemanticOTDirectly(path, source))
      violations.push(`${path}: Sheet OT payloads must be created through exported semantic OT factories`);
    if (/\b(?:\w+\.)?commands\.execute\s*\(/.test(source) || /\bcommandBus\.execute\s*\(/.test(source))
      violations.push(`${path}: command buses do not expose execute(command); use commands.run(definition, input)`);
  }
}

async function visitCommandContracts(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visitCommandContracts(path);
    else if (entry.isFile() && path.endsWith('.ts')) {
      const source = await readFile(path, 'utf8');
      if (/\bcreateSheetTransactionBuilder\b/.test(source))
        violations.push(
          `${path}: createSheetTransactionBuilder is not allowed; command factories must create complete transactions from semantic input`,
        );
      if (/\bextends\s+(?:SheetOperationCommand|TransactionCommand)\b/.test(source))
        violations.push(
          `${path}: legacy command classes are not allowed; export typed definitions with defineSheetCommand`,
        );
      if (/\bexport\s+class\s+\w*TransactionCommand\b/.test(source))
        violations.push(`${path}: exported transaction command class shells are not allowed`);
      if (/\/(?:SheetCommandBus|DocCommandBus)\.ts$/.test(path) && /\bexecute\s*<[\s\S]*?\(\s*command\b/.test(source))
        violations.push(
          `${path}: command buses must not expose execute(command); route through run(definition, input)`,
        );
    }
  }
}

await visitProductionSource(packageRoot);

for (const entry of await readdir(packageRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.startsWith('sear-plugin-')) {
    const sourceDir = join(packageRoot, entry.name, 'src');
    try {
      await visit(sourceDir);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

await visitCommandContracts(join(packageRoot, 'sear-assembly-commands', 'src'));

const stateParents = new Map(stateSubclassDeclarations.map(({ name, parent }) => [name, parent]));
function extendsStateClass(name, root, seen = new Set()) {
  if (name === root) return true;
  if (seen.has(name)) return false;
  seen.add(name);
  const parent = stateParents.get(name);
  return parent ? extendsStateClass(parent, root, seen) : false;
}
for (const declaration of stateSubclassDeclarations) {
  if (!declaration.privateFields.length) continue;
  const stateType = extendsStateClass(declaration.parent, 'CSRMatrix')
    ? 'CSRMatrix'
    : extendsStateClass(declaration.parent, 'RichDocNode')
    ? 'RichDocNode'
    : null;
  if (!stateType) continue;
  violations.push(
    `${declaration.path}: ${stateType} state subclasses cannot store opaque private fields ` +
      `(${declaration.privateFields.join(', ')}); put derived caches outside committed state`,
  );
}

if (violations.length || warnings.length) {
  const diagnostics = [...violations, ...warnings.map((warning) => `Warning: ${warning}`)];
  console.error('Command boundary check failed:\n' + diagnostics.join('\n'));
  process.exit(1);
}
console.log('Command boundary check passed.');
