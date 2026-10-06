<!-- ====================================================== -->
<!--                       HEADER                           -->
<!-- ====================================================== -->

<p align="center">
  <img src="img/Extensions_Logo.png" width="120" alt="Extension Logo"/>
</p>

<h1 align="center">Persistent Highlighter</h1>

<p align="center">
  Highlight text on any webpage and keep it saved permanently.
</p>

<p align="center">
  A lightweight Chrome extension designed for readers, researchers and developers who want to preserve important information while browsing.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white">
  <img src="https://img.shields.io/badge/Manifest-V3-orange?style=for-the-badge">
  <img src="https://img.shields.io/badge/TypeScript-Primary_Language-3178C6?style=for-the-badge&logo=typescript&logoColor=white">
  <img src="https://img.shields.io/badge/JavaScript-Build_Output-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black">
  <img src="https://img.shields.io/badge/Status-Active-success?style=for-the-badge">
</p>

---

# Overview

Persistent Highlighter is a **Chrome extension** that allows users to highlight text on any webpage and automatically restore those highlights whenever the page is revisited.

The extension focuses on **simplicity, persistence, and usability**, making it ideal for:

- studying
- research
- reading documentation
- saving important information
- reviewing long articles

Unlike temporary browser highlights, this extension **stores highlights locally and restores them automatically.**

---

# Banner

<p align="center">
  <img src="docs/images/banner.png" width="900">
</p>

---

# Key Features

- **Floating toolbar on selection**: pick a study color (key idea, info, review, question, important…), add a comment, create a note or copy, without opening the popup
- **Click a highlight** to recolor it, write a comment or review question, mark it as favorite, copy or delete it
- Highlights that span several paragraphs, lists or inline formatting without breaking the page layout
- Robust restoring: text + context matching that survives whitespace changes, repeated phrases and late-loading (SPA) content
- Post-it notes on the page (drag, resize, colors, reading mode to hide them)
- **Library page**: every highlight and note from every page, global search, filters by color/tag/favorites, inline comment and tag editing, "open at highlight" links
- **Review mode**: highlights become flashcards (comment = question, or fill-the-gap with the surrounding context) with spaced repetition (1, 3, 7, 14, 30 days)
- Markdown / TXT / JSON export and full JSON backup/restore
- PDF support through a built-in PDF.js viewer
- Side panel, context menu and keyboard shortcuts (Alt+H, Alt+N, Alt+Q)

---

# Technologies

<p align="center">

<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" height="50"/>
&nbsp;&nbsp;&nbsp;
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" height="50"/>
&nbsp;&nbsp;&nbsp;
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg" height="50"/>
&nbsp;&nbsp;&nbsp;
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg" height="50"/>
&nbsp;&nbsp;&nbsp;
<img src="https://www.svgrepo.com/show/378837/chrome.svg" height="50"/>

</p>

| Technology | Purpose |
|-------------|--------|
| TypeScript | Main project logic |
| JavaScript | Runtime output |
| HTML | Popup interface |
| CSS | Styling and highlights |
| Chrome APIs | Extension functionality |

---

# Architecture

The project is structured with modular components to separate responsibilities clearly.
The runtime code is the plain JavaScript in `src/*.js` (loaded directly by the manifest, no build step).

| File | Responsibility |
|------|----------------|
| `src/types.js` | Shared namespace, constants, colors, URL/text helpers, Markdown export, spaced-repetition helpers |
| `src/storage.js` | `chrome.storage.local` access with a write queue so concurrent saves never overwrite each other |
| `src/highlighter.js` | Text map of the page, highlight anchoring (text + prefix/suffix + position), per-text-node `<mark>` rendering, restore and sync |
| `src/toolbar.js` | Selection toolbar and highlight popover (Shadow DOM, isolated from page CSS) |
| `src/notes.js` | Floating post-it notes |
| `src/focus.js` | Floating study timer |
| `src/content.js` | Content-script entry point: message handlers, storage sync, SPA URL changes |
| `src/sidebar.js` | In-page side panel |
| `src/popup.*` | Extension popup |
| `src/library.*` | Library and review page (also the extension options page) |
| `src/pdf-viewer.*` | PDF.js based viewer so PDFs can be annotated |
| `src/background.js` | Context menus, keyboard commands, PDF redirection |

## Loading the extension

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. To annotate local PDF files, enable **Allow access to file URLs** in the extension details.
