# Paperwork

A private PDF editing and form-filling workspace. React and Vite power the interface; PDF.js renders pages and pdf-lib writes downloadable PDFs. Documents are processed locally in the browser, with no backend, accounts, external fonts, or uploads.

## Run locally

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open the URL printed in the terminal, usually `http://localhost:5173`. Keep the terminal running. Open your PDF or try the three-page sample form. Fill the fields directly, make edits, then choose **Download PDF** to save a copy to your computer.

## Edit & fill

- Actual page thumbnails show previews and current edits. Navigate, reorder, delete, and rotate pages; merge another PDF into the document.
- In **Fill out → Select**, click existing PDF text fields to type. Checkboxes toggle on/off, radio options remain exclusive, dropdowns work, and fields shared across pages stay synchronized. Tab moves between controls. Read-only fields stay read-only.
- Flat forms are scanned locally for square checkbox outlines, shaded text-entry areas, and blank underlines. Detected areas become clickable fields automatically, including on pages with some existing form fields. **Find fields** rescans the current page. Downloaded native and detected fields remain editable PDF form controls.
- Add text, text boxes, typed/drawn signatures, PNG/JPEG images, check/cross marks, rectangles, ellipses, lines, tables with editable cells, dates, highlights, freehand drawings, sticky notes, and watermarks.
- Use **Select** to move or resize added items. Double-click text or a table to edit it, or select it and choose **Edit item**. Delete removes selected items. Undo/redo covers edits, form values, and page operations; use Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z outside text fields.
- **Edit PDF** exposes existing text runs for click-to-type visual replacement. Search highlights matching original PDF text and navigates between results. Zoom, fit width, print, and PDF download are available.

## Limits

Automatic detection is heuristic, not OCR or a guarantee of recognizing every form. Faint, irregular, scanned, or unusual layouts can need the manual Text and Check tools. Visual text replacement covers and redraws a text run; it does not reflow or remove the original PDF text. Erase and Blackout are **visual covers, not secure redaction**. Typed/drawn signatures are visual signatures, not cryptographic certificates. Added and filled text currently uses standard Latin PDF fonts; unsupported characters produce an export error. Password-protected documents and XFA forms are not supported. Changes stay in memory until downloaded: refreshing, closing the tab, or opening another document discards unsaved work.

## Build and test

```sh
npm run build
npm run preview
```

Deploy `dist` to any static web host. The PDF worker and all application assets are bundled locally.

Browser regression tests cover native and flat forms, toggles, export/reopen, radio groups, dropdowns, read-only/shared fields, rotated geometry, annotations, signatures, tables, images, page operations, merging, and mobile layout:

```sh
npx playwright install chromium
npm test
```

Tests use system Chromium at `/usr/bin/chromium` when available, otherwise Playwright's installed Chromium. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use another Chromium executable. Tests start their own server on port 4174. Test artifacts are ignored by Git.
