import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeHunks } from '../diffEngine';
import {
  computeHunkAnchor, computeHunkAnchors, findHunkAtLine, findAdjacentHunk,
  removedSummary, deletionLabel, removedLinesMarkdown,
} from '../hunkAnchors';

/** Anchors for `current` diffed against `baseline`, using VS Code's line counting. */
function anchorsFor(baseline: string, current: string) {
  const lineCount = current.split('\n').length;
  const lastLineEmpty = current === '' || current.endsWith('\n');
  return computeHunkAnchors(computeHunks(baseline, current), lineCount, lastLineEmpty);
}

describe('computeHunkAnchor', () => {
  it('mixed hunk anchors to the first added line', () => {
    const [a] = anchorsFor('a\nb\nc\nd\n', 'a\nX\nY\nd\n');
    assert.deepEqual(a, { line: 1, added: { start: 1, end: 2 }, span: { start: 1, end: 2 } });
  });

  it('pure insertion anchors to the first added line', () => {
    const [a] = anchorsFor('a\nb\n', 'a\nNEW1\nNEW2\nb\n');
    assert.deepEqual(a, { line: 1, added: { start: 1, end: 2 }, span: { start: 1, end: 2 } });
  });

  it('pure insertion at end of file', () => {
    const [a] = anchorsFor('a\n', 'a\nb\n');
    assert.deepEqual(a, { line: 1, added: { start: 1, end: 1 }, span: { start: 1, end: 1 } });
  });

  it('pure deletion mid-file anchors to the following line, above', () => {
    const [a] = anchorsFor('a\nb\nc\nd\n', 'a\nd\n');
    assert.deepEqual(a, { line: 1, deletion: 'above', span: { start: 1, end: 1 } });
  });

  it('pure deletion at line 0 anchors to the new first line, above', () => {
    const [a] = anchorsFor('x\ny\na\nb\n', 'a\nb\n');
    assert.deepEqual(a, { line: 0, deletion: 'above', span: { start: 0, end: 0 } });
  });

  it('pure deletion at EOF (newline-terminated) anchors to the last real line, below', () => {
    const [a] = anchorsFor('a\nb\nc\n', 'a\n');
    assert.deepEqual(a, { line: 0, deletion: 'below', span: { start: 0, end: 0 } });
  });

  it('pure deletion at EOF without a trailing newline anchors to the last line, below', () => {
    // Hand-built: newStart points past the end of a 2-line document.
    const a = computeHunkAnchor(
      { oldStart: 3, oldLines: 1, newStart: 3, newLines: 0, removedContent: ['c'], addedContent: [] },
      2, false,
    );
    assert.deepEqual(a, { line: 1, deletion: 'below', span: { start: 1, end: 1 } });
  });

  it('deleting the whole file anchors to line 0, above', () => {
    const [a] = anchorsFor('a\nb\n', '');
    assert.deepEqual(a, { line: 0, deletion: 'above', span: { start: 0, end: 0 } });
  });

  it('clamps added spans to the document', () => {
    const a = computeHunkAnchor(
      { oldStart: 1, oldLines: 0, newStart: 2, newLines: 5, removedContent: [], addedContent: [] },
      3, true,
    );
    assert.deepEqual(a.added, { start: 1, end: 2 });
  });

  it('multiple hunks keep document order', () => {
    const anchors = anchorsFor('1\n2\n3\n4\n5\n6\n7\n', 'X\n2\n3\n5\n6\n7\nY\n');
    assert.deepEqual(anchors.map(a => a.line), [0, 3, 6]);
    assert.deepEqual(anchors.map(a => a.deletion), [undefined, 'above', undefined]);
  });
});

describe('findHunkAtLine / findAdjacentHunk', () => {
  const anchors = anchorsFor('1\n2\n3\n4\n5\n6\n7\n8\n9\n', 'A\nB\n3\n4\nC\n6\n7\n8\nD\n');
  // Hunks at lines 0-1, 4, 8

  it('finds the hunk containing a line', () => {
    assert.equal(findHunkAtLine(anchors, 1), 0);
    assert.equal(findHunkAtLine(anchors, 4), 1);
    assert.equal(findHunkAtLine(anchors, 3), -1);
  });

  it('next skips the current hunk and wraps', () => {
    assert.equal(findAdjacentHunk(anchors, 0, 'next'), 1);
    assert.equal(findAdjacentHunk(anchors, 5, 'next'), 2);
    assert.equal(findAdjacentHunk(anchors, 8, 'next'), 0);
  });

  it('prev skips the current hunk and wraps', () => {
    assert.equal(findAdjacentHunk(anchors, 8, 'prev'), 1);
    assert.equal(findAdjacentHunk(anchors, 4, 'prev'), 0);
    assert.equal(findAdjacentHunk(anchors, 1, 'prev'), 2);
  });

  it('returns -1 with no hunks', () => {
    assert.equal(findAdjacentHunk([], 0, 'next'), -1);
  });
});

describe('labels', () => {
  it('formats removed counts', () => {
    assert.equal(removedSummary(1), '−1 line');
    assert.equal(removedSummary(2), '−2 lines');
    assert.equal(deletionLabel(3, 'above'), '▸ 3 lines removed above');
    assert.equal(deletionLabel(1, 'below'), '▸ 1 line removed below');
  });

  it('renders removed lines as a diff block', () => {
    assert.equal(
      removedLinesMarkdown(['foo', 'bar']),
      '**Removed** (2 lines)\n\n```diff\n-foo\n-bar\n```\n',
    );
  });

  it('lengthens the fence past backtick runs in content', () => {
    const md = removedLinesMarkdown(['```js', 'x']);
    assert.ok(md.includes('\n````diff\n-```js\n-x\n````\n'));
  });
});
