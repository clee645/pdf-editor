import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFName,
  PDFHexString,
  PDFRadioGroup,
} from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { detectFlatFields } from "./detect";
pdfjs.GlobalWorkerOptions.workerSrc = worker;
export { pdfjs };
export const uid = () => crypto.randomUUID();
export async function openSource(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const radioOptions = {};
  try {
    const parsed = await PDFDocument.load(bytes);
    for (const field of parsed.getForm().getFields()) {
      if (!(field instanceof PDFRadioGroup)) continue;
      const options = field.getOptions();
      field.acroField.getWidgets().forEach((widget, i) => {
        const ref = parsed.context.getObjectRef(widget.dict);
        if (ref)
          radioOptions[`${ref.objectNumber}R${ref.generationNumber || ""}`] =
            options[i];
      });
    }
  } catch {
    /* PDF.js can still display a document with malformed form metadata. */
  }
  return { id: uid(), name: file.name, bytes, doc, radioOptions };
}
export async function inspectPage(source, n) {
  const p = await source.doc.getPage(n),
    v = p.getViewport({ scale: 1 }),
    id = uid();
  const annotations = await p.getAnnotations();
  const fields = [];
  for (const a of annotations.filter((a) => a.subtype === "Widget")) {
    const [x1, y1, x2, y2] = v.convertToViewportRectangle(a.rect);
    let type = a.checkBox
      ? "checkbox"
      : a.radioButton
        ? "radio"
        : a.fieldType === "Tx"
          ? "text"
          : a.fieldType === "Ch"
            ? "choice"
            : a.fieldType === "Sig"
              ? "signature"
              : null;
    if (!type) continue;
    fields.push({
      id: `${id}-${a.id}`,
      pageId: id,
      type,
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
      label: a.alternativeText || a.fieldName || type,
      name: a.fieldName,
      group: a.fieldName,
      exportValue:
        source.radioOptions?.[a.id] || a.buttonValue || a.exportValue || "Yes",
      value:
        type === "checkbox"
          ? !!a.fieldValue && a.fieldValue !== "Off"
          : type === "radio"
            ? a.fieldValue === a.buttonValue
            : (Array.isArray(a.fieldValue) ? a.fieldValue[0] : a.fieldValue) ||
              "",
      options: a.options || [],
      multiline: a.multiLine,
      maxLength: a.maxLen,
      native: true,
      readOnly: a.readOnly,
    });
  }
  return {
    id,
    sourceId: source.id,
    sourcePage: n,
    w: v.width,
    h: v.height,
    intrinsic: p.rotate,
    rotation: 0,
    fields,
    detected: false,
  };
}
export async function detectPage(source, pg) {
  const p = await source.doc.getPage(pg.sourcePage),
    scale = 1.5,
    v = p.getViewport({ scale }),
    canvas = document.createElement("canvas");
  canvas.width = Math.ceil(v.width);
  canvas.height = Math.ceil(v.height);
  await p.render({
    canvasContext: canvas.getContext("2d"),
    viewport: v,
    annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS,
  }).promise;
  return detectFlatFields(canvas, scale, pg.id);
}
const color = (c) => {
  const s = c || "#293e34";
  return rgb(
    parseInt(s.slice(1, 3), 16) / 255,
    parseInt(s.slice(3, 5), 16) / 255,
    parseInt(s.slice(5, 7), 16) / 255,
  );
};
export function wrapText(text, font, size, width) {
  return text.split("\n").flatMap((line) => {
    if (!line) return [""];
    const words = line.split(" "),
      lines = [];
    let current = "";
    for (const word of words) {
      const next = current ? current + " " + word : word;
      if (current && font.widthOfTextAtSize(next, size) > width) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    lines.push(current);
    return lines;
  });
}
export async function exportPDF(sources, state) {
  const groups = new Map();
  const result = await PDFDocument.create(),
    font = await result.embedFont(StandardFonts.Helvetica),
    italic = await result.embedFont(StandardFonts.TimesRomanItalic),
    loaded = new Map(),
    form = result.getForm();
  for (const desc of state.pages) {
    let original = loaded.get(desc.sourceId);
    if (!original) {
      original = await PDFDocument.load(
        sources.find((s) => s.id === desc.sourceId).bytes,
      );
      loaded.set(desc.sourceId, original);
    }
    const [page] = await result.copyPages(original, [desc.sourcePage - 1]);
    result.addPage(page);
    // Widget annotations are rebuilt as working AcroForm fields, including detected flat fields.
    const annots = page.node.Annots();
    if (annots) {
      for (let i = annots.size() - 1; i >= 0; i--) {
        const a = annots.lookup(i);
        if (a?.get?.(PDFName.of("Subtype"))?.toString() === "/Widget")
          annots.remove(i);
      }
    }
    const { width: pw, height: ph } = page.getSize(),
      a = ((desc.intrinsic % 360) + 360) % 360;
    const point = (x, y) =>
      a === 90
        ? { x: y, y: x }
        : a === 180
          ? { x: pw - x, y }
          : a === 270
            ? { x: pw - y, y: ph - x }
            : { x, y: ph - y };
    const rect = (x, y, w, h) => {
      const p = point(x, y),
        q = point(x + w, y + h);
      return {
        x: Math.min(p.x, q.x),
        y: Math.min(p.y, q.y),
        width: Math.abs(q.x - p.x),
        height: Math.abs(q.y - p.y),
      };
    };
    for (const f of desc.fields) {
      const value = state.values[f.id] ?? f.value,
        box = {
          ...point(f.x, f.y + f.h),
          width: f.w,
          height: f.h,
          rotate: degrees(a),
        },
        name = `field-${desc.id}-${f.id}`;
      const groupKey =
        f.native && f.name ? `${desc.sourceId}-${f.type}-${f.name}` : name;
      let c = groups.get(groupKey);
      const created = !c;
      if (!c) {
        c =
          f.type === "radio"
            ? form.createRadioGroup(name)
            : f.type === "checkbox"
              ? form.createCheckBox(name)
              : f.type === "choice" && f.options?.length
                ? form.createDropdown(name)
                : form.createTextField(name);
        groups.set(groupKey, c);
        c.acroField.dict.set(
          PDFName.of("TU"),
          PDFHexString.fromText(f.label || f.name || "Form field"),
        );
        if (f.readOnly) c.enableReadOnly();
      }
      if (f.type === "radio") {
        const option = f.exportValue || f.id;
        c.addOptionToPage(option, page, {
          ...box,
          borderWidth: 1,
          borderColor: rgb(0.65, 0.7, 0.6),
          backgroundColor: undefined,
          rotate: degrees(a),
        });
        if (value) c.select(option);
      } else if (f.type === "checkbox") {
        if (f.detected)
          page.drawRectangle({
            ...rect(f.x, f.y, f.w, f.h),
            color: rgb(1, 1, 1),
          });
        c.addToPage(page, {
          ...box,
          borderWidth: 1,
          borderColor: rgb(0.65, 0.7, 0.6),
          backgroundColor: undefined,
          textColor: rgb(0, 0, 0),
          rotate: degrees(a),
        });
        if (value) c.check();
      } else if (f.type === "choice" && f.options?.length) {
        if (created)
          c.setOptions(
            f.options.map((o) => o.displayValue || o.exportValue || o),
          );
        c.addToPage(page, {
          ...box,
          font,
          borderWidth: f.native ? 1 : 0,
          borderColor: rgb(0.65, 0.7, 0.6),
          backgroundColor: undefined,
        });
        if (value)
          c.select(
            f.options.find((o) => o.exportValue === value)?.displayValue ||
              value,
          );
      } else {
        if (f.multiline) c.enableMultiline();
        c.setText(String(value || ""));
        c.addToPage(page, {
          ...box,
          font,
          borderWidth: f.native ? 1 : 0,
          borderColor: rgb(0.65, 0.7, 0.6),
          backgroundColor: undefined,
          textColor: rgb(0, 0, 0),
          rotate: degrees(a),
        });
        c.setFontSize(Math.min(14, Math.max(8, f.h * 0.62)));
      }
      // PDF.js reads the widget's tooltip directly, so retain labels on every widget.
      c.acroField
        .getWidgets()
        .at(-1)
        .dict.set(
          PDFName.of("TU"),
          PDFHexString.fromText(f.label || f.name || "Form field"),
        );
    }
    for (const m of state.marks.filter((m) => m.pageId === desc.id)) {
      const ink = color(m.color),
        box = rect(m.x, m.y, m.w || 1, m.h || 1);
      const drawText = (text, x, y, size = m.size || 16, opts = {}) => {
        page.drawText(text, {
          ...point(x, y + size),
          font: m.type === "signature" ? italic : font,
          size,
          color: ink,
          rotate: degrees(a),
          ...opts,
        });
      };
      if (
        [
          "text",
          "textbox",
          "date",
          "sticky",
          "signature",
          "edit",
          "watermark",
        ].includes(m.type)
      ) {
        if (m.type === "edit")
          page.drawRectangle({
            ...rect(m.x, m.y, m.w, m.h),
            color: rgb(1, 1, 1),
          });
        if (m.type === "sticky")
          page.drawRectangle({ ...box, color: rgb(1, 0.96, 0.68) });
        const lines = wrapText(
          m.text || "",
          m.type === "signature" ? italic : font,
          m.size || 16,
          Math.max(10, m.w || 200),
        );
        lines.forEach((line, i) =>
          drawText(
            line,
            m.x + (m.type === "sticky" ? 5 : 0),
            m.y + i * (m.size || 16) * 1.2,
            m.size,
            { opacity: m.type === "watermark" ? 0.22 : 1 },
          ),
        );
      } else if (m.type === "draw") {
        for (let i = 1; i < m.points.length; i++)
          page.drawLine({
            start: point(m.points[i - 1].x, m.points[i - 1].y),
            end: point(m.points[i].x, m.points[i].y),
            thickness: 2,
            color: ink,
          });
      } else if (m.type === "check" || m.type === "cross") {
        const lines =
          m.type === "check"
            ? [
                [0.1, 0.5, 0.4, 0.8],
                [0.4, 0.8, 0.9, 0.15],
              ]
            : [
                [0.15, 0.15, 0.85, 0.85],
                [0.15, 0.85, 0.85, 0.15],
              ];
        for (const [x1, y1, x2, y2] of lines)
          page.drawLine({
            start: point(m.x + x1 * m.w, m.y + y1 * m.h),
            end: point(m.x + x2 * m.w, m.y + y2 * m.h),
            thickness: 2,
            color: ink,
          });
      } else if (m.type === "image") {
        const image = m.data.startsWith("data:image/png")
          ? await result.embedPng(m.data)
          : await result.embedJpg(m.data);
        page.drawImage(image, {
          ...point(m.x, m.y + m.h),
          width: m.w,
          height: m.h,
          rotate: degrees(a),
        });
      } else if (m.type === "ellipse")
        page.drawEllipse({
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          xScale: box.width / 2,
          yScale: box.height / 2,
          borderColor: ink,
          borderWidth: 2,
        });
      else if (m.type === "line")
        page.drawLine({
          start: point(m.x, m.flipped ? m.y + m.h : m.y),
          end: point(m.x + m.w, m.flipped ? m.y : m.y + m.h),
          color: ink,
          thickness: 2,
        });
      else if (m.type === "table") {
        for (let r = 0; r <= m.rows; r++)
          page.drawLine({
            start: point(m.x, m.y + (r * m.h) / m.rows),
            end: point(m.x + m.w, m.y + (r * m.h) / m.rows),
            color: ink,
            thickness: 1,
          });
        for (let c = 0; c <= m.cols; c++)
          page.drawLine({
            start: point(m.x + (c * m.w) / m.cols, m.y),
            end: point(m.x + (c * m.w) / m.cols, m.y + m.h),
            color: ink,
            thickness: 1,
          });
        for (let r = 0; r < m.rows; r++)
          for (let c = 0; c < m.cols; c++) {
            const text = m.cells?.[r * m.cols + c] || "";
            wrapText(text, font, m.size || 12, m.w / m.cols - 8)
              .slice(0, Math.floor((m.h / m.rows - 5) / (m.size || 12) / 1.2))
              .forEach((t, i) =>
                drawText(
                  t,
                  m.x + (c * m.w) / m.cols + 4,
                  m.y + (r * m.h) / m.rows + 4 + i * (m.size || 12) * 1.2,
                  m.size || 12,
                ),
              );
          }
      } else
        page.drawRectangle({
          ...box,
          ...(m.type === "rectangle"
            ? { borderColor: ink, borderWidth: 2 }
            : {
                color:
                  m.type === "whiteout"
                    ? rgb(1, 1, 1)
                    : m.type === "blackout"
                      ? rgb(0, 0, 0)
                      : ink,
                opacity: m.type === "highlight" ? 0.3 : 1,
              }),
        });
    }
    page.setRotation(degrees((desc.intrinsic + desc.rotation) % 360));
  }
  form.updateFieldAppearances(font);
  return result.save();
}
export async function sampleFile() {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold),
    form = pdf.getForm();
  for (let n = 0; n < 3; n++) {
    const p = pdf.addPage([612, 792]);
    p.drawText("STUDIO NORTH", {
      x: 48,
      y: 738,
      size: 12,
      font: bold,
      color: rgb(0.25, 0.35, 0.29),
    });
    p.drawText(
      n === 0
        ? "Let’s get to know you."
        : n === 1
          ? "A few more details."
          : "Your next chapter.",
      { x: 48, y: 684, size: 28, font: bold },
    );
    p.drawText("A sample form. Click the fields below and make it yours.", {
      x: 48,
      y: 653,
      size: 12,
      font,
    });
    if (n < 2) {
      for (const [i, label] of [
        "Full name",
        "Email address",
        "Organization",
      ].entries()) {
        p.drawText(label, { x: 48, y: 599 - i * 70, size: 11, font });
        const f = form.createTextField(`${n}-${label}`);
        f.addToPage(p, {
          x: 48,
          y: 561 - i * 70,
          width: 510,
          height: 29,
          borderColor: rgb(0.7, 0.75, 0.65),
          backgroundColor: rgb(0.96, 0.98, 0.93),
          font,
        });
      }
      p.drawText("What would you like to work on?", {
        x: 48,
        y: 355,
        size: 15,
        font: bold,
      });
      for (const [i, label] of [
        "Something creative",
        "Something practical",
        "Something entirely new",
      ].entries()) {
        const f = form.createCheckBox(`${n}-${label}`);
        f.addToPage(p, {
          x: 49,
          y: 316 - i * 34,
          width: 15,
          height: 15,
          borderWidth: 1,
        });
        p.drawText(label, { x: 78, y: 319 - i * 34, size: 12, font });
      }
    } else {
      p.drawText("This page is a flat form. Fields are detected locally.", {
        x: 48,
        y: 600,
        size: 12,
        font,
      });
      for (let i = 0; i < 3; i++) {
        p.drawRectangle({
          x: 48,
          y: 520 - i * 70,
          width: 510,
          height: 30,
          color: rgb(1, 0.91, 0.8),
        });
        p.drawText(["Name", "Signature", "Date"][i], {
          x: 48,
          y: 505 - i * 70,
          size: 10,
          font,
        });
      }
      for (let i = 0; i < 2; i++) {
        p.drawRectangle({
          x: 49,
          y: 255 - i * 35,
          width: 13,
          height: 13,
          borderColor: rgb(0.1, 0.1, 0.1),
          borderWidth: 1,
        });
        p.drawText(["I agree to the proposal", "Please keep me updated"][i], {
          x: 78,
          y: 258 - i * 35,
          size: 12,
          font,
        });
      }
    }
    p.drawText(`${n + 1} / 3`, { x: 525, y: 40, size: 10, font });
  }
  return new File([await pdf.save()], "Studio North — Fillable form.pdf", {
    type: "application/pdf",
  });
}
