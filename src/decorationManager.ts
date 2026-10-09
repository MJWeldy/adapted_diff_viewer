import * as vscode from 'vscode';
import { StateManager } from './stateManager';
import { computeHunks } from './diffEngine';
import { computeHunkAnchors, removedSummary, deletionLabel } from './hunkAnchors';

const REFRESH_DEBOUNCE_MS = 100;

// Shared style for the "−N lines" / "▸ N lines removed" after-text.
const removedTextStyle: vscode.ThemableDecorationAttachmentRenderOptions = {
  color: new vscode.ThemeColor('editorGutter.deletedBackground'),
  fontStyle: 'italic',
  margin: '0 0 0 3em',
};

export class DecorationManager {
  // Added lines: green background + overview ruler mark
  private readonly addedLine: vscode.TextEditorDecorationType;
  // Mixed hunk: "−N lines" after the first added line
  private readonly removedMarker: vscode.TextEditorDecorationType;
  // Pure deletion: red gutter triangle + "▸ N lines removed above/below"
  private readonly deletionMarker: vscode.TextEditorDecorationType;

  private pendingDocs = new Set<string>();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private stateManager: StateManager, extensionUri: vscode.Uri) {
    this.addedLine = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
      isWholeLine: true,
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    this.removedMarker = vscode.window.createTextEditorDecorationType({
      after: removedTextStyle,
    });
    this.deletionMarker = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(extensionUri, 'media', 'deleted-marker.svg'),
      gutterIconSize: 'contain',
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      after: removedTextStyle,
    });
  }

  refresh(editors?: readonly vscode.TextEditor[]): void {
    const targets = editors ?? vscode.window.visibleTextEditors;
    const diffPaths = this.diffEditorFilePaths();
    for (const editor of targets) {
      this.applyToEditor(editor, diffPaths);
    }
  }

  /** Debounced refresh of every visible editor showing `document` (used on typing). */
  scheduleRefresh(document: vscode.TextDocument): void {
    this.pendingDocs.add(document.uri.toString());
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      const docs = this.pendingDocs;
      this.pendingDocs = new Set();
      this.refresh(vscode.window.visibleTextEditors.filter(e => docs.has(e.document.uri.toString())));
    }, REFRESH_DEBOUNCE_MS);
  }

  /**
   * Collect file paths that are open in any diff tab (git, hunkwise, etc.).
   */
  private diffEditorFilePaths(): Set<string> {
    const paths = new Set<string>();
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputTextDiff) {
          paths.add(tab.input.modified.fsPath);
        }
      }
    }
    return paths;
  }

  private clear(editor: vscode.TextEditor): void {
    editor.setDecorations(this.addedLine, []);
    editor.setDecorations(this.removedMarker, []);
    editor.setDecorations(this.deletionMarker, []);
  }

  private applyToEditor(editor: vscode.TextEditor, diffPaths: Set<string>): void {
    if (editor.document.uri.scheme !== 'file') return;
    const filePath = editor.document.uri.fsPath;
    const fileState = this.stateManager.getFile(filePath);

    // Skip in diff editors (viewColumn undefined) — the diff view already shows
    // the change — or when the user disabled inline decorations.
    const isInDiff = editor.viewColumn === undefined && diffPaths.has(filePath);
    if (!fileState || fileState.status !== 'reviewing' || isInDiff || !this.stateManager.showInlineDecorations) {
      this.clear(editor);
      return;
    }

    const doc = editor.document;
    const hunks = computeHunks(fileState.baseline, doc.getText());
    const lastLineEmpty = doc.lineAt(doc.lineCount - 1).text.length === 0;
    const anchors = computeHunkAnchors(hunks, doc.lineCount, lastLineEmpty);

    const added: vscode.Range[] = [];
    const removed: vscode.DecorationOptions[] = [];
    const deletions: vscode.DecorationOptions[] = [];

    hunks.forEach((hunk, i) => {
      const anchor = anchors[i];
      const eol = doc.lineAt(anchor.line).range.end;
      const at = new vscode.Range(eol, eol);
      if (anchor.added) {
        added.push(new vscode.Range(anchor.added.start, 0, anchor.added.end, 0));
        if (hunk.oldLines > 0) {
          removed.push({ range: at, renderOptions: { after: { contentText: removedSummary(hunk.oldLines) } } });
        }
      } else if (anchor.deletion) {
        deletions.push({
          range: at,
          renderOptions: { after: { contentText: deletionLabel(hunk.oldLines, anchor.deletion) } },
        });
      }
    });

    editor.setDecorations(this.addedLine, added);
    editor.setDecorations(this.removedMarker, removed);
    editor.setDecorations(this.deletionMarker, deletions);
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.addedLine.dispose();
    this.removedMarker.dispose();
    this.deletionMarker.dispose();
  }
}
