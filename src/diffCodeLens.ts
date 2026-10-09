import * as vscode from 'vscode';
import { StateManager } from './stateManager';
import { getDocumentHunks, isActiveHunkwiseDiffTab } from './documentHunks';

export class DiffCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private stateManager: StateManager) {}

  fire(): void {
    this._onDidChangeCodeLenses.fire();
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    // With inline decorations off, keep lenses only in the hunkwise diff tab.
    if (!this.stateManager.showInlineDecorations && !isActiveHunkwiseDiffTab(document.uri)) return [];

    const lenses: vscode.CodeLens[] = [];
    for (const { id, anchor } of getDocumentHunks(this.stateManager, document)) {
      // CodeLens renders above its line, so the anchor (first added line, or
      // the line after a deletion) puts the actions just above the change.
      const range = new vscode.Range(anchor.line, 0, anchor.line, 0);
      const args = [document.uri, id];
      lenses.push(
        new vscode.CodeLens(range, { title: '✓ Accept', command: 'hunkwise.acceptHunk', arguments: args }),
        new vscode.CodeLens(range, { title: '↺ Discard', command: 'hunkwise.discardHunk', arguments: args }),
        new vscode.CodeLens(range, { title: '⇄ Open diff', command: 'hunkwise.openHunkDiff', arguments: args }),
      );
    }
    return lenses;
  }
}
