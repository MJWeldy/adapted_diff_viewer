import * as vscode from 'vscode';
import { StateManager } from './stateManager';
import { getDocumentHunks } from './documentHunks';
import { removedLinesMarkdown } from './hunkAnchors';

const HOVER_COMMANDS = ['hunkwise.acceptHunk', 'hunkwise.discardHunk', 'hunkwise.openHunkDiff'];

function commandLink(title: string, command: string, args: unknown[]): string {
  return `[${title}](command:${command}?${encodeURIComponent(JSON.stringify(args))})`;
}

/** Shows a hunk's removed lines and its actions when hovering anywhere on it. */
export class HunkHoverProvider implements vscode.HoverProvider {
  constructor(private stateManager: StateManager) {}

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    if (!this.stateManager.showInlineDecorations) return undefined;

    const match = getDocumentHunks(this.stateManager, document)
      .find(h => position.line >= h.anchor.span.start && position.line <= h.anchor.span.end);
    if (!match) return undefined;

    const { hunk, id, anchor } = match;
    // Pass the path, not the Uri: command-link args go through JSON.
    const args = [document.uri.fsPath, id];
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: HOVER_COMMANDS };
    if (hunk.removedContent.length > 0) {
      md.appendMarkdown(removedLinesMarkdown(hunk.removedContent));
    }
    md.appendMarkdown([
      commandLink('$(check) Accept', 'hunkwise.acceptHunk', args),
      commandLink('$(discard) Discard', 'hunkwise.discardHunk', args),
      commandLink('$(diff) Open diff', 'hunkwise.openHunkDiff', args),
    ].join(' &nbsp;|&nbsp; '));

    const end = document.lineAt(anchor.span.end).range.end;
    return new vscode.Hover(md, new vscode.Range(anchor.span.start, 0, end.line, end.character));
  }
}
