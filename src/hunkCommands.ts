import * as vscode from 'vscode';
import { StateManager } from './stateManager';
import { FileWatcher } from './fileWatcher';
import { acceptHunk, discardHunk, openDiffEditor } from './commands';
import { log } from './log';

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
      const filePath = toFilePath(target) ?? toFilePath(vscode.window.activeTextEditor?.document.uri);
      if (!filePath || !stateManager.getFile(filePath)) return;
      await openDiffEditor(stateManager, filePath, typeof id === 'string' ? id : undefined);
    }),
  );
}
