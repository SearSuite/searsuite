const roots = [
  '@searsuite/sear-assembly-sheet-kernel',
  '@searsuite/sear-assembly-workbook-kernel',
  '@searsuite/sear-assembly-headless',
];
const presentation = (name) =>
  /^@searsuite\/sear-render(?:-|$)/.test(name) ||
  /^@searsuite\/sear-assembly-(?:core|setup|sheet-doc|workbook)$/.test(name) ||
  name === '@searsuite/sear-sheet-editor-contract';

/** Finds complete dependency paths that attach presentation to a business runtime. */
export function findKernelPresentationPaths(graph) {
  const violations = [];
  for (const root of roots) {
    if (!graph.has(root)) continue;
    const queue = [[root]],
      visited = new Set();
    while (queue.length) {
      const chain = queue.shift(),
        owner = chain.at(-1);
      if (visited.has(owner)) continue;
      visited.add(owner);
      if (presentation(owner)) {
        violations.push(chain);
        continue;
      }
      for (const target of graph.get(owner) ?? []) queue.push([...chain, target]);
    }
  }
  return violations;
}
