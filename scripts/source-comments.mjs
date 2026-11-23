import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const workspaceRoot = resolve(import.meta.dirname, '..');
const packagesRoot = resolve(workspaceRoot, 'packages');

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

export function packageSourceFiles({ publishedOnly = false } = {}) {
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('sear-'))
    .flatMap((entry) => {
      const directory = join(packagesRoot, entry.name);
      const manifestPath = join(directory, 'package.json');
      const sourceDirectory = join(directory, 'src');
      if (!existsSync(manifestPath) || !existsSync(sourceDirectory)) return [];
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      return publishedOnly && manifest.private ? [] : walk(sourceDirectory);
    });
}

export function publishedSourceFiles() {
  return packageSourceFiles({ publishedOnly: true });
}

export function commentsIn(file) {
  const source = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const ranges = new Map();
  const addRanges = (items) => {
    for (const item of items ?? []) ranges.set(`${item.pos}:${item.end}`, item);
  };
  const visit = (node) => {
    addRanges(ts.getLeadingCommentRanges(source, node.pos));
    addRanges(ts.getTrailingCommentRanges(source, node.end));
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const comments = [];
  for (const range of [...ranges.values()].sort((left, right) => left.pos - right.pos)) {
    comments.push({
      end: range.end,
      file,
      line: source.slice(0, range.pos).split('\n').length,
      start: range.pos,
      text: source.slice(range.pos, range.end),
    });
  }

  return comments;
}

export function cleanBlockComment(text) {
  return text
    .replace(/^\/\*\*?/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, '').replace(/\s+$/, ''))
    .join('\n')
    .trim();
}

export function workspacePath(file) {
  return relative(workspaceRoot, file);
}
