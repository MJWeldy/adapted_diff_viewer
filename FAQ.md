# FAQ

## Why doesn't a file dragged from Finder always show as "New"?

When you drag a file from Finder into the VSCode explorer, VSCode may auto-open (preview) the file. If the file is opened before hunkwise processes the create event, the editor buffer matches the disk content, causing hunkwise to treat it as a user-created file (silently snapshotted as baseline) instead of an external new file.

This is a known timing-dependent behavior. There is no reliable VSCode API to distinguish "user created a new file in the editor" from "user dragged an external file into the explorer" — `onWillCreateFiles` fires for both.

When this happens, the file is silently snapshotted as a baseline in hunkwise git (content matches disk), so it won't appear as "New" even after clicking refresh. There is currently no automatic workaround — the file is treated as if it was always part of the project.

## Why aren't removed lines shown as red rows inside the editor?

Drawing extra rows between editor lines requires VS Code's proposed `editorInsets` API. Upstream hunkwise used it, but that meant an `argv.json` edit, no normal installation, and breakage on VS Code stable on some Linux setups ([upstream issue #20](https://github.com/molon/hunkwise/issues/20)).

This fork uses stable APIs only. Removed lines are summarized inline (`−2 lines` on a changed block, or a red gutter triangle with `▸ 3 lines removed above` for a pure deletion). Hover the change to see the removed text, or click **⇄ Open diff** for the side-by-side view.

## I turned off CodeLens. How do I accept or discard hunks?

Use the keyboard shortcuts (`Ctrl+Alt+Y` / `Ctrl+Alt+N` for the hunk at the cursor, `Ctrl+Alt+]` / `Ctrl+Alt+[` to move between hunks; `Cmd` on macOS), the links in the hover, right-click → **hunkwise** in the editor, or the sidebar panel.
