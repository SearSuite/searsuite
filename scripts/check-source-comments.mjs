import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cleanBlockComment,
  commentsIn,
  packageSourceFiles,
  publishedSourceFiles,
  workspacePath,
} from './source-comments.mjs';

const failures = [];
const placeholderPatterns = [/\bPublic .+ member for \w+\./, /\b\w+ runtime API\./];

const sourceFiles = packageSourceFiles();
for (const file of sourceFiles) {
  for (const comment of commentsIn(file)) {
    const text = cleanBlockComment(comment.text);
    if (/\p{Script=Han}/u.test(text)) {
      failures.push(`${workspacePath(file)}:${comment.line} contains Han characters in a source comment.`);
    }
    if (placeholderPatterns.some((pattern) => pattern.test(text))) {
      failures.push(
        `${workspacePath(file)}:${comment.line} contains placeholder documentation: ${text.split('\n')[0]}`,
      );
    }
  }
}

const packageIndexes = publishedSourceFiles().filter((file) => file.endsWith('/src/index.ts'));
for (const file of packageIndexes) {
  const source = readFileSync(file, 'utf8');
  if (!/@packageDocumentation\b/.test(source)) {
    failures.push(`${workspacePath(file)} is missing an @packageDocumentation comment.`);
  }
}

if (failures.length) {
  console.error(`Source documentation check failed with ${failures.length} issue(s):`);
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(
  `Checked English comments in ${sourceFiles.length} package source files and package documentation in ${packageIndexes.length} published packages.`,
);
