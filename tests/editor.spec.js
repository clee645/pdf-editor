import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import fs from "node:fs/promises";

async function sample(page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Just looking around/ }).click();
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeEnabled();
}
async function clickPage(page, x, y) {
  await page.locator(".canvas-scroll").evaluate((el) => el.scrollTo(0, 0));
  const box = await page.locator(".page-frame").boundingBox();
  await page.mouse.click(box.x + x, box.y + y);
}
async function download(page) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  return fs.readFile(await (await event).path());
}

test("native and detected fields toggle, retain values across pages, and download as editable form fields", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await sample(page);
  await expect(page.locator(".mini-page canvas")).toHaveCount(3);
  const thumbPixels = await page
    .locator(".mini-page canvas")
    .first()
    .evaluate(
      (c) =>
        Array.from(
          c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ).filter((v) => v < 180).length,
    );
  expect(thumbPixels).toBeGreaterThan(100);
  await page
    .getByRole("textbox", { name: "0-Full name", exact: true })
    .fill("Jane Diver");
  const check = page.getByRole("checkbox", {
    name: "0-Something creative",
    exact: true,
  });
  await check.check();
  await expect(check).toBeChecked();
  await check.uncheck();
  await expect(check).not.toBeChecked();
  await check.check();
  await page.getByRole("button", { name: "Go to page 3", exact: true }).click();
  await expect(page.locator(".form-layer input[type=text]")).toHaveCount(3);
  await expect(page.locator(".form-layer input[type=checkbox]")).toHaveCount(2);
  await page
    .locator(".form-layer input[type=text]")
    .first()
    .fill("Flat form name");
  await page.locator(".form-layer input[type=checkbox]").first().check();
  await page.getByRole("button", { name: "Go to page 1", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "0-Full name", exact: true }),
  ).toHaveValue("Jane Diver");
  const bytes = await download(page),
    pdf = await PDFDocument.load(bytes),
    form = pdf.getForm();
  expect(pdf.getPageCount()).toBe(3);
  expect(
    form
      .getFields()
      .filter((f) => f.constructor.name === "PDFTextField")
      .map((f) => f.getText()),
  ).toContain("Jane Diver");
  expect(
    form
      .getFields()
      .filter((f) => f.constructor.name === "PDFTextField")
      .map((f) => f.getText()),
  ).toContain("Flat form name");
  expect(
    form
      .getFields()
      .filter((f) => f.constructor.name === "PDFCheckBox" && f.isChecked()),
  ).toHaveLength(2);
  page.on("dialog", (d) => d.accept());
  await page.locator("input[type=file]").first().setInputFiles({
    name: "filled.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "0-Full name", exact: true }),
  ).toHaveValue("Jane Diver");
  await expect(
    page.getByRole("checkbox", { name: "0-Something creative", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("checkbox", { name: "0-Something creative", exact: true })
    .uncheck();
  expect(errors).toEqual([]);
});

test("text, signatures, tables, watermark, page management, and undo/redo survive PDF export", async ({
  page,
}) => {
  await sample(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await clickPage(page, 60, 610);
  await page
    .getByRole("textbox", { name: "Annotation text" })
    .fill("Exported note");
  await page.getByRole("button", { name: "Save text", exact: true }).click();
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await page.getByRole("textbox", { name: "Your name" }).fill("Jane Diver");
  await page
    .getByRole("button", { name: "Use signature", exact: true })
    .click();
  await clickPage(page, 300, 620);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Table rows" }).fill("2");
  await page.getByRole("spinbutton", { name: "Table columns" }).fill("2");
  await page
    .getByRole("textbox", { name: "Row 1 column 1", exact: true })
    .fill("Cell A");
  await page.getByRole("button", { name: "Place table", exact: true }).click();
  await clickPage(page, 60, 660);
  await page.getByRole("button", { name: "Watermark", exact: true }).click();
  await page
    .getByRole("button", { name: "Add watermark", exact: true })
    .click();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(page.locator(".annotations .mark-hit")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".annotations .mark-hit")).toHaveCount(3);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".annotations .mark-hit")).toHaveCount(4);
  await page.getByRole("button", { name: "Rotate page", exact: true }).click();
  await page
    .getByRole("button", { name: "Move page down", exact: true })
    .click();
  const bytes = await download(page),
    pdf = await PDFDocument.load(bytes);
  expect(pdf.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 0]);
  const text = await page.evaluate(async (data) => {
    const { pdfjs } = await import("/src/lib/pdf.js");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
    return (await (await doc.getPage(2)).getTextContent()).items
      .map((i) => i.str)
      .join(" ");
  }, Array.from(bytes));
  expect(text).toContain("Exported note");
  expect(text).toContain("Jane Diver");
  expect(text).toContain("Cell A");
  expect(text).toContain("DRAFT");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete page", exact: true }).click();
  await expect(page.locator(".mini-page canvas")).toHaveCount(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".mini-page canvas")).toHaveCount(3);
});

