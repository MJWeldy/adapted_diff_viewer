import * as vscode from 'vscode';
import * as path from 'path';
import assert from 'assert';
import {
  getWorkspaceRoot, gitGetBaseline,
  sleep, waitForCondition, enableHunkwise, disableHunkwise,
  writeFileExternally, cleanWorkspace, getStateManager,
} from './helpers';
import { computeHunks } from '../../diffEngine';

suite('hunkwise CodeLens / hover / keyboard integration', function () {
  this.timeout(30000);

  setup(function () {
    cleanWorkspace();
  });

  teardown(async function () {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    try { await disableHunkwise(); } catch { /* ignore */ }
    cleanWorkspace();
  });

  async function setupReviewingFile(filename: string, baseline: string, modified: string): Promise<string> {
    const root = getWorkspaceRoot();
    const filePath = path.join(root, filename);

    writeFileExternally(filePath, baseline);
    await enableHunkwise();
    await waitForCondition(() => gitGetBaseline(root, path.relative(root, filePath)) === baseline, 5000);

    writeFileExternally(filePath, modified);
    const sm = getStateManager();
    await waitForCondition(() => sm.getFile(filePath)?.status === 'reviewing', 5000);
    return filePath;
  }

  async function openAndWait(filePath: string, expectedText: string): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const editor = await vscode.window.showTextDocument(doc);
    await waitForCondition(() => doc.getText() === expectedText, 5000);
    await sleep(200);
    return editor;
  }

  async function hunkwiseLenses(filePath: string): Promise<vscode.CodeLens[]> {
    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider', vscode.Uri.file(filePath)
    );
    return (lenses ?? []).filter(l => l.command?.command.startsWith('hunkwise.'));
  }

  // Baseline 1..9; modified has a mixed hunk, a pure deletion and a pure insertion.
  const BASELINE = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].join('\n') + '\n';
  const MODIFIED = ['ONE', '2', '3', '5', '6', '7', '8', 'NEW', '9'].join('\n') + '\n';

  test('CodeLens count matches hunk count for a modified file', async () => {
    const filePath = await setupReviewingFile('lens-count.txt', BASELINE, MODIFIED);
    await openAndWait(filePath, MODIFIED);

    const hunks = computeHunks(getStateManager().getFile(filePath).baseline, MODIFIED);
    assert.strictEqual(hunks.length, 3, 'test sanity: expected 3 hunks');

    const lenses = await hunkwiseLenses(filePath);
    const byCommand = (c: string) => lenses.filter(l => l.command?.command === c);
    assert.strictEqual(byCommand('hunkwise.acceptHunk').length, hunks.length);
    assert.strictEqual(byCommand('hunkwise.discardHunk').length, hunks.length);
    assert.strictEqual(byCommand('hunkwise.openHunkDiff').length, hunks.length);

    // One lens line per hunk: mixed at line 0, deletion above "5" (line 3), insertion at line 7
    const lines = [...new Set(lenses.map(l => l.range.start.line))].sort((a, b) => a - b);
    assert.deepStrictEqual(lines, [0, 3, 7]);
  });

  test('CodeLens accept command accepts only that hunk', async () => {
    const filePath = await setupReviewingFile('lens-accept.txt', BASELINE, MODIFIED);
    await openAndWait(filePath, MODIFIED);

    const accept = (await hunkwiseLenses(filePath)).find(l => l.command?.command === 'hunkwise.acceptHunk')!;
    await vscode.commands.executeCommand(accept.command!.command, ...(accept.command!.arguments ?? []));

    const sm = getStateManager();
    await waitForCondition(() => computeHunks(sm.getFile(filePath).baseline, MODIFIED).length === 2, 5000);
    assert.strictEqual((await hunkwiseLenses(filePath)).filter(l => l.command?.command === 'hunkwise.acceptHunk').length, 2);
  });

  test('hover shows removed lines for mixed hunks and pure deletions', async () => {
    const filePath = await setupReviewingFile('hover.txt', BASELINE, MODIFIED);
    await openAndWait(filePath, MODIFIED);
    const uri = vscode.Uri.file(filePath);

    const hoverText = async (line: number) => {
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider', uri, new vscode.Position(line, 0)
      );
      return (hovers ?? []).flatMap(h => h.contents.map(c => typeof c === 'string' ? c : c.value)).join('\n');
    };

    assert.ok((await hoverText(0)).includes('-1'), 'mixed hunk hover shows removed "1"');
    assert.ok((await hoverText(3)).includes('-4'), 'deletion hover shows removed "4"');
    assert.ok(!(await hoverText(1)).includes('**Removed**'), 'no hunkwise hover on unchanged line');
  });

  test('keyboard commands navigate and act on the hunk at the cursor', async () => {
    const filePath = await setupReviewingFile('keys.txt', BASELINE, MODIFIED);
    const editor = await openAndWait(filePath, MODIFIED);

    editor.selection = new vscode.Selection(0, 0, 0, 0);
    await vscode.commands.executeCommand('hunkwise.nextHunk');
    assert.strictEqual(editor.selection.active.line, 3);
    await vscode.commands.executeCommand('hunkwise.nextHunk');
    assert.strictEqual(editor.selection.active.line, 7);
    await vscode.commands.executeCommand('hunkwise.prevHunk');
    assert.strictEqual(editor.selection.active.line, 3);

    // Discard the pure deletion at the cursor: "4" comes back
    await vscode.commands.executeCommand('hunkwise.discardHunkAtCursor');
    await waitForCondition(() => editor.document.lineAt(3).text === '4', 5000);

    // Accept everything left in the file
    await vscode.commands.executeCommand('hunkwise.acceptAllInFile', vscode.Uri.file(filePath));
    const sm = getStateManager();
    await waitForCondition(() => sm.getFile(filePath)?.status !== 'reviewing', 5000);
    assert.strictEqual((await hunkwiseLenses(filePath)).length, 0);
  });
});
