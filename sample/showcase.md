---
title: showcase
note: this frontmatter block is hidden when rendered
---

# Showcase :eyes:

Everything glance renders, in one file. Open it with `?file=sample/showcase.md`.

## Text

**Bold**, *italic*, ~~strikethrough~~, `inline code`, and a [link](https://github.com/Sammy949/glance).
Soft line breaks are kept,
like this one.

## Lists

- [x] Port the Markdig pipeline
- [x] Lift the PowerToys light/dark CSS
- [ ] Something still to do

Term
: A definition list entry.

## Table

| Feature | Peek | glance |
| --- | :---: | :---: |
| Tables, footnotes, math | yes | yes |
| Tabs, editing, folders | no | yes |

## Code

```js
export function hello(name) {
  return `hello, ${name}`;
}
```

## Math

Inline $E = mc^2$ and a block:

$$\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}$$

## Alerts

> [!NOTE]
> Useful information.

> [!TIP]
> A better way to do something.

> [!WARNING]
> Something that needs attention.

## Diagram

```mermaid
flowchart LR
  md[markdown] --> it[markdown-it + plugins] --> purify[DOMPurify] --> view[preview]
```

## Footnote

markdown-it matches Markdig's advanced extensions here.[^1]

[^1]: Which is what PowerToys Peek uses.
