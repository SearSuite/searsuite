import { findKernelPresentationPaths } from './lib/kernel-package-boundaries.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { collectWorkspaceImports } from './collect-workspace-imports.mjs';

const workspaceRoot = process.cwd();
const packageRoots = ['packages'];
const workspacePackages = new Map();
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);
const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const foundationDiNamedImportPattern = /import\s*\{([^}]*)\}\s*from\s*['"]@searsuite\/sear-foundation-di['"]/g;

const foundationPackages = new Set([
  '@searsuite/sear-foundation-common',
  '@searsuite/sear-foundation-di',
  '@searsuite/sear-foundation-error',
  '@searsuite/sear-foundation-keymap',
  '@searsuite/sear-foundation-platform',
  '@searsuite/sear-foundation-range',
  '@searsuite/sear-foundation-rect',
  '@searsuite/sear-foundation-storage',
  '@searsuite/sear-foundation-subscription',
  '@searsuite/sear-foundation-theme',
  '@searsuite/sear-foundation-utils',
]);

const hostPackages = new Set(['@searsuite/sear-host-server-node']);

const forbiddenRules = [
  {
    id: 'state-domain-must-not-depend-on-presentation',
    message: 'The state kernel must remain independent of assembly, feature plugins, and rendering.',
    matches(source, target) {
      return (
        source === '@searsuite/sear-domain-state' &&
        (target.startsWith('@searsuite/sear-render') ||
          target.startsWith('@searsuite/sear-assembly') ||
          target.startsWith('@searsuite/sear-plugin'))
      );
    },
  },
  {
    id: 'foundation-must-not-depend-upward',
    message: 'Foundation packages must not depend on domain, render, assembly, plugin, or host packages.',
    matches(source, target) {
      return foundationPackages.has(source) && !foundationPackages.has(target);
    },
  },
  {
    id: 'cell-types-must-not-depend-on-rendering',
    message: 'Cell types define domain editing semantics and must not depend on rendering packages.',
    matches(source, target) {
      return source === '@searsuite/sear-domain-cell-types' && target.startsWith('@searsuite/sear-render-');
    },
  },
  {
    id: 'doc-domain-must-not-depend-on-rendering',
    message:
      'The Doc domain owns schema and runtime contracts; it must not depend on rendering, measurement, or host drawing.',
    matches(source, target) {
      return source === '@searsuite/sear-domain-doc' && target.startsWith('@searsuite/sear-render-');
    },
  },
  {
    id: 'cell-types-must-not-depend-on-cell-catalog',
    message: 'Cell types must not depend on the cell catalog; the cell package assembles that catalog.',
    matches(source, target) {
      return source === '@searsuite/sear-domain-cell-types' && target === '@searsuite/sear-domain-cell';
    },
  },
  {
    id: 'render-registry-must-not-depend-on-cell-catalog',
    message: 'The render registry must not depend on the cell package, to avoid a cycle with CellTypeCatalog.',
    matches(source, target) {
      return source === '@searsuite/sear-render-registry' && target === '@searsuite/sear-domain-cell';
    },
  },
  {
    id: 'formula-contract-must-not-depend-on-implementation',
    message: 'The formula engine contract must not depend on implementations, plugins, or rendering packages.',
    matches(source, target) {
      return (
        source === '@searsuite/sear-domain-formula-engine' &&
        (target === '@searsuite/sear-domain-formula-engine-ts' ||
          target === '@searsuite/sear-plugin-formula' ||
          target.startsWith('@searsuite/sear-plugin-') ||
          target.startsWith('@searsuite/sear-render-'))
      );
    },
  },
  {
    id: 'libraries-must-not-depend-on-hosts',
    message: 'The server host is a composition root; reusable packages must not depend on it.',
    matches(source, target) {
      return hostPackages.has(target);
    },
  },
];

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function collectWorkspacePackages() {
  for (const root of packageRoots) {
    const rootPath = join(workspaceRoot, root);
    if (!existsSync(rootPath)) continue;

    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = join(rootPath, entry.name);
      const packageJsonPath = join(directory, 'package.json');
      if (!existsSync(packageJsonPath)) continue;
      const packageJson = readJson(packageJsonPath);
      workspacePackages.set(packageJson.name, { directory, packageJson });
    }
  }
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

function collectManifestDependencies(packageJson) {
  const dependencies = new Set();
  for (const field of dependencyFields) {
    for (const dependency of Object.keys(packageJson[field] ?? {})) {
      dependencies.add(dependency);
    }
  }
  return dependencies;
}

function findViolations() {
  const violations = [];

  for (const [source, packageInfo] of workspacePackages) {
    const manifestDependencies = collectManifestDependencies(packageInfo.packageJson);
    for (const target of manifestDependencies) {
      inspectDependency(violations, source, target, `package.json`);
    }

    const sourceDirectory = join(packageInfo.directory, 'src');
    for (const filePath of collectSourceFiles(sourceDirectory)) {
      inspectForbiddenImports(violations, source, filePath);
      for (const target of collectWorkspaceImports(filePath)) {
        inspectDependency(violations, source, target, relative(workspaceRoot, filePath));
      }
    }

    const specDirectory = join(packageInfo.directory, 'spec');
    for (const filePath of collectSourceFiles(specDirectory)) {
      inspectForbiddenImports(violations, source, filePath);
    }
  }

  inspectBusinessPluginDependencies(violations);
  inspectRuntimeCapabilityContracts(violations);
  inspectDocFeaturePluginLayout(violations);
  inspectSetupFeaturePluginLayout(violations);
  inspectFlatFeaturePluginFiles(violations);

  return violations;
}

function inspectBusinessPluginDependencies(violations) {
  const neutralAssemblies = new Set(
    [
      'sear-assembly-plugin',
      'sear-assembly-commands',
      'sear-assembly-doc',
      'sear-assembly-sheet-state',
      'sear-assembly-workbook-kernel',
    ].map((name) => `@searsuite/${name}`),
  );
  const graph = new Map();
  for (const [name, info] of workspacePackages) {
    const edges = new Set(
      Object.keys({
        ...info.packageJson.dependencies,
        ...info.packageJson.peerDependencies,
        ...info.packageJson.optionalDependencies,
      }),
    );
    for (const file of collectSourceFiles(join(info.directory, 'src'))) {
      for (const target of collectWorkspaceImports(file)) edges.add(target);
    }
    graph.set(name, edges);
  }
  for (const source of graph.keys()) {
    if (!source.startsWith('@searsuite/sear-plugin-') && !neutralAssemblies.has(source)) continue;
    const queue = [[source]],
      visited = new Set([source]);
    while (queue.length) {
      const chain = queue.shift(),
        current = chain[chain.length - 1];
      for (const target of graph.get(current) ?? []) {
        if (visited.has(target)) continue;
        visited.add(target);
        const path = [...chain, target];
        if (
          target.startsWith('@searsuite/sear-render') ||
          target === '@searsuite/sear-assembly-core' ||
          target === '@searsuite/sear-assembly-setup' ||
          target === '@searsuite/sear-assembly-workbook' ||
          target === '@searsuite/sear-sheet-editor-contract'
        ) {
          violations.push({
            source,
            target,
            location: path.join(' -> '),
            rule: {
              id: 'business-plugins-must-be-independent-of-presentation',
              message:
                'State owners and their runtime dependencies must use neutral state, command, query and observation contracts.',
            },
          });
        } else queue.push(path);
      }
    }
  }
}

function inspectRuntimeCapabilityContracts(violations) {
  const commonRegistry = 'packages/sear-assembly-plugin/src/RuntimeCapability.ts';
  const editorRegistries = [
    'packages/sear-assembly-commands/src/SheetRuntimeExtensionRegistry.ts',
    'packages/sear-assembly-doc/src/plugin/DocRuntimeExtensionRegistry.ts',
    'packages/sear-assembly-workbook-kernel/src/WorkbookRuntimeExtensionRegistry.ts',
  ];
  for (const location of editorRegistries) {
    const contents = readFileSync(join(workspaceRoot, location), 'utf8');
    if (contents.includes('RuntimeCapabilityRegistry') && !contents.includes('new Map<')) continue;
    violations.push({
      source: location,
      target: commonRegistry,
      location,
      rule: {
        id: 'editors-must-share-runtime-capability-registry',
        message:
          'Sheet, Doc, and Workbook service facades must share the assembly-plugin registry rather than maintain separate storage.',
      },
    });
  }
}

function inspectDocFeaturePluginLayout(violations) {
  const docAssemblySource = join(workspaceRoot, 'packages/sear-assembly-doc/src');
  for (const filePath of collectSourceFiles(docAssemblySource)) {
    const location = relative(workspaceRoot, filePath);
    if (!/\/Default[^/]*\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/.test(location)) continue;
    violations.push({
      source: '@searsuite/sear-assembly-doc',
      target: 'doc-feature-plugin-layout',
      location,
      rule: {
        id: 'doc-feature-logic-must-live-in-feature-folders',
        message:
          'Doc inline/block feature logic must live under inlinePlugin/<feature>/ or blockPlugin/<feature>/; do not add Default* files that mix multiple feature implementations, contribution factories or mutation policies.',
      },
    });
  }
}

function inspectSetupFeaturePluginLayout(violations) {
  const setupSource = join(workspaceRoot, 'packages/sear-assembly-setup/src');
  for (const filePath of collectSourceFiles(setupSource)) {
    const location = relative(workspaceRoot, filePath);
    if (/\/features\//.test(location)) {
      violations.push({
        source: '@searsuite/sear-assembly-setup',
        target: 'setup-feature-plugin-layout',
        location,
        rule: {
          id: 'setup-feature-plugins-must-live-in-feature-folders',
          message:
            'Assembly setup runtime plugins must live under doc/runtimePlugin/<feature>/ or sheet/runtimePlugin/<feature>/; do not keep a flat features directory.',
        },
      });
    }
    if (/packages\/sear-assembly-setup\/src\/(?:doc|sheet)\/[^/]+Plugin\.ts$/.test(location)) {
      violations.push({
        source: '@searsuite/sear-assembly-setup',
        target: 'setup-feature-plugin-layout',
        location,
        rule: {
          id: 'setup-feature-plugins-must-live-in-feature-folders',
          message:
            'Assembly setup runtime plugin implementations must live in a dedicated runtimePlugin/<feature>/ folder, not as flat doc/sheet files.',
        },
      });
    }
  }
}

function inspectFlatFeaturePluginFiles(violations) {
  const allowedFlatPluginFiles = new Set([
    'packages/sear-assembly-core/src/DocInputPlugin.ts',
    'packages/sear-assembly-plugin/src/Plugin.ts',
  ]);
  for (const [source, packageInfo] of workspacePackages) {
    if (!source.includes('plugin') && source !== '@searsuite/sear-render') continue;
    const sourceDirectory = join(packageInfo.directory, 'src');
    for (const filePath of collectSourceFiles(sourceDirectory)) {
      const location = relative(workspaceRoot, filePath);
      if (allowedFlatPluginFiles.has(location)) continue;
      if (/\/src\/features\//.test(location)) {
        violations.push({
          source,
          target: 'feature-plugin-layout',
          location,
          rule: {
            id: 'feature-plugins-must-not-use-flat-features-directories',
            message:
              'Feature plugin code must live in a dedicated feature folder; do not add generic flat src/features directories.',
          },
        });
      }
      if (!/\/src\/[^/]+Plugin\.tsx?$/.test(location)) continue;
      violations.push({
        source,
        target: 'feature-plugin-layout',
        location,
        rule: {
          id: 'feature-plugin-implementations-must-live-in-feature-folders',
          message:
            'Concrete feature plugin implementations must live in a dedicated feature folder instead of being flat package-root source files.',
        },
      });
    }
  }
}

function inspectForbiddenImports(violations, source, filePath) {
  const contents = readFileSync(filePath, 'utf8');
  if (
    source === '@searsuite/sear-plugin-collab' &&
    filePath.includes(`${join('sear-plugin-collab', 'src')}`) &&
    /\b(?:MatrixOT(?:ActionName)?|MatrixTransactionOT|RichDocOT|RichDocTransactionOT)\b/.test(contents)
  ) {
    violations.push({
      source,
      target: '@searsuite/sear-domain-ot#concrete-family',
      location: relative(workspaceRoot, filePath),
      rule: {
        id: 'collaboration-plugin-must-use-open-ot-registry',
        message:
          'Collaboration plugins must use the open OT definition and relation registry, not branch on concrete OT families.',
      },
    });
  }
  foundationDiNamedImportPattern.lastIndex = 0;
  let importMatch = foundationDiNamedImportPattern.exec(contents);
  let importsGlobalContainer = false;
  while (importMatch) {
    importsGlobalContainer = importMatch[1]
      .split(',')
      .map((specifier) => specifier.trim().replace(/^type\s+/, ''))
      .some((specifier) => /^container(?:\s+as\s+[A-Za-z_$][\w$]*)?$/.test(specifier));
    if (importsGlobalContainer) break;
    importMatch = foundationDiNamedImportPattern.exec(contents);
  }
  if (!importsGlobalContainer) return;
  violations.push({
    source,
    target: '@searsuite/sear-foundation-di#container',
    location: relative(workspaceRoot, filePath),
    rule: {
      id: 'global-di-container-is-forbidden',
      message:
        'Do not import a process-wide DI container; each composition root or test must create and own its Container.',
    },
  });
}

function collectPackageDependencyGraph() {
  const graph = new Map();

  for (const [source, packageInfo] of workspacePackages) {
    const dependencies = new Set();
    for (const target of collectManifestDependencies(packageInfo.packageJson)) {
      if (source !== target && workspacePackages.has(target)) dependencies.add(target);
    }

    const sourceDirectory = join(packageInfo.directory, 'src');
    for (const filePath of collectSourceFiles(sourceDirectory)) {
      for (const target of collectWorkspaceImports(filePath)) {
        if (source !== target && workspacePackages.has(target)) dependencies.add(target);
      }
    }

    graph.set(source, dependencies);
  }

  return graph;
}

function findDependencyCycles() {
  const graph = collectPackageDependencyGraph();
  const indexByPackage = new Map();
  const lowlinkByPackage = new Map();
  const stack = [];
  const stacked = new Set();
  const cycles = [];
  let nextIndex = 0;

  function visit(source) {
    indexByPackage.set(source, nextIndex);
    lowlinkByPackage.set(source, nextIndex);
    nextIndex += 1;
    stack.push(source);
    stacked.add(source);

    for (const target of graph.get(source) ?? []) {
      if (!indexByPackage.has(target)) {
        visit(target);
        lowlinkByPackage.set(source, Math.min(lowlinkByPackage.get(source), lowlinkByPackage.get(target)));
      } else if (stacked.has(target)) {
        lowlinkByPackage.set(source, Math.min(lowlinkByPackage.get(source), indexByPackage.get(target)));
      }
    }

    if (lowlinkByPackage.get(source) !== indexByPackage.get(source)) return;

    const component = [];
    let current;
    do {
      current = stack.pop();
      stacked.delete(current);
      component.push(current);
    } while (current !== source);

    if (component.length > 1) cycles.push(component.sort());
  }

  for (const source of [...graph.keys()].sort()) {
    if (!indexByPackage.has(source)) visit(source);
  }

  return cycles.sort((left, right) => left[0].localeCompare(right[0]));
}

function inspectDependency(violations, source, target, location) {
  if (source === target || (!workspacePackages.has(target) && !hostPackages.has(target))) return;
  for (const rule of forbiddenRules) {
    if (rule.matches(source, target)) {
      violations.push({ source, target, location, rule });
    }
  }
}

function main() {
  collectWorkspacePackages();
  const violations = findViolations();
  const cycles = findDependencyCycles();
  const presentationPaths = findKernelPresentationPaths(collectPackageDependencyGraph());
  if (!violations.length && !cycles.length && !presentationPaths.length) {
    console.log('Architecture dependency check passed.');
    return;
  }

  console.error('Architecture dependency check failed:');
  for (const chain of presentationPaths)
    console.error(`- [business-runtime-must-not-depend-on-presentation] ${chain.join(' -> ')}`);
  for (const violation of violations) {
    console.error(`- [${violation.rule.id}] ${violation.source} -> ${violation.target} (${violation.location})`);
    console.error(`  ${violation.rule.message}`);
  }
  for (const cycle of cycles) {
    console.error(`- [workspace-packages-must-be-acyclic] ${cycle.join(' -> ')}`);
    console.error('  Workspace packages must form an acyclic build graph across package.json and src imports.');
  }
  process.exitCode = 1;
}

main();
