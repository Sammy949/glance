# UI clean-up plan (v0.5)

A brief for whoever implements this (Codex). Not a redesign: glance keeps its layout, its PowerToys reading theme and its navy brand. This pass fixes the one big complaint glance still has (large files freeze it), makes the chrome consistent, and adds the reader-side pieces people asked for: a proper context menu, resizable panels and a file filter. The context menu and panel resizing are borrowed from Ren (`~/dev/ren`, or github.com/Sammy949/ren if not local). Every item traces back to [docs/research.md](research.md) or a visible bug; see "Considered and dropped" for what was left out and why.

Read [CONTRIBUTING.md](../CONTRIBUTING.md) and [CONTEXT.md](../CONTEXT.md) first. The house rules there win over anything here.

## Ground rules

- **No build step, no framework, no new runtime dependency.** Plain ES modules in `src/`, styles in `styles/app.css`. If something truly needs a library, vendor it through `scripts/vendor.mjs` and say why in the PR.
- **glance is a reader first.** The textarea stays the editor and gets no new writing features in this pass. See "Considered and dropped".
- **Never change a file the user didn't edit.** Every editing action goes through the existing LF text model (`src/text.js`); saving keeps line endings and BOM. Opening, viewing, right-clicking, or using a menu must never mark a tab dirty.
- **Content is visible by default.** No entrance animations that hide content. Motion under ~150 ms, none for keyboard-driven actions, and everything gated behind `prefers-reduced-motion`.
- **Light and dark, both.** Every new surface uses the tokens below and is checked in both themes.
- **Check at real sizes:** 1000×720 (the desktop window's default), 1280×800, and 400×800, plus the folder sidebar open and closed.
- **Atomic Conventional Commits**, one item per commit, e.g. `feat(ui): add a context menu to the preview`. Commit straight to `main`; don't push unless asked.
- **Verify, then claim.** Each item lists what to check. Report what you tested and how, and what you couldn't.

### Design rules (Samuel's, condensed)

These come from his global design notes and apply to everything below.

- No em dashes in UI copy, comments or commit messages.
- No glow, no soft all-around drop shadows, no glass/blur. If a floating surface needs lift, use one tight, low-offset shadow (for example `0 2px 6px rgb(0 0 0 / .12)`) or none, and separate it with a border in the surface's own tone.
- No pill chips, no gradient fills, no buttons that move or grow on hover, no animated underlines. Hover is a quiet background or colour change.
- Active and current states use weight and colour, never a dot or a bar tacked on.
- Don't put the same uppercase letter-spaced label treatment on everything.
- Icons stay bare (no tile behind them), and use the existing Lucide set at one size and stroke weight. Fetch any new icon from the official Lucide source, don't redraw it.
- Centre what's meant to be centred, and check it at the pixel level.
- Every control on screen must work. No dead or decorative controls.

## 0. Large files stop freezing the window

**Why:** "Freezing on big files" is one of the main complaints in the research, and glance has it: a 5 MB document takes about 20 seconds to open in the desktop app, and the window doesn't respond meanwhile. Measured on real WebView2, it splits roughly in half: about 12 s of parsing, highlighting and sanitising, and about 12 s of the browser laying out the whole page at once. Normal files (10 to 100 KB) render in milliseconds and must stay that way.

**Do:** try these in order, measuring after each one, and stop when the target is met:

1. `content-visibility: auto` with a sensible `contain-intrinsic-size` on the top-level blocks of `#content`, so off-screen blocks aren't laid out. Watch for side effects: scroll position memory, heading jumps, the outline's current-section tracking (it reads `getBoundingClientRect`), find, and print (force `content-visibility: visible` in `@media print`).
2. Highlight code blocks lazily: render them plain, then highlight the ones near the viewport, or skip highlighting in documents over a size threshold.
3. Render in chunks: parse once, insert the first screen straight away, and append the rest across idle callbacks so the window responds while it fills in.

Don't move parsing to Rust or a worker as part of this. That's a separate decision.

**Target:** with the 5 MB fixture (generate it the same way: about 26,000 sections each with a heading, bold text, a link, a list, a code block and a table), the first screen shows in under 2 s and the window responds to scrolling and Ctrl+F while the rest loads. Opening, scroll memory, live reload, outline, find and print behave exactly as before on normal files.

**Check:** time it in Chromium and in the installed desktop app, before and after, and put the numbers in the PR.

## 1. Design tokens

**Why:** the chrome has drifted. Hover backgrounds use five different greys (`rgba(128,128,128,.12/.14/.18/.28)` plus `--accent-tint`), the radii are 5, 6, 7, 8, 10 and 12 px, and the system font stack is repeated in about ten rules.

**Do:** in `styles/app.css`, define these once (light under `body.theme-light`, dark under `body.theme-dark`, shared values in `:root`) and switch every chrome rule over to them:

- `--font-ui` (the existing `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` stack) and `--font-mono`
- surfaces: `--surface` (page), `--surface-raised` (menus, find bar, toast), `--surface-sunken` (sidebar, tab rail, editor)
- `--hover`, `--pressed`, `--selected` (the active tree row, a checked menu item)
- `--border`, `--border-strong`
- `--text`, `--text-muted`, `--text-faint`
- `--radius-sm` 4px (menu items, small buttons), `--radius-md` 6px (toolbar buttons, tree rows, tabs' close), `--radius-lg` 8px (menus, find bar, toast)
- `--shadow-float`: the one tight shadow above, for floating surfaces only
- `--selection-bg` / `--selection-fg`, applied with `::selection` in the chrome and the editor (Ren does this). Keep the reading theme's own selection inside `#content` unless it fails contrast.

Don't touch `src/theme.js` (the PowerToys document theme) beyond what's needed.

**Check:** no raw `rgba(128,128,128,…)` or font stacks left in `app.css` outside the token block; screenshots of every surface in both themes look the same as before or better, never worse.

## 2. Find bar and toast follow the theme

**Why:** both are hard-coded dark even in light mode, and the find bar adds `backdrop-filter: blur(8px)` and a `0 4px 18px` shadow. That's the glass and soft-shadow look the design rules ban, and it clashes in light mode.

**Do:** give both `--surface-raised`, `--border`, `--radius-lg` and `--shadow-float`, with text in `--text`. Remove the blur. Keep the find highlight colours.

**Check:** find bar and toast in both themes; the match counter is still readable; the find bar stays clear of the tab bar at all three widths.

## 3. A context menu (borrowed from Ren)

**Why:** right-clicking anywhere in glance shows the WebView2 or browser default menu. In the desktop app that can include items like Back or Refresh, which reload the page and would drop unsaved edits. Check exactly what it shows in the installed app and note it in the PR. Ren already has a good menu: `~/dev/ren/src/editor/context-menu.js` and the `.ren-context-menu` rules near line 2299 of `~/dev/ren/styles.css`.

**Do:** add `src/menu.js`, a small generic menu ported from Ren's: `role="menu"`, `menuitem`, separators, a 228px width clamped 8px inside the window, and Ren's full keyboard model (Up/Down/Home/End, Enter/Space, Esc and Tab close and restore focus, the Menu key and Shift+F10 open it at the caret or focused element). It closes on outside pointerdown, scroll, resize, window blur and tab switch. Shift+right-click passes through to the native menu, with Ren's small hint line at the bottom. Style it with the tokens; disabled items at 40% opacity; no submenus or check items are needed yet, so leave them out.

Wire it to three places. Show only items that apply.

- **Preview** (`#content`): Copy (when there's a selection), Copy link and Open link (on a link), Copy code (on a code block), Copy link to heading (on a heading, `#slug`), Select all, then Find…, Edit here (switches to edit mode), Print….
- **Tabs:** Close, Close others, Close to the right, Copy path (when the tab has one). Closing still asks about unsaved edits.
- **Folder tree** (files): Open, Open in a new tab (bypasses the preview tab from arrow-key flipping), Copy path.

The editor keeps the native text menu (it already has undo, cut, copy and paste). Only make sure it can't show anything that reloads the page.

On the desktop, Open link must open the system browser (check how links open today under Tauri and reuse it). Clipboard actions use `navigator.clipboard`; if paste is refused, disable the item rather than failing silently.

**Check:** every item does what it says, with mouse and keyboard, in the browser and in the installed desktop app (see "Testing" below). The menu never covers itself at the window edges, and opening and closing it never marks a tab dirty.

## 4. Editor undo survives switching tabs

**Why:** switching tabs assigns `editor.value`, which clears the textarea's native undo history. Edit a file, look at another tab, come back, and Ctrl+Z does nothing. That's a bug, not a feature request.

**Do:** keep each tab's undo history. One way is one textarea per tab, hidden when inactive. Pick the simplest option that works without changing how text is stored or saved, and say which in the PR. Also move the editor onto the tokens (surface, caret and selection colours).

**Check:** edit in tab A, switch to B and back, then Ctrl+Z undoes the edit; a CRLF file still saves with CRLF.

## 5. Resizable sidebar and outline (borrowed from Ren)

**Why:** both panels have fixed widths (264px and 232px). In the research, the first thing that stopped one commenter adopting a similar viewer was not being able to resize its columns and sidebars. Ren's sidebar already resizes by pointer and keyboard and remembers its width.

**Do:** a thin handle on the sidebar's right edge and the outline's left edge: `role="separator"`, `aria-orientation="vertical"`, focusable, Left/Right arrows step 16px, a double click resets. Clamp the sidebar to 200 to 420px and the outline to 180 to 360px, and store both widths in localStorage. The outline's dock rule (`canDock` in `src/main.js`) must use the live widths. While dragging, `body.resizing` sets `cursor: col-resize` and `user-select: none`. The handle shows only a quiet line on hover or focus, with no grip dots.

**Check:** drag and keyboard in both themes; widths survive a reload; at 1000px with both panels open the text column is still at least 520px wide, or the outline switches to overlay.

## 6. Filter files in the folder sidebar

**Why:** search across a folder is a well-backed request (Typora #651, glow #183). A file name filter is the reader-sized version of it: quick, no indexing, no new UI mode.

**Do:** a small input at the top of the sidebar (`Ctrl+Shift+F` focuses it when a folder is open). Typing filters the tree to matching file names and keeps their folders expanded. Down moves into the results, Enter opens, and Esc clears and returns focus. Matching is case-insensitive substring, and highlights the matched characters with weight, not colour.

**Check:** a folder with 500 files filters as you type with no lag; arrow-key flipping still works on the filtered tree; clearing restores the previous expanded state.

## 7. Small things

Each of these is its own commit.

- **Sidebar header:** the folder name is uppercase and letter-spaced, a label treatment the design rules call out. Use normal case at `--text-muted`, weight 600.
- **Empty state:** "Open a file" (filled) next to "New document" and "Open folder" (outlined) is the filled-plus-outlined button pair the rules ban. Keep one clear primary action and make the other two quiet text buttons, or lay out all three as equal rows with their shortcut on the right (`Ctrl+O`, …). Keep the Onee mark and its drift.
- **Toolbar groups:** today there's one separator. Group as file (open, folder, new, save) | view (edit, outline, reading width, remote images) | theme, with consistent 4px gaps, and make sure tooltips show the shortcut wherever one exists.
- **Tab bar:** a tab's close button is 30px and the tab text sits 11px from the top. Centre both on the 42px rail. Check the dirty dot is centred in the close slot at the pixel level.
- **Focus rings:** one style everywhere, `2px solid var(--focus-ring)` with a consistent offset. Today tabs use a −3px offset and everything else 2px.
- **Scrollbars:** the 4px style applies to `#outline` and the menu too.
- **Copy-code button:** reuse the token hover; keep the green check confirmation, but use the theme's own success colour in dark mode (`#2ea043` is fine in light).

## Considered and dropped

**tiptap / WYSIWYG editing.** Ren's editor is tiptap on ProseMirror, and it's good in Ren. For glance the recommendation is no, for three reasons:

1. **Files would change on save.** A structured editor parses markdown into a document and re-serialises it, so a file comes back with different list markers, emphasis characters, spacing and escapes even when the user changed one word. That breaks glance's core rule. Ren's own `docs/EDITOR_INTEGRATION.md` shows how much work making round trips safe took (quarantine, preserved originals, a conversion matrix).
2. **It needs a bundle.** Ren builds tiptap with Bun into `editor.js`. glance has no build step.
3. **Scope.** glance is a reader with a quick editor, and `CONTEXT.md` says it must not grow into a second Ren.

If Samuel decides otherwise, that's its own project with its own plan, not part of this clean-up.

**Editor formatting features** (Ctrl+B / I / K, a "Turn into" menu, lists that continue on Enter, Tab indenting, editor and preview scroll sync). They make the editor nicer, but they're writing features. The research put authoring tools out of scope for a viewer (Vim keys, plugins, wiki links and the like), nobody asked a viewer for them, and the house rule is "editing stays simple". Ren is the editor. Scroll sync was also the riskiest item in the original plan.

**Marking what changed after a live reload.** It fits the coding-agent trend, but the evidence is one or two comments. Revisit if more people ask.

**Search inside every file in a folder.** It needs indexing and a results view. The file name filter (item 6) covers the common case first.

Also out: a command palette, settings screen, custom themes, and changes to the document theme in `src/theme.js`.

## Testing

There's no test suite in the repo yet. For this pass:

- Pure logic gets `node --test` tests in `tests/` where there is any (the filter's matching, for example).
- UI gets checked in a real browser: serve the repo (`python3 -m http.server`), drive it with Playwright (`playwright-core` with a local Chromium; keep it out of the runtime), and take screenshots at the three sizes in both themes. Test files can go in `tests/` but must not add runtime dependencies.
- **Desktop:** install the release build on Windows and launch it with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`. Connect with Playwright `connectOverCDP`, and send shortcuts as real key presses (PowerShell `WScript.Shell` `SendKeys`). Simulated keystrokes skip WebView2's own key handling, which is exactly what needs testing for the context menu and Shift+F10. Close the debug instance afterwards.
- Run the existing CI checks locally before each commit: `node --check` on every `src/*.js`, `node src-tauri/build-web.mjs`, `node scripts/check-release.mjs`.

## Order

0 first: it's the only research complaint glance still has, and it's independent of the rest. Then 1 (everything after it uses the tokens), then 2 to 7 in any order. After everything is in, a version bump to v0.5.0 is Samuel's call.
