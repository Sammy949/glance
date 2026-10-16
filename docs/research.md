# Research

Before v0.4 I went through what people ask for, and complain about, in markdown viewers and light editors. This is what came up and what it changed in glance.

## Where it came from

- GitHub issues sorted by reactions: PowerToys (Peek and the File Explorer previewer), Typora, MarkText, Zettlr, glow, the Markdown Viewer browser extension, VS Code, Zed and Warp.
- Show HN threads for new markdown viewers, 2024 to 2026.
- Not Reddit or app store reviews. They couldn't be read for this pass, so they're missing.

Numbers in brackets are GitHub thumbs-up, checked in October 2026.

## What people ask for

| Request | Where | In glance |
| --- | --- | --- |
| Mermaid diagrams | The top request almost everywhere: [Zed #10696](https://github.com/zed-industries/zed/issues/10696) (364), glow #342 (85), Warp #7115 (78), [PowerToys #20645](https://github.com/microsoft/PowerToys/issues/20645) | Added in v0.4, loaded only when a document has one |
| An outline for long documents | [PowerToys #45267](https://github.com/microsoft/PowerToys/issues/45267) ("navigation is scroll-only"), PowerToys #29143, glow #287, Typora #1243 | Added in v0.4 |
| Live reload, and seeing what changed | glow #135 (55), Warp #3971, [a comment in the Marky Show HN](https://news.ycombinator.com/item?id=47801828) on files "continuously modified by coding agents" | Live reload was already there. Marking what changed is an idea, not built |
| Relative images and links | PowerToys #1837, glow #441 (40) | Already there in folder mode |
| Search across a folder | Typora #651 (68), glow #183 (57) | Not yet. Maybe a file name filter first |
| Text size | A Marky thread, PowerToys #45267 | Added in v0.4 |
| Read-only viewing | Typora #710 (62), MarkText #3688 | That's the whole app |
| Printing / PDF | Typora #118 (49), two Show HN threads | Added in v0.4 |
| GitHub alerts (`> [!NOTE]`) | Markdown Viewer extension #250 | Added in v0.4 |
| Arrow keys through a folder | PowerToys #26726, the most-upvoted theme in that thread | Added in v0.4 |

Asked for a lot but out of scope, because they turn a reader into an editor or a workspace: Vim keys, spellcheck, plugins, wiki links and backlinks, git integration, presentation mode.

## What people complain about

- **Apps changing files they only opened.** [MarkText #2189](https://github.com/marktext/marktext/issues/2189) (43) is about a document being modified just by opening it. glance had a smaller version of this: saving after an edit turned Windows line endings into Unix ones. Fixed in v0.4, and saving now keeps line endings and BOM exactly as they were.
- **Freezing on big files.** Typora #6290, a 4 MB file it couldn't open. glance does open a 5 MB document, but it takes about 20 seconds and the window doesn't respond until it's done. Most of that is the browser engine laying out the whole page at once, so the fix is rendering less of it at a time. Next on the list.
- **Slow first paint, jumpy scrolling, lost scroll position.** PowerToys #16020, VS Code #318532. glance keeps scroll position per file and through live reloads.
- **Bloat, and calling a web view "native".** Commenters on Tauri-based viewers pushed back on exactly that. So the README says what glance is: a web app in Windows' own WebView2, with a 4 MB installer.
- **Abandoned apps.** glow and MarkText both have "is this dead?" threads. Few dependencies, all vendored, and no build step keep glance easy to keep alive.

## The trend

A lot of the 2026 Show HN viewers pitch themselves for reading what AI coding agents write: plans, notes, READMEs. [A comment on one of them](https://news.ycombinator.com/item?id=47805126) about Obsidian sums up the gap: "opening a markdown file that did not live in a vault wasn't possible". Opening any loose `.md` file is what glance is for.
