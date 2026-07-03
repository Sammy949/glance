---
title: glance
tagline: fast, fluid markdown — view & quick-edit
note: this frontmatter block is intentionally hidden when rendered
---

# glance :eyes:

A fast, fluid markdown **viewer & quick editor** for the browser — installable as
an app. A faithful port of the [PowerToys Peek](https://learn.microsoft.com/en-us/windows/powertoys/peek)
markdown renderer to the web, then pushed further.

> Pipeline mirrors PowerToys' `MarkdownHelper.cs` (Markdig); the light/dark theme
> CSS is lifted verbatim from that file (MIT © Microsoft). Markdig → `markdown-it`,
> WebView2 → your browser. See [`LICENSE`](LICENSE) for attribution.

## Run it

No build step. Serve the folder and open it:

```bash
python3 -m http.server 8123
# then open http://localhost:8123/?file=README.md
```

(A local server is required — ES modules and the service worker don't run from
`file://`.)

## Install as an app

Open it in Chrome/Edge → **Install** from the address bar. Once installed you get:

- its own window (no browser chrome),
- offline use (service worker caches the app + CDN deps after first load),
- **double-click a `.md` to open it in glance** (File Handling API).

## Desktop app (Tauri)

The same web core is wrapped by a Tauri v2 shell in [`src-tauri/`](src-tauri/) for a
native, low-footprint desktop app with **OS file association** — double-click a
`.md` in Explorer/Finder and it opens in glance. Tauri uses the system webview
(WebView2 on Windows — the same engine PowerToys Peek uses), so the binary is a
few MB and idle RAM stays low.

**One-time toolchain** (do this on the OS you're shipping for — Windows for the
`.md` association):

```bash
# 1. Rust: https://rustup.rs
# 2. Tauri CLI (cargo subcommand):
cargo install tauri-cli --version "^2"
# 3. (recommended) full icon set incl. .ico/.icns:
cargo tauri icon icons/icon-512.png
```

**Run / build:**

```bash
cd src-tauri
cargo tauri dev      # live desktop window
cargo tauri build    # installers in src-tauri/target/release/bundle/
```

The frontend is copied into `src-tauri/frontend/` automatically by
`build-web.mjs` (wired as Tauri's before-dev/build hook). A launched file is read
in Rust and handed to the frontend via the `get_launch_file` command; a second
launch is forwarded by the single-instance plugin (`open-file` event).

> Note: the app still loads `markdown-it`/KaTeX from `esm.sh` at runtime, so first
> launch needs network. Vendoring these for fully-offline native use is a planned
> step (see roadmap).

## Use

- **Open** a file, or drag-and-drop one anywhere. `Ctrl+O`.
- **Edit** toggles a side-by-side editor with live preview. `Ctrl+E`.
- **Save** writes back to the same file (File System Access API), or Save As for
  dropped/new files. `Ctrl+S`.
- **Find** in the document with `Ctrl+F` (`Enter` / `Shift+Enter` to step, `Esc` to close).
- **Reading width** toggles a centered ~74ch column (remembers your choice).
- **Theme** toggles light/dark (remembers your choice); code blocks are syntax-highlighted.
- **Remote images** are blocked by default; load them per-doc with one click.
- Scroll position is remembered per file.
- **Live-reload**: edit a file in another editor and glance updates in place, keeping your scroll.

### Folder mode

Click the **folder** icon (or "Open folder" on the empty screen) to open a directory:

- a sidebar **file tree** of every markdown file (folders collapsible); click to switch.
- **relative images** (`![](assets/pic.png)`) resolve from disk, including `../` up-paths.
- **relative `.md` links** (`[see](notes/other.md)`, `[back](../index.md)`) open in-app.
- the panel button toggles the sidebar; the folder is remembered (re-grant on next visit).

Try it on the included [`sample/`](sample/) vault. *(Chromium-only — uses the File
System Access API.)*

## Feature check

| Feature | PowerToys recipe | Status |
| --- | --- | :---: |
| GFM tables | `UseAdvancedExtensions` | ✅ |
| Task lists | GFM | ✅ |
| Footnotes / deflists | advanced ext | ✅ |
| Emoji | `UseEmojiAndSmiley` | ✅ |
| Math | `UseMathematics` | ✅ |
| Frontmatter hidden | `UseYamlFrontMatter` | ✅ |
| Soft break = line break | `SoftlineBreakAsHardline` | ✅ |
| Remote images blocked | Peek privacy default | ✅ |
| Edit + save-back | (beyond Peek) | ✅ |
| Installable / offline | (beyond Peek) | ✅ |
| Syntax highlighting + copy button | (beyond Peek) | ✅ |
| Reading-width toggle | (beyond Peek) | ✅ |
| In-doc find (`Ctrl+F`) | (beyond Peek) | ✅ |
| Scroll-position memory | (beyond Peek) | ✅ |
| Live-reload on external edit | (beyond Peek) | ✅ |
| Folder mode: tree + relative images/links | (beyond Peek) | ✅ |

### Demo bits

- [x] Port the Markdig pipeline
- [x] Lift the PowerToys light/dark CSS
- [x] Edit mode with live preview + save-back
- [x] PWA install + `.md` file handler
- [x] Tauri v2 shell scaffolded — file association + single-instance launch
- [x] Pre-ship polish: syntax highlight + copy, reading-width, find, scroll memory
- [x] Native live-reload (Rust file watcher; web falls back to handle-poll)
- [x] Folder mode (v0.2) — sidebar tree, relative images + `.md` links, remembered folder
- [ ] **Later:** vendor deps for fully-offline native app; native save-back path;
      per-file scroll keyed by full path; folder-wide native watch

Inline math $E = mc^2$ and a block:

$$\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}$$

A footnote for good measure.[^1]

[^1]: markdown-it matches Markdig's advanced extensions here.

## Project layout

```
glance/
├── index.html                 # shell
├── manifest.webmanifest       # PWA manifest (+ file handlers)
├── sw.js                      # service worker (offline)
├── styles/app.css             # chrome (toolbar, editor, empty state)
├── src/
│   ├── main.js                # orchestrator
│   ├── pipeline.js            # markdown-it + plugins + sanitize
│   ├── theme.js               # PowerToys light/dark CSS
│   ├── files.js               # File System Access open/save
│   ├── icons.js               # Lucide SVGs for toggling buttons
│   └── platform.js            # Tauri bridge (native launch/file-assoc)
├── icons/                     # generated PWA icons + favicon
├── scripts/generate-icons.mjs # zero-dep PNG icon generator
└── src-tauri/                 # Tauri v2 desktop shell
    ├── src/{lib,main}.rs      # launch-file reader + single-instance
    ├── tauri.conf.json        # window, bundle, .md file associations
    ├── build-web.mjs          # copies web app -> src-tauri/frontend
    └── capabilities/          # v2 ACL
```

Regenerate icons after editing the generator:

```bash
node scripts/generate-icons.mjs
```

## License

MIT — see [`LICENSE`](LICENSE). Includes third-party notice for the PowerToys CSS.
