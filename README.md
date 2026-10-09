# hunkwise

<!-- markdownlint-disable MD033 -->
<p align="center">
  <img src="media/icon.png" width="128" alt="hunkwise logo">
</p>

<p align="center"><em>Your future self will thank you. Or blame you. It depends on the diff.</em></p>
<!-- markdownlint-enable MD033 -->

Per-hunk Accept/Discard for any file change in VSCode.

> This is a fork of [molon/hunkwise](https://github.com/molon/hunkwise), maintained at [MJWeldy/adapted_diff_viewer](https://github.com/MJWeldy/adapted_diff_viewer). It replaces upstream's proposed `editorInsets` API with stable VS Code APIs (CodeLens, decorations, hover), so it installs as a normal `.vsix` on VS Code stable with no `argv.json` changes. The extension ID is `local.hunkwise`.

AI coding tools like [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [OpenCode](https://github.com/anomalyco/opencode), and other CLI/plugin-based assistants lack a native IDE — unlike Cursor, Windsurf, or Copilot, they have no built-in way to review changes hunk by hunk.

**hunkwise** fills that gap by bringing per-hunk review controls directly into VSCode for any external file change.

![snapshot](media/snapshot.png)

*Screenshot from upstream. It shows the older inline-row UI; this fork uses CodeLens and hover instead (see [Editor UI](#editor-ui)).*

## Features

- Tracks file changes from any source (AI tools, scripts, manual edits)
- Per-hunk `✓ Accept | ↺ Discard | ⇄ Open diff` CodeLens above each change
- Added lines highlighted in green; removed lines summarized inline (`−2 lines`, `▸ 3 lines removed above`) and shown in full on hover or in the diff view
- Keyboard shortcuts and an editor context menu for hunk navigation and actions (works with CodeLens disabled)
- Sidebar panel lists all pending files with hunk details and batch actions
- New files and deleted files are tracked and displayed
- State persisted across VSCode restarts via a lightweight internal git repo
- Respects `.gitignore` and custom ignore patterns

## Installation

Requires Node.js 18+ and VS Code 1.90+. No proposed APIs and no `argv.json` changes.

```bash
npm install
npx @vscode/vsce package --allow-missing-repository
code --install-extension hunkwise-*.vsix --force
```

Or `make install`, which does the same. Reload the VS Code window afterwards.

If you previously installed upstream's `molon.hunkwise`, uninstall it first so the two don't both track changes.

## Usage

### Enable hunkwise

Click **Enable** in the hunkwise sidebar panel. hunkwise will snapshot all current workspace files as baselines.

### Automatic tracking

Once enabled, any external tool (AI assistant, script, etc.) that writes to a file will automatically trigger review mode for that file.

### Reviewing changes

- Click `✓ Accept`, `↺ Discard` or `⇄ Open diff` in the CodeLens above each hunk
- Hover a changed line (or a `▸ N lines removed` marker) to see the removed lines and the same actions
- Use the keyboard shortcuts below, or right-click → **hunkwise** in the editor
- Use the **hunkwise** sidebar panel to:
  - See all files with pending changes
  - Accept or discard individual hunks
  - Accept or discard all changes in a file
  - Accept or discard all changes across all files
- Click a file name in the panel to open it
- Deleted files show a diff view with the original content

### Disable hunkwise

Open **Settings** (gear icon in the panel title bar) and click **Disable** at the bottom. All tracked state is cleared.

### Tip: Stack with Chat panel

You can drag both the hunkwise panel and the Claude Code panel into the Chat panel to stack them as tabs in the same panel group — keeping Claude Code chat and hunk review at a glance.

## Commands

| Command | Description |
| ------- | ----------- |
| `hunkwise: Enable` | Enable hunkwise and snapshot the workspace |
| `hunkwise: Disable` | Disable hunkwise and clear all state |
| `hunkwise: Settings` | Open the settings panel |
| `hunkwise: Next Hunk` / `Previous Hunk` | Move the cursor between hunks in the current file |
| `hunkwise: Accept Hunk at Cursor` / `Discard Hunk at Cursor` | Act on the hunk under the cursor |
| `hunkwise: Open Diff for Hunk` | Open a baseline ↔ current diff at the hunk under the cursor |
| `hunkwise: Accept All Hunks in File` / `Discard All Hunks in File` | Act on every hunk in the current file |

### Keyboard shortcuts

Active when an editor with pending hunks has focus. On macOS use `Cmd` instead of `Ctrl`. Rebind them in **Keyboard Shortcuts** by searching for `hunkwise`.

| Shortcut | Action |
| -------- | ------ |
| `Ctrl+Alt+]` / `Ctrl+Alt+[` | Next / previous hunk |
| `Ctrl+Alt+Y` / `Ctrl+Alt+N` | Accept / discard hunk at cursor |
| `Ctrl+Shift+Alt+Y` / `Ctrl+Shift+Alt+N` | Accept / discard all hunks in file |

If you've turned CodeLens off (`"editor.codeLens": false`), these shortcuts, the hover links and the sidebar panel still work.

## Settings

Settings are stored in `.vscode/hunkwise/settings.json` and can be changed via the settings panel:

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `ignorePatterns` | `[".git"]` | Glob patterns to exclude from tracking |
| `respectGitignore` | `true` | Whether to honor `.gitignore` rules |
| `clearOnBranchSwitch` | `false` | Automatically clear all pending hunks when git branch changes |
| `showInlineDecorations` | `true` | Show CodeLens actions, line highlights and removed-lines hovers in normal editors |
| `useDiffEditor` | `false` | Open files/hunks from the panel in a diff view instead of the normal editor |

## .gitignore

When enabled, hunkwise automatically adds `.vscode/hunkwise/` to your `.gitignore`.

## How it works

### Baseline tracking

When hunkwise is enabled, it snapshots all workspace files into a private git repository at `.vscode/hunkwise/git/`. This repo stores **baselines** — the content of each file at the moment hunkwise starts tracking. The repo always has exactly one commit (each mutation does `--amend`).

When an external tool modifies a file, hunkwise diffs the current content against the stored baseline to produce hunks. Accepting a hunk updates the baseline; discarding a hunk restores the baseline content.

### External vs manual change detection

hunkwise distinguishes between:

- **External changes** (AI tools, scripts): Detected when the file content on disk differs from the open editor buffer. These trigger review mode with inline hunks.
- **Manual edits** (user typing in VSCode): The editor buffer matches the disk content after save. These silently update the baseline — no hunks shown.

This means you can freely edit files while hunkwise is enabled, and only tool-generated changes will produce hunks.

### File rename and delete handling

- **Manual rename** (via VSCode explorer/API): hunkwise migrates the baseline to the new path. No spurious deletion hunk is shown.
- **Manual delete** (via VSCode explorer/API): hunkwise removes the baseline. No deletion hunk is shown.
- **External delete** (tool deletes a file): Shows a deletion hunk so you can review and restore if needed.

### Ignore rules

Files can be excluded from tracking via two mechanisms:

1. **ignorePatterns** in `.vscode/hunkwise/settings.json` — custom patterns (default: `[".git"]`, plus `".DS_Store"` on macOS)
2. **`.gitignore`** — when `respectGitignore` is true (default), workspace `.gitignore` rules are honored

When ignore rules change (`.gitignore` modified, or patterns updated via settings), hunkwise automatically:

- Removes baselines for files that are now ignored
- Adds baselines for files that are newly allowed

### Editor UI

Removed lines can't be drawn as real rows inside the editor without proposed APIs. Instead, a mixed hunk shows a `−N lines` note at the end of its first added line, and a pure deletion shows a red gutter triangle plus `▸ N lines removed above` (or `below` at end of file). Hover either to see the removed text, or use **Open diff** for the full side-by-side view.

### State persistence

All baseline data is stored in the git repo and survives VSCode restarts. On reactivation, hunkwise reads baselines from `git ls-tree HEAD` + `git show :path` to restore in-memory state.

## Development

```bash
npm run compile          # compile TypeScript
npm run watch            # watch mode
npm test                 # run unit tests (node:test runner)
npm run test:integration # run VSCode integration tests
```

Unit tests cover `diffEngine`, `hunkAnchors`, `hunkwiseGit`, and `gitignoreManager`. They run with Node's built-in test runner and require no additional dependencies.

Integration tests run in a real VSCode extension host via `@vscode/test-cli` and cover rename/delete handling, .gitignore sync, file watching, CodeLens/hover/keyboard commands, and enable/disable lifecycle. By default `@vscode/test-cli` downloads VS Code; set `VSCODE_TEST_PATH` to test against an installed build instead, e.g. `VSCODE_TEST_PATH=/usr/share/code/code npm run test:integration`.
