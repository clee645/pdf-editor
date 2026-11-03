# Paperwork

A private, browser-based PDF annotation editor built with React, Vite, PDF.js, and pdf-lib. Open a local PDF, add text, highlight, draw, cover areas with white, rotate unannotated pages, undo/redo annotations, and download an edited copy. Includes a generated sample document.

## Development

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run dev -- --port 5173
```

## Production

```sh
npm run build
npm run preview -- --port 4173
```

Deploy the `dist` directory to a static web host. No backend, credentials, or file uploads are required. The PDF worker is bundled locally. Fonts use Google Fonts with local system fallbacks.

## Editing behavior

Edits are added over the original PDF; existing PDF text is not reflowed or directly rewritten. Whiteout is a visual cover, **not secure redaction**. Added text uses Helvetica and supports standard Latin characters. Password-protected PDFs are not supported. Changes remain in memory until downloaded; opening another document or refreshing discards them. Rotate a page before adding annotations to it.
