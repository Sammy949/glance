# glance — project context for AI assistants

> Paste this file into a ChatGPT/Claude session to bring it fully up to speed on
> the project. It covers what glance is, every decision made and why, the full
> architecture, and current status. Last updated: 2026-09-24.

## What glance is

A **fast, fluid markdown viewer + quick editor** for the browser (installable
PWA) and desktop (Tauri v2). Built by Samuel (GitHub: `Sammy949`), a solo dev.
Repo: `github.com/Sammy949/glance` (SSH remote). License: MIT.

**Origin:** Samuel works with lots of `.md` files and viewing them was annoying.
He admired the markdown previewer in **Microsoft PowerToys Peek** (the
spacebar-preview utility) and asked to "abstract just the md viewer into a
standalone app." Investigation of the PowerToys source showed the entire
renderer is (a) a Markdig pipeline and (b) ~2KB of inline CSS (GitHub-style
light theme + VS Code-colored dark theme) rendered in WebView2. glance is a
faithful web port of that recipe, then pushed well past it.

**North star: SPEED.** Fluid, fast, simple. Every decision optimizes for
instant startup and zero friction. Feature creep is actively resisted.

## Key decisions (and why)

- **Zero-build vanilla ES modules.** No bundler, no framework, no npm at
  runtime. Deps are vendored in `vendor/`. Rationale: speed, offline use,
  simplicity, and an inspectable artifact.
- **Chromium-only for full browser file access by choice.** Uses the File System
  Access API (open/save-back, folder mode). Other browsers can read files and
  download a copy. Tauri uses native Open/Save, while folder mode still depends
  on WebView support for the directory picker.
- **Render pipeline mirrors PowerToys `MarkdownHelper.cs` exactly** (see
  mapping below). The light/dark **theme CSS derives from** that file — MIT,
  attributed in `LICENSE` third-party notices. Link color is adapted for glance.
- **Editing is deliberately dumb** (raw textarea + live preview). Samuel has a
  separate notepad project ("Ren"); glance must not grow into a second Ren.
  Rich authoring is out of scope.