test("native radio, dropdown, shared text, read-only fields and rotated widget geometry are preserved", async ({
  page,
}) => {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    form = pdf.getForm(),
    shared = form.createTextField("Shared name");
  for (const angle of [0, 90, 180, 270]) {
    const p = pdf.addPage([400, 500]);
    p.setRotation(degrees(angle));
    shared.addToPage(p, { x: 40, y: 400, width: 150, height: 25, font });
  }
  const first = pdf.getPage(0),
    radio = form.createRadioGroup("Answer");
  radio.addOptionToPage("Yes", first, { x: 40, y: 340, width: 15, height: 15 });
  radio.addOptionToPage("No", first, { x: 100, y: 340, width: 15, height: 15 });
  const dropdown = form.createDropdown("Country");
  dropdown.setOptions(["Canada", "United States"]);
  dropdown.addToPage(first, { x: 40, y: 280, width: 180, height: 25, font });
  const locked = form.createTextField("Locked");
  locked.setText("Keep me");
  locked.addToPage(first, { x: 40, y: 230, width: 180, height: 25, font });
  locked.enableReadOnly();
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "widgets.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await pdf.save()),
    });
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", { name: "Shared name", exact: true })
    .fill("Shared value");
  await page.getByRole("radio").first().check();
  await page.getByRole("radio").last().check();
  await expect(page.getByRole("radio").first()).not.toBeChecked();
  await page
    .getByRole("combobox", { name: "Country", exact: true })
    .selectOption("Canada");
  await expect(
    page.getByRole("textbox", { name: "Locked", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Shared name", exact: true }),
  ).toHaveValue("Shared value");
  const before = await page
    .getByRole("textbox", { name: "Shared name", exact: true })
    .boundingBox();
  const bytes = await download(page),
    out = await PDFDocument.load(bytes),
    fields = out.getForm().getFields();
  expect(
    fields.filter((f) => f.constructor.name === "PDFRadioGroup"),
  ).toHaveLength(1);
  expect(
    fields.find((f) => f.constructor.name === "PDFRadioGroup").getSelected(),
  ).toBe("No");
  expect(
    fields.find((f) => f.constructor.name === "PDFDropdown").getSelected(),
  ).toEqual(["Canada"]);
  expect(fields.some((f) => f.isReadOnly())).toBe(true);
  page.on("dialog", (d) => d.accept());
  await page.locator("input[type=file]").first().setInputFiles({
    name: "roundtrip.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  const after = await page
    .getByRole("textbox", { name: "Shared name", exact: true })
    .boundingBox();
  expect(Math.abs(before.x - after.x)).toBeLessThan(2);
  expect(Math.abs(before.y - after.y)).toBeLessThan(2);
  expect(Math.abs(before.width - after.width)).toBeLessThan(2);
  expect(Math.abs(before.height - after.height)).toBeLessThan(2);
});

test("image placement, move/resize/delete, drawn signatures, existing text replacement and merging work", async ({
  page,
}) => {
  await sample(page);
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 100;
    c.height = 50;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, 100, 50);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[accept="image/png,image/jpeg"]').setInputFiles({
    name: "image.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    page.getByRole("button", { name: "Image", exact: true }),
  ).toHaveClass(/active/);
  await clickPage(page, 60, 610);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const item = page.locator(".annotations .mark-hit").first();
  const r = await item.boundingBox();
  await page.mouse.move(r.x + 20, r.y + 20);
  await page.mouse.down();
  await page.mouse.move(r.x + 40, r.y + 30, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".annotations image")).toHaveAttribute("x", "80");
  await expect(page.locator(".annotations image")).toHaveAttribute("y", "620");
  const handle = page.locator(".resize-handle");
  await handle.scrollIntoViewIfNeeded();
  const h = await handle.boundingBox();
  await page.mouse.move(h.x + 4, h.y + 4);
  await page.mouse.down();
  await page.mouse.move(h.x + 24, h.y + 14, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".annotations image")).toHaveAttribute(
    "width",
    "220",
  );
  await page
    .getByRole("button", { name: "Delete selected item", exact: true })
    .click();
  await expect(page.locator(".annotations image")).toHaveCount(0);
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await page.getByRole("button", { name: "Draw", exact: true }).last().click();
  const pad = await page.locator(".signature-pad").boundingBox();
  await page.mouse.move(pad.x + 50, pad.y + 70);
  await page.mouse.down();
  await page.mouse.move(pad.x + 150, pad.y + 90, { steps: 8 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Use signature", exact: true })
    .click();
  await clickPage(page, 60, 610);
  await expect(page.locator(".annotations image")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit PDF", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit text: STUDIO NORTH", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Annotation text" })
    .fill("STUDIO SOUTH");
  await page.getByRole("button", { name: "Save text", exact: true }).click();
  const extra = await PDFDocument.create();
  extra.addPage([400, 500]).drawText("Merged page");
  await page
    .locator('input[accept="application/pdf,.pdf"]')
    .nth(1)
    .setInputFiles({
      name: "extra.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await extra.save()),
    });
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".mini-page canvas")).toHaveCount(4);
  const bytes = await download(page),
    pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(4);
  const text = await page.evaluate(async (data) => {
    const { pdfjs } = await import("/src/lib/pdf.js");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
    return (await (await doc.getPage(1)).getTextContent()).items
      .map((i) => i.str)
      .join(" ");
  }, Array.from(bytes));
  expect(text).toContain("STUDIO SOUTH");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("mixed forms detect flat shaded/underlined text and prechecked boxes without losing native fields", async ({
  page,
}) => {
  const pdf = await PDFDocument.create(),
    p = pdf.addPage([612, 792]),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf
    .getForm()
    .createTextField("Existing field")
    .addToPage(p, { x: 40, y: 680, width: 220, height: 26, font });
  p.drawRectangle({
    x: 40,
    y: 590,
    width: 220,
    height: 28,
    color: rgb(1, 0.91, 0.8),
  });
  p.drawLine({
    start: { x: 40, y: 520 },
    end: { x: 260, y: 520 },
    thickness: 1,
  });
  p.drawRectangle({
    x: 40,
    y: 450,
    width: 13,
    height: 13,
    borderWidth: 1,
    borderColor: rgb(0, 0, 0),
  });
  p.drawLine({
    start: { x: 43, y: 453 },
    end: { x: 50, y: 460 },
    thickness: 1,
  });
  p.drawLine({
    start: { x: 43, y: 460 },
    end: { x: 50, y: 453 },
    thickness: 1,
  });
  p.drawRectangle({
    x: 40,
    y: 400,
    width: 7,
    height: 7,
    borderWidth: 1,
    borderColor: rgb(0, 0, 0),
  });
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "mixed.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await pdf.save()),
    });
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "Existing field", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".form-layer input[type=text]")).toHaveCount(3);
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await page.getByRole("checkbox").first().uncheck();
  await page.getByRole("checkbox").last().check();
  const bytes = await download(page),
    out = await PDFDocument.load(bytes);
  expect(
    out
      .getForm()
      .getFields()
      .filter((f) => f.constructor.name === "PDFCheckBox" && f.isChecked()),
  ).toHaveLength(1);
  // A white cover over the old printed mark lets an initially checked flat box actually clear.
  const clearedPixels = await page.evaluate(async (data) => {
    const { pdfjs } = await import("/src/lib/pdf.js");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise,
      p = await doc.getPage(1),
      v = p.getViewport({ scale: 1 }),
      c = document.createElement("canvas");
    c.width = v.width;
    c.height = v.height;
    await p.render({
      canvasContext: c.getContext("2d"),
      viewport: v,
      annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS,
    }).promise;
    return Array.from(
      c.getContext("2d").getImageData(44, 332, 5, 5).data,
    ).filter((v, i) => i % 4 !== 3 && v < 200).length;
  }, Array.from(bytes));
  expect(clearedPixels).toBe(0);
});

