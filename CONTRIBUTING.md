# Contributing

Thanks for wanting to help. The most useful thing right now is a markdown file that renders wrong, or a file glance changed when it shouldn't have. Attach the file (or the smallest part of it that shows the problem) to the issue.

## Run it

No build step and no install. Serve the folder and open it:

```bash
python3 -m http.server 8123
# then open http://localhost:8123/?file=sample/showcase.md
```

A local server is needed because ES modules and the service worker don't run from `file://`. [`sample/showcase.md`](sample/showcase.md) has everything glance renders, and [`sample/`](sample/) works as a small folder for folder mode (Chromium only).

Runtime dependencies are vendored in [`vendor/`](vendor/), so nothing loads from a CDN. To refresh them, edit the pinned versions in [`scripts/vendor.mjs`](scripts/vendor.mjs) and run it. `--only=core` or `--only=mermaid` refreshes one group.

## Desktop app

The desktop app is the same web app inside a [Tauri v2](https://v2.tauri.app) shell, in [`src-tauri/`](src-tauri/). Rust handles opening, saving and watching files, file associations and the single window. Everything you see is the web app.

You need [Rust](https://rustup.rs) and the Tauri CLI:

```bash
cargo install tauri-cli --version "^2"
cargo tauri dev      # live desktop window
cargo tauri build    # installers in src-tauri/target/release/bundle/
```

Run these from the repo root. `src-tauri/build-web.mjs` copies the web app into `src-tauri/frontend/` before each run. After editing `icons/icon.svg`, regenerate the app icons with `node scripts/generate-icons.mjs`.

The desktop window opens at 1000px wide, so check layout changes at that width.

## Releases

1. Bump the version in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, and merge to `main`.
2. Check and tag:

   ```bash
   node scripts/check-release.mjs v0.4.2
   git tag v0.4.2 && git push origin v0.4.2
   ```

3. The `release` workflow builds Windows (`.exe`, `.msi`), macOS (`.dmg`) and Linux (`.deb`, `.rpm`, `.AppImage`) on native runners, plus a tarball of the web app, and attaches them to a **draft** release.
4. Install the draft on a real machine, try it, then publish it.

## Testing

There's no test suite yet. CI checks JavaScript syntax, the desktop frontend copy and the release version, and runs `cargo check` on the Rust side.

For anything you can see, try it in a real browser and say how in the PR: which files, which widths, light and dark. For anything touching files, check the bytes on disk, not just what the screen shows.

## Layout

```
glance/
├── index.html             the page
├── styles/app.css         glance's own UI (the document itself uses the PowerToys theme)
├── sw.js                  service worker, for offline use
├── src/
│   ├── main.js            state, tabs, editing, saving, wiring
│   ├── pipeline.js        markdown-it + plugins + highlight.js + DOMPurify, GitHub alerts
│   ├── theme.js           the PowerToys light/dark CSS
│   ├── text.js            keeps line endings and BOM across edit and save
│   ├── files.js           opening and saving in the browser (File System Access API)
│   ├── folder.js          folder mode: the tree, relative paths, the remembered folder
│   ├── outline.js         the outline and the current section
│   ├── diagrams.js        Mermaid, loaded only when a document has a diagram
│   ├── find.js            find in document (CSS Custom Highlight API)
│   ├── platform.js        the bridge to the desktop shell
│   └── icons.js           Lucide icons for toggling buttons
├── vendor/                pinned dependencies (see scripts/vendor.mjs)
├── sample/                showcase file and a small test folder
├── scripts/               vendoring, icon generation, release check
└── src-tauri/             the desktop shell (Rust)
```

[`CONTEXT.md`](CONTEXT.md) has every decision so far and why, and the bugs that shaped them.

## House rules

- **Speed first.** Opening a file should feel instant. A feature that slows that down needs a very good reason.
- **No build step, no framework.** Plain ES modules, vendored dependencies. What's in the repo is what runs.
- **Never change a file the user didn't edit.** Opening or viewing never writes. Saving writes back exactly what was edited, with the file's own line endings and BOM.
- **Editing stays simple.** glance is a reader with a quick editor, not a writing app.
- **Offline and private.** No CDN, no telemetry, no account. Remote images stay blocked until the user loads them.
- **Verify, then claim.** Say what you tested and how, and what you couldn't test.

## Pull requests

Open an issue first for anything bigger than a fix, so we can agree on the approach. Keep PRs focused, use [Conventional Commits](https://www.conventionalcommits.org) (`feat(app):`, `fix(ui):`, `docs:`), and match the surrounding code's style.
