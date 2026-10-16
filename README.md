<img src="icons/icon-192.png" width="96" alt="glance icon: a small face peeking in from the corner">

# glance

I work with a lot of `.md` files, and opening them was always a bit annoying. An editor felt like too much just to read something, and a browser shows you raw text.

The one viewer I actually liked was the markdown preview in PowerToys Peek. Select a file, press a shortcut, and it's there, rendered properly. But it only works from File Explorer, and it closes the moment you click away.

So I pulled that previewer out into its own app, then kept going.

**Double-click a `.md` file and it opens rendered, in a window that stays.** Tabs, an outline, live reload, and a quick editor for when you need to change a line.

> Early days: I use it every day on Windows. The Mac and Linux builds come out of the same release, but I haven't tried them myself yet. Issues and feedback are very welcome.

## What it does

- **Reads markdown properly.** GitHub-style tables and task lists, footnotes, emoji, math, syntax-highlighted code with a copy button, GitHub alerts (`> [!NOTE]`) and Mermaid diagrams. Frontmatter stays hidden.
- **Outline** beside the text, with the section you're reading marked. Click a heading to jump there.
- **Tabs.** Opening a file that's already open just switches to it.
- **Live reload.** When something else changes the file (your editor, a script, a coding agent), glance updates in place and keeps your scroll position.
- **Quick edits.** A plain editor next to the preview, saving back to the same file. Line endings and BOM stay exactly as they were.
- **Folders.** Open one for a file tree of its markdown. Relative images and links between notes work, and the arrow keys flip through files without piling up tabs.
- Find, text size, a narrower reading column, light and dark, and printing that gives you just the document.

| Keys | |
| --- | --- |
| `Ctrl+O` | Open a file |
| `Ctrl+E` | Edit / preview |
| `Ctrl+S` | Save |
| `Ctrl+F` | Find |
| `Ctrl+Shift+O` | Outline |
| `Ctrl+=` `Ctrl+-` `Ctrl+0` | Text size |
| `Ctrl+P` | Print |
| `Ctrl+Tab` `Ctrl+W` | Next tab, close tab |

## Install

**[Download from the latest release](https://github.com/Sammy949/glance/releases/latest)**. On Windows that's `glance_<version>_x64-setup.exe`, about 4 MB. It installs just for you, so no admin prompt, and registers itself for `.md` files so you can make it the default from *Open with*.

It's small because it uses the WebView2 that already comes with Windows instead of shipping its own browser.

Windows will probably say **"Windows protected your PC"** first. glance isn't code-signed yet, and SmartScreen is cautious about new apps. Click **More info**, then **Run anyway**. If you'd rather build it yourself, see [CONTRIBUTING.md](CONTRIBUTING.md).

To remove it: Settings → Apps → glance → Uninstall.

The same release has a `.dmg` for Apple silicon Macs and `.deb`, `.rpm` and `.AppImage` for Linux. They aren't signed either, so macOS will likely refuse to open the app the first time.

### In a browser

glance also runs as a web app in Chrome or Edge, works offline, and can be installed from the address bar. Each release includes `glance-web-<version>.tar.gz` for any static host. Opening folders and saving back to the same file need a Chromium browser. Elsewhere you can still read files and download an edited copy.

## Privacy

- No account, no telemetry, no analytics.
- glance makes no network requests of its own. Remote images in a document stay blocked until you load them for that document.
- Files are read and saved where they are. Settings like theme and text size stay on your machine.

## Why it looks like Peek

The renderer is a port of PowerToys Peek's markdown preview. Peek runs Markdig with a particular set of extensions and about 2 KB of CSS inside WebView2. glance maps the same extensions onto markdown-it and uses that CSS, so a file looks the same in both. Everything after that (tabs, editing, folders, the outline, diagrams) is new.

## Before v0.4

I went through what people ask for and complain about in markdown viewers: GitHub issues for PowerToys, Typora, MarkText, glow, Zed and VS Code, and recent Show HN threads. Mermaid was the top request almost everywhere, followed by an outline for long documents. The complaints were mostly about apps changing files they'd only opened, freezing on big files, and bloat.

So v0.4 added Mermaid, the outline, GitHub alerts, text size and printing, and fixed a bug where saving turned Windows line endings into Unix ones. Big files are still slow (a 5 MB document takes about 20 seconds), so that's next. The details are in [docs/research.md](docs/research.md).

## Docs

- [docs/research.md](docs/research.md): what people asked for and complained about, and what that changed
- [CONTRIBUTING.md](CONTRIBUTING.md): running it locally, desktop builds, releases, and the house rules
- [CONTEXT.md](CONTEXT.md): every decision so far and why
- [sample/showcase.md](sample/showcase.md): everything glance renders, in one file

## Credits

The rendering recipe and theme come from [PowerToys](https://github.com/microsoft/PowerToys) (MIT). glance is built on [markdown-it](https://github.com/markdown-it/markdown-it) and its plugins, [DOMPurify](https://github.com/cure53/DOMPurify), [highlight.js](https://github.com/highlightjs/highlight.js), [KaTeX](https://github.com/KaTeX/KaTeX), [Mermaid](https://github.com/mermaid-js/mermaid) and [Lucide](https://github.com/lucide-icons/lucide) icons, all vendored so nothing loads from a CDN. The desktop app is [Tauri](https://github.com/tauri-apps/tauri). See [LICENSE](LICENSE).

Not affiliated with Microsoft.

## License

[MIT](LICENSE)
