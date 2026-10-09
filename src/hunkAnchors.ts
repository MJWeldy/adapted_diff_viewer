import type { ParsedHunk } from './diffEngine';

// Pure layout helpers for the editor UI (CodeLens, decorations, hover, cursor
// commands). No vscode dependency so they can be unit-tested in plain Node.

/** Inclusive 0-based line span. */
export interface LineSpan {
  start: number;
  end: number;
}

export interface HunkAnchor {
  /** 0-based line where the CodeLens, removed-lines marker and gutter icon attach. */
  line: number;
  /** 0-based added lines in the current document; undefined for a pure deletion. */
  added?: LineSpan;
  /** Pure deletion only: whether the removed lines sat above or below `line`. */
  deletion?: 'above' | 'below';
  /** Lines that count as "inside" the hunk for hover and cursor commands. */
  span: LineSpan;
}

/**
 * Compute where a hunk is anchored in the current document.
 *
 * @param lineCount      document line count (VS Code always reports >= 1)
 * @param lastLineEmpty  whether the document's last line is empty, i.e. the
 *                       file ends with a newline
 */
export function computeHunkAnchor(hunk: ParsedHunk, lineCount: number, lastLineEmpty: boolean): HunkAnchor {
  const lastLine = Math.max(0, lineCount - 1);
  const clamp = (n: number) => Math.min(Math.max(0, n), lastLine);

  if (hunk.newLines > 0) {
    const start = clamp(hunk.newStart - 1);
    const end = clamp(hunk.newStart - 1 + hunk.newLines - 1);
    return { line: start, added: { start, end }, span: { start, end } };
  }

  // Pure deletion: newStart is the line that now follows the removed block.
  const target = hunk.newStart - 1;
  let line: number;
  let deletion: 'above' | 'below';
  if (target > lastLine) {
    line = lastLine;
    deletion = 'below';
  } else if (target === lastLine && lastLineEmpty && target > 0) {
    // Deleted at EOF of a newline-terminated file: target is the phantom empty
    // line after the final newline, so anchor to the last real line instead.
    line = target - 1;
    deletion = 'below';
  } else {
    line = Math.max(0, target);
    deletion = 'above';
  }
  return { line, deletion, span: { start: line, end: line } };
}

export function computeHunkAnchors(hunks: ParsedHunk[], lineCount: number, lastLineEmpty: boolean): HunkAnchor[] {
  return hunks.map(h => computeHunkAnchor(h, lineCount, lastLineEmpty));
}

/** Index of the hunk whose span contains `line`, or -1. */
export function findHunkAtLine(anchors: HunkAnchor[], line: number): number {
  return anchors.findIndex(a => line >= a.span.start && line <= a.span.end);
}

/**
 * Index of the next (or previous) hunk relative to `line`, wrapping around.
 * A hunk containing `line` is skipped so repeated invocations advance.
 */
export function findAdjacentHunk(anchors: HunkAnchor[], line: number, direction: 'next' | 'prev'): number {
  if (anchors.length === 0) return -1;
  if (direction === 'next') {
    const i = anchors.findIndex(a => a.span.start > line);
    return i === -1 ? 0 : i;
  }
  for (let i = anchors.length - 1; i >= 0; i--) {
    if (anchors[i].span.end < line) return i;
  }
  return anchors.length - 1;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** After-text on the first added line of a mixed hunk, e.g. `−2 lines`. */
export function removedSummary(count: number): string {
  return `−${plural(count, 'line')}`;
}

/** After-text on a pure deletion's anchor line, e.g. `▸ 3 lines removed above`. */
export function deletionLabel(count: number, where: 'above' | 'below'): string {
  return `▸ ${plural(count, 'line')} removed ${where}`;
}

/**
 * Markdown showing removed lines as a ```diff block. The fence is longer than
 * any backtick run in the content so removed Markdown can't break out of it.
 */
export function removedLinesMarkdown(lines: string[]): string {
  const longestRun = Math.max(0, ...lines.map(l => Math.max(0, ...(l.match(/`+/g) ?? []).map(r => r.length))));
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  const body = lines.map(l => `-${l}`).join('\n');
  return `**Removed** (${plural(lines.length, 'line')})\n\n${fence}diff\n${body}\n${fence}\n`;
}