test("text and checkmarks default to black, and text is centered in the editor and exported PDF", async ({
  page,
}) => {
  await sample(page);
  const field = page.getByRole("textbox", { name: "0-Full name", exact: true });
  await field.fill("Centered name");
  expect(
    await field.evaluate((el) => ({
      align: getComputedStyle(el).textAlign,
      color: getComputedStyle(el).color,
    })),
  ).toEqual({ align: "center", color: "rgb(0, 0, 0)" });
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await clickPage(page, 60, 610);
  const input = page.getByRole("textbox", { name: "Annotation text" });
  await input.fill("Centered note");
  expect(await input.evaluate((el) => getComputedStyle(el).textAlign)).toBe(
    "center",
  );
  await page.getByRole("button", { name: "Save text", exact: true }).click();
  const annotation = page.locator(".annotations foreignObject div").first();
  expect(
    await annotation.evaluate((el) => ({
      align: getComputedStyle(el).textAlign,
      color: getComputedStyle(el).color,
    })),
  ).toEqual({ align: "center", color: "rgb(0, 0, 0)" });
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await clickPage(page, 350, 610);
  await expect(page.locator(".annotations path")).toHaveAttribute(
    "stroke",
    "#000000",
  );
  const bytes = await download(page),
    pdf = await PDFDocument.load(bytes),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const field of pdf
    .getForm()
    .getFields()
    .filter((f) => f.constructor.name === "PDFTextField"))
    expect(field.getAlignment()).toBe(1);
  const x = await page.evaluate(async (data) => {
    const { pdfjs } = await import("/src/lib/pdf.js");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
    return (await (await doc.getPage(1)).getTextContent()).items.find(
      (i) => i.str === "Centered note",
    ).transform[4];
  }, Array.from(bytes));
  expect(x).toBeCloseTo(
    60 + (240 - font.widthOfTextAtSize("Centered note", 16)) / 2,
    2,
  );
});
