import * as vscode from 'vscode';
import { StateManager } from './stateManager';
import { FileWatcher } from './fileWatcher';
import { acceptHunk, discardHunk, openDiffEditor, acceptFileByPath, discardFileByPath } from './commands';
import { getDocumentHunks, DocumentHunk } from './documentHunks';
import { findHunkAtLine, findAdjacentHunk } from './hunkAnchors';
import { log } from './log';

const CONTEXT_DEBOUNCE_MS = 100;

export interface HunkActionHooks {
  onStateChanged: () => void;
  fireBaselineChange: (filePath: string) => void;
  closeStaleTabs: () => Promise<void>;
}

/** Accepts a Uri (CodeLens) or an fsPath string (hover links, tests). */
export function toFilePath(target: unknown): string | undefined {
  if (target instanceof vscode.Uri) return target.scheme === 'file' ? target.fsPath : undefined;
  if (typeof target === 'string' && target.length > 0) return target;
  return undefined;
}

function hunkAtCursor(stateManager: StateManager, editor: vscode.TextEditor): DocumentHunk | undefined {
  const hunks = getDocumentHunks(stateManager, editor.document);
  const i = findHunkAtLine(hunks.map(h => h.anchor), editor.selection.active.line);
  return i === -1 ? undefined : hunks[i];
}

function noHunkAtCursor(): void {
  vscode.window.setStatusBarMessage('hunkwise: no hunk at cursor', 3000);
}

/** Maintains the `hunkwise.hasHunks` context key for the active editor (gates keybindings/menus). */
export class HasHunksContext implements vscode.Disposable {
  private current: boolean | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private stateManager: StateManager) {}

  update(): void {
    const editor = vscode.window.activeTextEditor;
    const value = !!editor && getDocumentHunks(this.stateManager, editor.document).length > 0;
    if (value === this.current) return;
    this.current = value;
    void vscode.commands.executeCommand('setContext', 'hunkwise.hasHunks', value);
  }

  /** Debounced update for typing. */
  scheduleUpdate(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; this.update(); }, CONTEXT_DEBOUNCE_MS);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}

/**
 * Per-hunk editor commands: `hunkwise.acceptHunk(uri|path, hunkId)`,
 * `hunkwise.discardHunk(uri|path, hunkId)`, `hunkwise.openHunkDiff(uri|path, hunkId?)`.
 */
export function registerHunkCommands(
  context: vscode.ExtensionContext,
  stateManager: StateManager,
  fileWatcher: FileWatcher,
  hooks: HunkActionHooks,
): void {
  const closeTabs = () => { void hooks.closeStaleTabs().catch(err => log(`closeStaleTabs: ${err}`)); };
  const afterAccept = (filePath: string) => { hooks.onStateChanged(); hooks.fireBaselineChange(filePath); closeTabs(); };
  const afterDiscard = () => { hooks.onStateChanged(); closeTabs(); };

  context.subscriptions.push(
    vscode.commands.registerCommand('hunkwise.acceptHunk', (target: unknown, id: unknown) => {
      const filePath = toFilePath(target);
      if (!filePath || typeof id !== 'string') return;
      acceptHunk(stateManager, filePath, id, () => afterAccept(filePath), 'command');
    }),
    vscode.commands.registerCommand('hunkwise.discardHunk', async (target: unknown, id: unknown) => {
      const filePath = toFilePath(target);
      if (!filePath || typeof id !== 'string') return;
      await discardHunk(stateManager, fileWatcher, filePath, id, afterDiscard, 'command');
    }),
    vscode.commands.registerCommand('hunkwise.openHunkDiff', async (target: unknown, id: unknown) => {
      const editor = vscode.window.activeTextEditor;
      const filePath = toFilePath(target) ?? toFilePath(editor?.document.uri);
      if (!filePath || !stateManager.getFile(filePath)) return;
      // From the palette/context menu: open at the hunk under the cursor, if any.
      let hunk = typeof id === 'string' ? id : undefined;
      if (!hunk && editor && editor.document.uri.fsPath === filePath) {
        hunk = hunkAtCursor(stateManager, editor)?.id;
      }
      await openDiffEditor(stateManager, filePath, hunk);
    }),

    // ── Keyboard / context-menu fallbacks (work with editor.codeLens off) ──
    vscode.commands.registerCommand('hunkwise.nextHunk', () => revealAdjacent('next')),
    vscode.commands.registerCommand('hunkwise.prevHunk', () => revealAdjacent('prev')),
    vscode.commands.registerCommand('hunkwise.acceptHunkAtCursor', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const filePath = editor.document.uri.fsPath;
      const hunk = hunkAtCursor(stateManager, editor);
      if (!hunk) { noHunkAtCursor(); return; }
      acceptHunk(stateManager, filePath, hunk.id, () => afterAccept(filePath), 'keyboard');
    }),
    vscode.commands.registerCommand('hunkwise.discardHunkAtCursor', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const hunk = hunkAtCursor(stateManager, editor);
      if (!hunk) { noHunkAtCursor(); return; }
      await discardHunk(stateManager, fileWatcher, editor.document.uri.fsPath, hunk.id, afterDiscard, 'keyboard');
    }),
    // Context-menu invocations pass the editor's resource Uri.
    vscode.commands.registerCommand('hunkwise.acceptAllInFile', (target: unknown) => {
      const filePath = toFilePath(target) ?? toFilePath(vscode.window.activeTextEditor?.document.uri);
      if (!filePath) return;
      acceptFileByPath(stateManager, filePath, () => afterAccept(filePath));
    }),
    vscode.commands.registerCommand('hunkwise.discardAllInFile', async (target: unknown) => {
      const filePath = toFilePath(target) ?? toFilePath(vscode.window.activeTextEditor?.document.uri);
      if (!filePath) return;
      await discardFileByPath(stateManager, fileWatcher, filePath, afterDiscard);
    }),
  );

  function revealAdjacent(direction: 'next' | 'prev'): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const hunks = getDocumentHunks(stateManager, editor.document);
    const i = findAdjacentHunk(hunks.map(h => h.anchor), editor.selection.active.line, direction);
    if (i === -1) return;
    const pos = new vscode.Position(hunks[i].anchor.span.start, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}