- **Remote images blocked by default** (Peek's privacy default), per-doc
  opt-in button.
- **PWA first, Tauri second, same web core.** Tauri (not Electron) because it
  uses the OS webview — WebView2 on Windows, the exact engine Peek uses. Tiny
  binary, low RAM.
- **Icons are inline Lucide SVGs** (no icon font, no CDN fetch). Emojis were
  used first; Samuel asked for real icons.
- **Atomic commits with conventional labels** (`feat:`, `fix:`, `ci:`,
  `docs:`, scoped like `feat(desktop):`). Samuel uses **SSH remotes only**
  (`git@github.com:`), never HTTPS.

## Markdig → markdown-it mapping (the core port)

| PowerToys (Markdig)              | glance (vendored markdown-it@14)            |
|----------------------------------|---------------------------------------------|
| `UseAdvancedExtensions`          | GFM built-ins + `markdown-it-footnote`, `-deflist`, `-task-lists` |
| `UseEmojiAndSmiley`              | `markdown-it-emoji`                          |
| `UseYamlFrontMatter` (hidden)    | frontmatter stripped by regex before render  |
| `UseMathematics`                 | `@traptitech/markdown-it-katex` (KaTeX)      |
| `SoftlineBreakAsHardline`        | `breaks: true`                               |
| `HTMLParsingExtension` (local imgs) | folder-mode blob-URL resolution           |
| WebView2 host                    | browser / Tauri WebView2                     |
| (none — Peek has no highlighting)| `highlight.js` common build, github/github-dark themes |
| (none)                           | `markdown-it-anchor` — slugged heading ids + hover `#` permalink |
| Sanitization                     | `DOMPurify`                                  |

Every optional plugin loads in a try/catch — one failing never breaks rendering.

## File layout

```
glance/
├── index.html                 # single-page shell; toolbar, sidebar, findbar, editor+preview
├── manifest.webmanifest       # PWA manifest + .md file_handlers
├── sw.js                      # service worker; CACHE = 'glance-vN'
├── styles/app.css             # app chrome (toolbar/sidebar/editor/findbar/toast)
├── src/
│   ├── main.js                # orchestrator: state, doc lifecycle, all wiring
│   ├── pipeline.js            # markdown-it + plugins + hljs + DOMPurify
│   ├── theme.js               # PowerToys light/dark CSS with link-color adaptation
│   ├── files.js               # FS Access open/save + drag-drop + fallbacks
│   ├── folder.js              # folder mode: tree walk, IndexedDB handle persistence, path resolution
│   ├── find.js                # in-doc find via CSS Custom Highlight API (no DOM mutation)
│   ├── icons.js               # Lucide SVG strings for toggling buttons
│   └── platform.js            # Tauri bridge (withGlobalTauri; no npm dep)
├── icons/                     # icon.svg = Onee master mark (single source); PWA icons + favicon (generated from it)
├── scripts/generate-icons.mjs # zero-dep SVG→raster: flattens icon.svg's paths, scanline-fills, emits PNG/ICO/ICNS
├── sample/                    # test vault: nested md, relative image, ../ links
├── src-tauri/                 # Tauri v2 shell
│   ├── src/lib.rs             # launch/open/save/watch commands, single-instance
│   ├── src/main.rs            # thin entry
│   ├── tauri.conf.json        # window, bundle, .md fileAssociations, before-hooks
│   ├── build-web.mjs          # copies web app -> src-tauri/frontend (frontendDist)
│   ├── capabilities/default.json
│   └── icons/                 # PNGs + icon.ico + icon.icns (generated)
└── .github/workflows/release.yml  # tag v* -> tauri-action builds installers -> draft release
```

## Feature inventory (all shipped)

**Viewer:** PowerToys-parity render; light/dark toggle (persisted, hljs theme
follows); GFM tables, task lists, footnotes, deflists, emoji, KaTeX math;
frontmatter hidden; syntax highlighting + hover copy-code button; heading
anchors with hover `#`; reading-width toggle (~74ch, persisted); remote images
blocked by default with per-doc load button; in-doc find (`Ctrl+F`,
Enter/Shift+Enter step, Esc close, CSS Custom Highlight API); scroll position
remembered per file (localStorage, keyed by path||name); smooth-scroll +
subtle enter/theme animations (all disabled under `prefers-reduced-motion`);
Onee mascot on the empty state; favicon is the Onee mark (static navy, no longer
randomized). The brand blue is the Onee logo navy (`#004883`) via
`--brand`/`--accent`/`--accent-tint` in `:root`. Dark reading links use a lighter
blue for legibility against the dark page; the logo navy itself is unchanged.

**Editor:** `Ctrl+E` toggles side-by-side textarea + live preview (120ms
debounce), or full-height editing on narrow windows. `Ctrl+S` saves back via a
browser handle or native path; dirty flags appear in tabs and the title;
beforeunload and tab-close guards protect unsaved edits. A download fallback
keeps the tab dirty because it cannot confirm an in-place save.

**Tabs:** each open document keeps its own text, dirty state, mode, scroll,
relative folder context, and remote-image choice. Opening an existing file
focuses its tab. Multiple dropped files and PWA/native launch files open in tabs.
Closing a dirty tab asks before discarding edits. On narrow windows, the editor
uses the full screen and the Edit/Preview button switches views.

**Live-reload:** under Tauri, a Rust `notify` watcher on the file's parent dir
emits `file-changed` (survives editors' atomic write-then-rename); on web,
polls the FS Access handle every 1.5s + on window focus. Re-renders preserving
scroll; never clobbers unsaved edits.

**Folder mode (v0.2):** open a directory → collapsible sidebar file tree of
all markdown; relative images resolve from disk to blob URLs (incl. `../`
up-paths, normalized against the folder root); relative `.md` links navigate
in-app; folder handle persisted in IndexedDB and restored next session if
permission still granted (re-grant needs a user gesture). Object URLs revoked
on each re-render.

**PWA:** installable; offline via SW (same-origin = network-first with cache
fallback); `.md` file handler via launchQueue; SW disabled under Tauri.

**Desktop (Tauri v2):** `.md`/`.markdown`/`.mdown`/`.mkd` file associations;
launched files read in Rust (`get_launch_files`) and handed to the frontend;
second launch forwards args via single-instance plugin and focuses the window.
Native Open and Save use the dialog plugin and a Rust-side allowlist of opened
paths. `withGlobalTauri` keeps the frontend free of npm Tauri dependencies.

**Keyboard:** Ctrl+O open, Ctrl+S save, Ctrl+E edit toggle, Ctrl+F find.

## Bugs hit and lessons learned

1. **`[hidden]` vs ID selectors:** `#empty{display:flex}` overrode the UA
   `[hidden]` rule, so `el.hidden = true` did nothing — the drop overlay stuck
   visible. Fix: `[hidden]{display:none !important}` global rule.
2. **Service-worker staleness:** cache-first same-origin caching served an old
   `index.html` after the favicon change (commit didn't touch sw.js → no SW
   update). Fix: same-origin is now **network-first**; no more manual cache
   bumps needed to see changes.
3. **HTTPS remote vs SSH keys:** first push failed (`could not read Username`)
   because the remote was `https://`. Samuel authenticates via SSH only —
   remotes must be `git@github.com:...`.
4. **tauri-action cwd:** `beforeBuildCommand: "node build-web.mjs"` only
   resolved from inside `src-tauri/`; CI invokes from the repo root, so all
   three platforms failed. Fix: `node src-tauri/build-web.mjs` (the script
   resolves its own paths internally). Also: with no package.json,
   tauri-action's CLI detection is unreliable → workflow npm-installs
   `@tauri-apps/cli` globally and passes `tauriScript: tauri`.

## Release process

```bash
node scripts/check-release.mjs v0.x.y
git tag v0.x.y && git push origin v0.x.y
```
Update both Tauri and Cargo versions before merging the release commit to
`main`. The tag workflow requires matching versions and a commit on `main`,
then builds on windows-latest / macos-latest / ubuntu-22.04. It produces
`.msi`/`.exe`, `.dmg`, `.deb`/`.AppImage` and attaches them to a **draft** GitHub
Release for manual review and publish.

## Current status & roadmap

- Web/PWA: fully working, all features above live on `main`.
- v0.2.0 is tagged; tabs, native Open/Save, and reader polish are merged into
  `main`. This branch prepares v0.3.0.
- Rust changes passed CI compilation; a real desktop dialog smoke test still
  needs a desktop runtime. There is no Rust toolchain in this WSL environment.
- **Later:** native folder browsing under Tauri (FS Access API may be limited
  in WebView2); folder-wide native watch; session restoration; Mermaid (lazy).

## How to work with Samuel

- Give honest pushback; he explicitly wants "world-class" and dislikes hype.
- Guard scope: ship first, sprawl never. Editing stays dumb (Ren is the editor).
- Speed over features. No frameworks. Keep the zero-build property.
- Atomic commits, conventional labels, SSH remotes, push after committing.
