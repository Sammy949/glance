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

## Use

- **Open** a file, or drag-and-drop one anywhere. `Ctrl+O`.
- **Edit** toggles a side-by-side editor with live preview. `Ctrl+E`.
- **Save** writes back to the same file (File System Access API), or Save As for
  dropped/new files. `Ctrl+S`.
- **Theme** toggles light/dark (remembers your choice).
- **Remote images** are blocked by default; load them per-doc with one click.

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

### Demo bits

- [x] Port the Markdig pipeline
- [x] Lift the PowerToys light/dark CSS
- [x] Edit mode with live preview + save-back
- [x] PWA install + `.md` file handler
- [ ] **V2:** folder mode — sidebar nav, relative-image resolution, live-reload
- [ ] **Later:** Tauri wrapper for native OS file association

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
│   └── files.js               # File System Access open/save
├── icons/                     # generated PWA icons + favicon
└── scripts/generate-icons.mjs # zero-dep PNG icon generator
```

Regenerate icons after editing the generator:

```bash
node scripts/generate-icons.mjs
```

## License

MIT — see [`LICENSE`](LICENSE). Includes third-party notice for the PowerToys CSS.
