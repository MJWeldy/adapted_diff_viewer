import * as vscode from 'vscode';
import { StateManager } from './stateManager';
import { computeHunks, hunkId, ParsedHunk } from './diffEngine';
import { computeHunkAnchors, HunkAnchor } from './hunkAnchors';

export interface DocumentHunk {
  hunk: ParsedHunk;
  id: string;
  anchor: HunkAnchor;
}

/**
 * Pending hunks for a document under review, with their editor anchors.
 * Always recomputed from the live buffer so anchors follow user edits.
 */
export function getDocumentHunks(stateManager: StateManager, document: vscode.TextDocument): DocumentHunk[] {
  if (!stateManager.enabled || document.uri.scheme !== 'file') return [];
  const fileState = stateManager.getFile(document.uri.fsPath);
  if (!fileState || fileState.status !== 'reviewing') return [];

  const hunks = computeHunks(fileState.baseline, document.getText());
  const lastLineEmpty = document.lineAt(document.lineCount - 1).text.length === 0;
  const anchors = computeHunkAnchors(hunks, document.lineCount, lastLineEmpty);
  return hunks.map((hunk, i) => ({ hunk, id: hunkId(hunk), anchor: anchors[i] }));
}

/** True if a hunkwise baseline diff tab for this file is the active tab in some group. */
export function isActiveHunkwiseDiffTab(uri: vscode.Uri): boolean {
  const fsPath = uri.fsPath;
  for (const group of vscode.window.tabGroups.all) {
    const active = group.activeTab;
    if (active?.input instanceof vscode.TabInputTextDiff
      && active.input.original.scheme === 'hunkwise-baseline'
      && active.input.modified.fsPath === fsPath) {
      return true;
    }
  }
  return false;
}
