export function resolveActiveSourceLine(sourceLines: number[], editorLine: number): number | null {
  const validLines = sourceLines.filter((line) => Number.isFinite(line) && line > 0);
  if (validLines.length === 0) return null;

  const targetLine = Number.isFinite(editorLine) ? Math.max(1, editorLine) : 1;
  let closestBefore: number | null = null;
  let firstAfter: number | null = null;

  validLines.forEach((line) => {
    if (line <= targetLine && (closestBefore === null || line > closestBefore)) {
      closestBefore = line;
    } else if (line > targetLine && (firstAfter === null || line < firstAfter)) {
      firstAfter = line;
    }
  });

  return closestBefore ?? firstAfter;
}

export function findActiveSourceElement(root: ParentNode, editorLine: number): HTMLElement | null {
  const anchors = Array.from(root.querySelectorAll<HTMLElement>('[data-source-line]'));
  const sourceLine = resolveActiveSourceLine(
    anchors.map((element) => Number(element.dataset.sourceLine)),
    editorLine,
  );
  if (sourceLine === null) return null;

  // Markdown-it emits outer containers before their nested content. Choosing
  // the first matching anchor highlights the complete quote/list/table block.
  return anchors.find((element) => Number(element.dataset.sourceLine) === sourceLine) ?? null;
}
