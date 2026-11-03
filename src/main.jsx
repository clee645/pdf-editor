import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  FileText,
  Upload,
  Download,
  MousePointer2,
  Type,
  Highlighter,
  Pencil,
  Square,
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  RotateCw,
  ShieldCheck,
  ArrowUpRight,
  Check,
  X,
  PanelLeft,
  Trash2,
  Image as ImageIcon,
  PenLine,
  Eraser,
  Circle,
  Table2,
  CalendarDays,
  StickyNote,
  Stamp,
  Search,
  ScanLine,
  ArrowUp,
  ArrowDown,
  Printer,
  Maximize,
  TextCursorInput,
  Merge,
} from "lucide-react";
import {
  pdfjs,
  uid,
  openSource,
  inspectPage,
  detectPage,
  exportPDF,
  sampleFile,
} from "./lib/pdf";
import { Marks, Thumbnail, FormFields, Modal } from "./components";
import "./style.css";
const tools = [
  ["select", MousePointer2, "Select"],
  ["text", Type, "Text"],
  ["signature", PenLine, "Sign"],
  ["whiteout", Eraser, "Erase"],
  ["image", ImageIcon, "Image"],
  ["check", Check, "Check"],
  ["cross", X, "Cross"],
  ["shape", Circle, "Shapes"],
  ["table", Table2, "Table"],
  ["textbox", TextCursorInput, "Text box"],
  ["date", CalendarDays, "Date"],
  ["blackout", Square, "Blackout"],
  ["highlight", Highlighter, "Highlight"],
  ["draw", Pencil, "Draw"],
  ["sticky", StickyNote, "Sticky"],
  ["watermark", Stamp, "Watermark"],
];
const colors = ["#000000", "#293e34", "#3264bf", "#b84f43", "#dfb63f"];
const empty = { pages: [], marks: [], values: {} };
function SignaturePad({ onUse }) {
  const ref = useRef(),
    drawing = useRef(false),
    [hasInk, setHasInk] = useState(false);
  function point(e) {
    const c = ref.current,
      r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    };
  }
  return (
    <>
      <canvas
        className="signature-pad"
        width="600"
        height="180"
        ref={ref}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const p = point(e),
            ctx = ref.current.getContext("2d");
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          setHasInk(true);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const p = point(e),
            ctx = ref.current.getContext("2d");
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
      />
      <div className="modal-actions">
        <button
          className="outline"
          onClick={() => {
            ref.current.getContext("2d").clearRect(0, 0, 600, 180);
            setHasInk(false);
          }}
        >
          Clear
        </button>
        <button
          className="primary"
          disabled={!hasInk}
          onClick={() => onUse(ref.current.toDataURL("image/png"))}
        >
          Use signature
        </button>
      </div>
    </>
  );
}
function App() {
  const [sources, setSources] = useState([]),
    [state, setState] = useState(empty),
    [past, setPast] = useState([]),
    [future, setFuture] = useState([]),
    [activeId, setActiveId] = useState(null),
    [tool, setTool] = useState("select"),
    [mode, setMode] = useState("fill"),
    [zoom, setZoom] = useState(1),
    [color, setColor] = useState(colors[0]),
    [size, setSize] = useState(16),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [draft, setDraft] = useState(null),
    [textEdit, setTextEdit] = useState(null),
    [selected, setSelected] = useState(null),
    [showPages, setShowPages] = useState(true),
    [modal, setModal] = useState(null),
    [signature, setSignature] = useState(""),
    [signatureTab, setSignatureTab] = useState("type"),
    [pendingImage, setPendingImage] = useState(null),
    [shape, setShape] = useState("rectangle"),
    [table, setTable] = useState({ rows: 3, cols: 3, cells: [] }),
    [watermark, setWatermark] = useState("DRAFT"),
    [watermarkAll, setWatermarkAll] = useState(true),
    [query, setQuery] = useState(""),
    [showSearch, setShowSearch] = useState(false),
    [results, setResults] = useState([]),
    [resultIndex, setResultIndex] = useState(0),
    [editItems, setEditItems] = useState([]),
    [drag, setDrag] = useState(false),
    [focused, setFocused] = useState(null);
  const stateRef = useRef(state),
    input = useRef(),
    mergeInput = useRef(),
    imageInput = useRef(),
    canvas = useRef(),
    surface = useRef(),
    scroll = useRef(),
    gesture = useRef(),
    loadId = useRef(0),
    toastTimer = useRef();
  stateRef.current = state;
  const pg = state.pages.find((p) => p.id === activeId) || state.pages[0],
    source = pg && sources.find((s) => s.id === pg.sourceId),
    pageIndex = pg ? state.pages.findIndex((p) => p.id === pg.id) : 0;
  const notify = (t) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  };
  function change(fn, record = true) {
    const prev = stateRef.current,
      next = fn(prev);
    if (next === prev) return;
    if (record) {
      setPast((p) => [...p.slice(-99), prev]);
      setFuture([]);
    }
    stateRef.current = next;
    setState(next);
  }
  function undo() {
    setTextEdit(null);
    setSelected(null);
    if (!past.length) return;
    const prev = past[past.length - 1],
      current = stateRef.current;
    setFuture((v) => [...v, current]);
    setState(prev);
    stateRef.current = prev;
    setPast((v) => v.slice(0, -1));
  }
  function redo() {
    if (!future.length) return;
    setTextEdit(null);
    setSelected(null);
    const next = future[future.length - 1],
      current = stateRef.current;
    setPast((v) => [...v, current]);
    setState(next);
    stateRef.current = next;
    setFuture((v) => v.slice(0, -1));
  }
  function add(mark) {
    change((s) => ({
      ...s,
      marks: [...s.marks, { id: uid(), pageId: pg.id, color, size, ...mark }],
    }));
  }
  async function load(file, merge = false) {
    if (!file) return;
    if (
      !merge &&
      stateRef.current.pages.length &&
      (stateRef.current.marks.length ||
        Object.keys(stateRef.current.values).length) &&
      !window.confirm(
        "Open another PDF? Download first to keep your current edits.",
      )
    )
      return;
    const token = ++loadId.current;
    setBusy(true);
    setError("");
    setStatus("Opening PDF…");
    try {
      const s = await openSource(file),
        pages = [];
      for (let n = 1; n <= s.doc.numPages; n++)
        pages.push(await inspectPage(s, n));
      if (token !== loadId.current) return;
      if (merge) {
        setSources((v) => [...v, s]);
        change((v) => ({ ...v, pages: [...v.pages, ...pages] }));
      } else {
        setSources([s]);
        setState({ pages, marks: [], values: {} });
        stateRef.current = { pages, marks: [], values: {} };
        setPast([]);
        setFuture([]);
        setActiveId(pages[0].id);
        setZoom(1);
        setQuery("");
        setResults([]);
      }
      setTextEdit(null);
      setSelected(null);
      setMode("fill");
      setTool("select");
      for (let i = 0; i < pages.length; i++) {
        if (token !== loadId.current) return;
        setStatus(`Finding form fields · page ${i + 1} of ${pages.length}`);
        try {
          const fields = await detectPage(s, pages[i]);
          if (token !== loadId.current) return;
          change(
            (v) => ({
              ...v,
              pages: v.pages.map((p) =>
                p.id === pages[i].id
                  ? {
                      ...p,
                      fields: [
                        ...p.fields,
                        ...fields.filter(
                          (f) =>
                            !p.fields.some(
                              (old) =>
                                f.x < old.x + old.w &&
                                f.x + f.w > old.x &&
                                f.y < old.y + old.h &&
                                f.y + f.h > old.y,
                            ),
                        ),
                      ].sort((a, b) =>
                        Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x,
                      ),
                      detected: true,
                    }
                  : p,
              ),
            }),
            false,
          );
        } catch (e) {
          notify(
            `Page ${i + 1}: automatic field detection unavailable. Manual tools still work.`,
          );
        }
      }
      notify(
        merge ? "PDF pages added" : "PDF ready. Click a field to fill it in.",
      );
    } catch (e) {
      setError(
        "Unable to open this PDF. Please use a valid, unencrypted PDF file.",
      );
    } finally {
      if (token === loadId.current) {
        setBusy(false);
        setStatus("");
      }
    }
  }
  useEffect(() => {
    if (!pg || !source) return;
    let cancelled = false,
      task;
    (async () => {
      try {
        const p = await source.doc.getPage(pg.sourcePage);
        if (cancelled) return;
        const v = p.getViewport({
            scale: zoom * Math.min(window.devicePixelRatio || 1, 2),
          }),
          c = canvas.current;
        c.width = v.width;
        c.height = v.height;
        task = p.render({
          canvasContext: c.getContext("2d"),
          viewport: v,
          annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS,
        });
        await task.promise;
      } catch (e) {
        if (e.name !== "RenderingCancelledException")
          setError("This page could not be rendered.");
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [source, pg?.id, zoom]);
  useEffect(() => {
    if (!pg || !source || mode !== "edit") {
      setEditItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const p = await source.doc.getPage(pg.sourcePage),
        v = p.getViewport({ scale: 1 }),
        content = await p.getTextContent();
      if (cancelled) return;
      setEditItems(
        content.items
          .filter((i) => i.str?.trim())
          .map((i) => {
            const t = pdfjs.Util.transform(v.transform, i.transform),
              h = Math.hypot(t[2], t[3]);
            return {
              text: i.str,
              x: t[4],
              y: t[5] - h,
              w: i.width,
              h: h * 1.25,
              size: h,
            };
          }),
      );
    })();
    return () => (cancelled = true);
  }, [pg?.id, source, mode]);
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = [];
      for (const p of state.pages) {
        const src = sources.find((s) => s.id === p.sourceId),
          pdfPage = await src.doc.getPage(p.sourcePage),
          v = pdfPage.getViewport({ scale: 1 }),
          content = await pdfPage.getTextContent();
        for (const item of content.items) {
          if (item.str?.toLowerCase().includes(query.toLowerCase())) {
            const t = pdfjs.Util.transform(v.transform, item.transform),
              h = Math.hypot(t[2], t[3]);
            found.push({
              pageId: p.id,
              x: t[4],
              y: t[5] - h,
              w: item.width,
              h: h * 1.3,
            });
          }
        }
      }
      if (!cancelled) {
        setResults(found);
        setResultIndex(0);
        if (found[0]) setActiveId(found[0].pageId);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, state.pages, sources]);
  function setField(field, value) {
    change((s) => {
      const values = { ...s.values, [field.id]: value };
      if (field.type === "radio" && value)
        for (const p of s.pages)
          for (const other of p.fields)
            if (
              other.type === "radio" &&
              other.group === field.group &&
              p.sourceId === pg.sourceId &&
              other.id !== field.id
            )
              values[other.id] = false;
      if (field.native && field.name && field.type !== "radio")
        for (const p of s.pages)
          for (const other of p.fields)
            if (
              p.sourceId === pg.sourceId &&
              other.name === field.name &&
              other.type === field.type
            )
              values[other.id] = value;
      return { ...s, values };
    });
  }
  function commitText() {
    if (!textEdit) return;
    const m = {
      ...textEdit,
      text: textEdit.text,
      size: textEdit.size || size,
      color: textEdit.color || color,
    };
    if (m.text.trim()) {
      if (m.id)
        change((s) => ({
          ...s,
          marks: s.marks.map((old) => (old.id === m.id ? m : old)),
        }));
      else
        add({
          ...m,
          h: Math.max(m.h, m.text.split("\n").length * m.size * 1.2),
        });
    }
    setTextEdit(null);
  }
  function editMark(m) {
    if (m.type === "table") {
      setTable({ rows: m.rows, cols: m.cols, cells: m.cells || [], id: m.id });
      setModal("table");
      return;
    }
    if ("text" in m) {
      setSelected(m.id);
      setTextEdit({ ...m });
    }
  }
  function chooseTool(id) {
    commitText();
    setSelected(null);
    setMode("fill");
    if (id === "watermark") {
      setModal("watermark");
      return;
    }
    if (id === "signature") {
      setSignatureTab("type");
      setModal("signature");
      return;
    }
    if (id === "image") {
      imageInput.current.click();
      return;
    }
    if (id === "table") {
      setTable({ rows: 3, cols: 3, cells: [] });
      setModal("table");
      return;
    }
    setTool(id);
  }
  function point(e) {
    const r = surface.current.getBoundingClientRect(),
      x = (e.clientX - r.left) / zoom,
      y = (e.clientY - r.top) / zoom;
    switch (pg.rotation) {
      case 90:
        return { x: y, y: pg.h - x };
      case 180:
        return { x: pg.w - x, y: pg.h - y };
      case 270:
        return { x: pg.w - y, y: x };
      default:
        return { x, y };
    }
  }
  function down(e) {
    if (busy) return;
    if (e.button !== 0 || mode === "edit") return;
    if (textEdit) {
      commitText();
      return;
    }
    const p = point(e);
    if (tool === "select") {
      setSelected(null);
      return;
    }
    if (["text", "textbox", "sticky", "signature", "date"].includes(tool)) {
      const type = tool === "signature" && pendingImage ? "image" : tool;
      if (type === "image") {
        add({
          type,
          data: pendingImage.data,
          ...p,
          w: 220,
          h: 220 / pendingImage.ratio,
        });
        return;
      }
      if (tool === "date") {
        add({
          type: "date",
          ...p,
          w: 130,
          h: size * 1.4,
          text: new Date().toLocaleDateString(),
        });
        return;
      }
      if (tool === "signature") {
        add({
          type: "signature",
          ...p,
          w: Math.max(170, signature.length * size * 0.6),
          h: size * 2,
          text: signature,
          size: Math.max(22, size),
        });
        return;
      }
      setTextEdit({
        type: tool,
        ...p,
        w: Math.min(tool === "sticky" ? 180 : 240, pg.w - p.x),
        h: tool === "sticky" ? 100 : size * 1.5,
        text: "",
        size,
        color,
      });
      return;
    }
    if (tool === "image" && pendingImage) {
      add({
        type: "image",
        ...p,
        w: 200,
        h: 200 / pendingImage.ratio,
        data: pendingImage.data,
      });
      return;
    }
    if (tool === "check" || tool === "cross") {
      add({ type: tool, ...p, w: 18, h: 18 });
      return;
    }
    if (tool === "table") {
      add({
        type: "table",
        ...p,
        w: Math.min(340, pg.w - p.x - 5),
        h: table.rows * 38,
        rows: table.rows,
        cols: table.cols,
        cells: table.cells,
        size: 12,
      });
      return;
    }
    const type = tool === "shape" ? shape : tool;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      id: uid(),
      type,
      ...p,
      w: 0,
      h: 0,
      color,
      size,
      points: [p],
      pageId: pg.id,
    };
    setDraft({ ...gesture.current });
  }
  function startSelect(e, m) {
    if (tool !== "select") return;
    e.preventDefault();
    setSelected(m.id);
    const p = point(e);
    e.currentTarget.ownerSVGElement.setPointerCapture(e.pointerId);
    gesture.current = { operation: "move", original: m, start: p, ...m };
  }
  function move(e) {
    const g = gesture.current;
    if (!g) return;
    const p = point(e);
    if (g.operation === "move") {
      const dx = p.x - g.start.x,
        dy = p.y - g.start.y;
      g.preview = {
        ...g.original,
        x: g.original.x + dx,
        y: g.original.y + dy,
        points: g.original.points?.map((q) => ({ x: q.x + dx, y: q.y + dy })),
      };
      setDraft(g.preview);
      return;
    }
    if (g.operation === "resize") {
      g.preview = {
        ...g.original,
        w: Math.max(10, p.x - g.original.x),
        h: Math.max(10, p.y - g.original.y),
      };
      if (g.original.points)
        g.preview.points = g.original.points.map((q) => ({
          x: g.original.x + ((q.x - g.original.x) * g.preview.w) / g.original.w,
          y: g.original.y + ((q.y - g.original.y) * g.preview.h) / g.original.h,
        }));
      setDraft(g.preview);
      return;
    }
    g.w = p.x - g.x;
    g.h = p.y - g.y;
    if (g.type === "draw") g.points.push(p);
    setDraft({ ...g, points: [...g.points] });
  }
  function up(e) {
    const g = gesture.current;
    if (!g) return;
    if (g.operation) {
      if (e?.type === "pointerup") move(e);
      if (g.preview)
        change((s) => ({
          ...s,
          marks: s.marks.map((m) =>
            m.id === g.original.id ? { ...g.preview } : m,
          ),
        }));
    } else if (
      g.type === "draw"
        ? g.points.length > 1
        : Math.abs(g.w) > 3 && Math.abs(g.h) > 3
    ) {
      if (g.type === "draw") {
        const xs = g.points.map((p) => p.x),
          ys = g.points.map((p) => p.y);
        add({
          ...g,
          x: Math.min(...xs),
          y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs) || 1,
          h: Math.max(...ys) - Math.min(...ys) || 1,
        });
      } else if (g.type === "line")
        add({
          ...g,
          x: Math.min(g.x, g.x + g.w),
          y: Math.min(g.y, g.y + g.h),
          w: Math.abs(g.w),
          h: Math.abs(g.h),
          flipped: g.w * g.h < 0,
        });
      else
        add({
          ...g,
          x: Math.min(g.x, g.x + g.w),
          y: Math.min(g.y, g.y + g.h),
          w: Math.abs(g.w),
          h: Math.abs(g.h),
        });
    }
    gesture.current = null;
    setDraft(null);
  }
  function removeSelected() {
    if (!selected) return;
    change((s) => ({ ...s, marks: s.marks.filter((m) => m.id !== selected) }));
    setSelected(null);
    setTextEdit(null);
  }
  useEffect(() => {
    const handler = (e) => {
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        )
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selected) {
          e.preventDefault();
          removeSelected();
        }
      }
      if (e.key === "Escape") {
        setTextEdit(null);
        setSelected(null);
        setModal(null);
        setTool("select");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [past, future, selected]);
  async function download(print = false) {
    commitText();
    setBusy(true);
    setError("");
    try {
      let snapshot = stateRef.current;
      if (textEdit?.text.trim()) {
        const m = {
          ...textEdit,
          id: textEdit.id || uid(),
          pageId: pg.id,
          color: textEdit.color || color,
          size: textEdit.size || size,
        };
        snapshot = {
          ...snapshot,
          marks: [...snapshot.marks.filter((old) => old.id !== m.id), m],
        };
      }
      const data = await exportPDF(sources, snapshot),
        blob = new Blob([data], { type: "application/pdf" }),
        url = URL.createObjectURL(blob);
      if (print) {
        const win = window.open(url, "_blank");
        if (!win) notify("Allow pop-ups to open the printable PDF.");
        else notify("Use Print in the PDF viewer.");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download =
          (sources[0]?.name || "document.pdf").replace(/\.pdf$/i, "") +
          "-edited.pdf";
        a.click();
        notify("Your filled PDF has been downloaded.");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      console.error(e);
      setError(
        /WinAnsi|encode/i.test(e.message)
          ? "This text contains characters the PDF font cannot display. Use standard Latin characters and try again."
          : `Could not export the PDF: ${e.message || "Please try again."}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function findFields() {
    if (!pg || busy) return;
    setBusy(true);
    setStatus("Finding fields on this page…");
    try {
      const found = await detectPage(source, pg);
      change((s) => ({
        ...s,
        pages: s.pages.map((p) =>
          p.id === pg.id
            ? {
                ...p,
                fields: [
                  ...p.fields,
                  ...found.filter(
                    (f) =>
                      !p.fields.some(
                        (old) =>
                          Math.abs(old.x - f.x) < 6 &&
                          Math.abs(old.y - f.y) < 6,
                      ),
                  ),
                ],
                detected: true,
              }
            : p,
        ),
      }));
      notify(
        `${found.length} possible fields found. Click to fill; visual detection may miss some areas.`,
      );
    } catch (e) {
      setError(
        "Could not detect fields on this page. You can still use the Text and Check tools.",
      );
    } finally {
      setBusy(false);
      setStatus("");
    }
  }
  function fit() {
    if (!pg) return;
    const width = scroll.current.clientWidth - 50;
    setZoom(
      Math.max(0.25, Math.min(2, width / (pg.rotation % 180 ? pg.h : pg.w))),
    );
  }
  function navigate(id) {
    commitText();
    setSelected(null);
    setActiveId(id);
    scroll.current?.scrollTo({ top: 0, left: 0 });
  }
  function reorder(delta) {
    const i = pageIndex,
      j = i + delta;
    if (j < 0 || j >= state.pages.length) return;
    change((s) => {
      const pages = [...s.pages];
      [pages[i], pages[j]] = [pages[j], pages[i]];
      return { ...s, pages };
    });
  }
  function deletePage() {
    if (state.pages.length === 1) return;
    if (!window.confirm(`Delete page ${pageIndex + 1}? You can undo this.`))
      return;
    change((s) => ({ ...s, pages: s.pages.filter((p) => p.id !== pg.id) }));
    setActiveId(state.pages[Math.max(0, pageIndex - 1)].id);
    setSelected(null);
  }
  function addWatermark() {
    if (!watermark.trim()) return;
    change((s) => ({
      ...s,
      marks: [
        ...s.marks,
        ...s.pages
          .filter((p) => watermarkAll || p.id === pg.id)
          .map((p) => ({
            id: uid(),
            pageId: p.id,
            type: "watermark",
            text: watermark,
            x: p.w * 0.1,
            y: p.h * 0.44,
            w: p.w * 0.8,
            h: 90,
            size: Math.min(
              64,
              ((p.w * 0.8) / Math.max(1, watermark.length)) * 1.5,
            ),
            color,
          })),
      ],
    }));
    setModal(null);
  }
  async function imageChosen(file) {
    if (!file) return;
    try {
      const data = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        }),
        img = new window.Image();
      img.src = data;
      await img.decode();
      setPendingImage({ data, ratio: img.width / img.height });
      setTool("image");
      setMode("fill");
      notify("Click on the page to place the image.");
    } catch (e) {
      setError("Please choose a valid PNG or JPEG image.");
    }
  }
  const rotated = pg?.rotation % 180 !== 0,
    baseW = pg?.w * zoom,
    baseH = pg?.h * zoom,
    transform =
      pg?.rotation === 90
        ? `translate(${baseH}px,0) rotate(90deg)`
        : pg?.rotation === 180
          ? `translate(${baseW}px,${baseH}px) rotate(180deg)`
          : pg?.rotation === 270
            ? `translate(0,${baseW}px) rotate(270deg)`
            : "none";
  const displayMarks = pg
    ? [
        ...state.marks.filter(
          (m) =>
            m.pageId === pg.id && m.id !== draft?.id && m.id !== textEdit?.id,
        ),
        ...(draft ? [draft] : []),
      ]
    : [];
  const selectedMark = state.marks.find((m) => m.id === selected),
    fieldCount = state.pages.reduce((n, p) => n + p.fields.length, 0);
  const hint =
    mode === "edit"
      ? "Click existing text to replace it visually. Original content remains underneath."
      : tool === "select"
        ? "Click form fields to fill them. Select an added item to move, resize, edit, or delete it."
        : tool === "signature"
          ? "Click on the page to place your signature."
          : tool === "image"
            ? "Click to place your image. Select it to move or resize."
            : tool === "table"
              ? "Click to place your table. Double-click it with Select to edit cells."
              : tool === "shape"
                ? "Drag to draw the selected shape."
                : tool === "text" || tool === "textbox" || tool === "sticky"
                  ? "Click and type. Text is sized automatically; no dragging needed."
                  : tool === "check" || tool === "cross"
                    ? "Click to place a mark. Existing form checkboxes work in Select mode."
                    : tool === "whiteout" || tool === "blackout"
                      ? "Drag to visually cover content. This does not securely redact underlying PDF data."
                      : tool === "date"
                        ? "Click to insert today’s date. Double-click with Select to change it."
                        : "Drag on the page to annotate.";
  return (
    <div
      className={"app " + (pg ? "has-document" : "")}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        load(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          load(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={mergeInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          load(e.target.files[0], true);
          e.target.value = "";
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => {
          imageChosen(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <header>
        <a className="brand" href="/" aria-label="Paperwork home">
          <span className="brand-icon">
            <FileText size={22} />
          </span>
          paperwork<span className="brand-dot">.</span>
        </a>
        <div className="header-middle">
          A little less work. A lot more possibility.
        </div>
        <span className="private">
          <span />
          All files stay on your device
        </span>
        <button
          className="outline header-upload"
          disabled={busy}
          onClick={() => input.current.click()}
        >
          <Upload size={15} /> Open PDF
        </button>
      </header>
      {!pg && (
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">YOUR EVERYDAY PDF STUDIO</div>
            <h1>
              Your PDF, your way<span>.</span>
            </h1>
            <p>Click, fill, sign, and make it yours.</p>
          </div>
          <div className="heading-note">
            <ShieldCheck size={21} />
            <div>
              Private by design
              <span>No uploads. No sign-ups. Just you and your PDF.</span>
            </div>
          </div>
        </div>
      )}
      <main className={"editor " + (!pg ? "empty-editor" : "")}>
        <div className="document-bar">
          <div className="document-name">
            <FileText size={17} />
            <span>{pg ? sources[0]?.name : "Untitled workspace"}</span>
            {pg && <span className="file-badge">PDF</span>}
          </div>
          {pg && <div className="edit-fill-tab">Edit & fill</div>}
          <div className="document-actions">
            {pg && (
              <>
                <button
                  className="icon-button"
                  title="Merge PDF"
                  aria-label="Merge PDF"
                  disabled={busy}
                  onClick={() => mergeInput.current.click()}
                >
                  <Merge size={17} />
                </button>
                <button
                  className="icon-button"
                  title="Print PDF"
                  aria-label="Print PDF"
                  disabled={busy}
                  onClick={() => download(true)}
                >
                  <Printer size={17} />
                </button>
              </>
            )}
            <button
              className="download"
              disabled={!pg || busy}
              onClick={() => download()}
            >
              <Download size={16} />
              {busy ? "Please wait…" : "Download PDF"}
            </button>
          </div>
        </div>
        <div className="toolbar">
          <button
            className={"tool pages-toggle " + (showPages ? "active" : "")}
            aria-label="Toggle pages"
            onClick={() => setShowPages((v) => !v)}
          >
            <PanelLeft size={18} />
            <span>Pages</span>
          </button>
          <div className="history">
            <button
              title="Undo"
              aria-label="Undo"
              disabled={!past.length}
              onClick={undo}
            >
              <Undo2 size={17} />
            </button>
            <button
              title="Redo"
              aria-label="Redo"
              disabled={!future.length}
              onClick={redo}
            >
              <Redo2 size={17} />
            </button>
          </div>
          <div className="mode-switch">
            <button
              disabled={!pg || busy}
              className={mode === "fill" ? "active" : ""}
              onClick={() => {
                commitText();
                setMode("fill");
                setTool("select");
              }}
            >
              Fill out
            </button>
            <button
              disabled={!pg || busy}
              className={mode === "edit" ? "active" : ""}
              onClick={() => {
                commitText();
                setMode("edit");
                setTool("select");
              }}
            >
              Edit PDF
            </button>
          </div>
          <div className="tools">
            {tools.map(([id, Icon, label]) => (
              <button
                key={id}
                className={
                  tool === id && mode === "fill" ? "tool active" : "tool"
                }
                disabled={!pg || busy}
                onClick={() => chooseTool(id)}
                title={label}
                aria-label={label}
              >
                <Icon size={17} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <button
            className={"tool search-toggle " + (showSearch ? "active" : "")}
            aria-label="Search"
            disabled={!pg || busy}
            onClick={() => setShowSearch((v) => !v)}
          >
            <Search size={18} />
            <span>Search</span>
          </button>
        </div>
        {pg && (
          <div className="options">
            <span>{status || hint}</span>
            {tool === "shape" && (
              <select
                aria-label="Shape"
                value={shape}
                onChange={(e) => setShape(e.target.value)}
              >
                <option value="rectangle">Rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="line">Line</option>
              </select>
            )}
            {!["select", "whiteout", "blackout"].includes(tool) && (
              <>
                <div className="swatches">
                  {colors.map((c) => (
                    <button
                      key={c}
                      aria-label={"Color " + c}
                      style={{ background: c }}
                      className={c === color ? "selected" : ""}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
                <select
                  aria-label="Font size"
                  value={size}
                  onChange={(e) => setSize(+e.target.value)}
                >
                  {[10, 12, 14, 16, 20, 24, 32, 48].map((n) => (
                    <option key={n} value={n}>
                      {n} px
                    </option>
                  ))}
                </select>
              </>
            )}
            {selectedMark && (
              <>
                <button
                  className="outline"
                  onClick={() => editMark(selectedMark)}
                  disabled={
                    !("text" in selectedMark) && selectedMark.type !== "table"
                  }
                >
                  Edit item
                </button>
                <button
                  className="icon-button"
                  title="Delete selected item"
                  aria-label="Delete selected item"
                  onClick={removeSelected}
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <button
              className="outline detect-button"
              disabled={busy}
              onClick={findFields}
            >
              <ScanLine size={14} /> Find fields
            </button>
          </div>
        )}
        {showSearch && pg && (
          <div className="search-bar">
            <Search size={16} />
            <input
              aria-label="Search document"
              placeholder="Search text in this PDF…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span>
              {query
                ? `${results.length ? resultIndex + 1 : 0} / ${results.length}`
                : ""}
            </span>
            <button
              aria-label="Next search result"
              disabled={!results.length}
              onClick={() => {
                const i = (resultIndex + 1) % results.length;
                setResultIndex(i);
                navigate(results[i].pageId);
              }}
            >
              <ChevronRight size={16} />
            </button>
            <button
              aria-label="Close search"
              onClick={() => {
                setShowSearch(false);
                setQuery("");
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!pg ? (
          <div className="empty-stage">
            <div
              className="upload-card"
              onClick={() => !busy && input.current.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") input.current.click();
              }}
            >
              <div className="paper-illustration">
                <div className="paper-back" />
                <div className="paper-front">
                  <div className="fold" />
                  <span>PDF</span>
                  <i />
                  <i />
                  <i />
                </div>
                <div className="upload-bubble">
                  <Upload size={20} />
                </div>
                <span className="spark s1">✦</span>
                <span className="spark s2">✦</span>
              </div>
              <h2>A fresh start for your PDF.</h2>
              <p>
                Drop a PDF here. We’ll find the fields so you can just click and
                type.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  input.current.click();
                }}
              >
                <Plus size={17} /> Choose a PDF <ArrowUpRight size={16} />
              </button>
              <span className="upload-note">
                {busy
                  ? status
                  : "Fill forms. Add signatures. Download your finished PDF."}
              </span>
            </div>
            <button
              className="sample"
              disabled={busy}
              onClick={async () => load(await sampleFile())}
            >
              Just looking around?{" "}
              <span>
                Try a sample form <ArrowUpRight size={13} />
              </span>
            </button>
            <div className="stage-label">
              <ShieldCheck size={13} /> Your documents never leave your browser.
            </div>
          </div>
        ) : (
          <div className="loaded-stage">
            {showPages && (
              <aside>
                <div className="pages-label">
                  <PanelLeft size={14} /> PAGES{" "}
                  <span>{state.pages.length}</span>
                </div>
                <div className="page-management">
                  <button
                    aria-label="Move page up"
                    title="Move page up"
                    disabled={busy || !pageIndex}
                    onClick={() => reorder(-1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    aria-label="Move page down"
                    title="Move page down"
                    disabled={busy || pageIndex === state.pages.length - 1}
                    onClick={() => reorder(1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    aria-label="Delete page"
                    title="Delete page"
                    disabled={busy || state.pages.length === 1}
                    onClick={deletePage}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="page-list">
                  {state.pages.map((p, i) => (
                    <Thumbnail
                      key={p.id}
                      source={sources.find((s) => s.id === p.sourceId)}
                      pg={{ ...p, number: i + 1 }}
                      active={pg.id === p.id}
                      marks={state.marks.filter((m) => m.pageId === p.id)}
                      values={state.values}
                      onClick={() => navigate(p.id)}
                    />
                  ))}
                </div>
              </aside>
            )}
            <div className="canvas-scroll" ref={scroll}>
              <div
                className="page-frame"
                ref={surface}
                style={{
                  width: rotated ? baseH : baseW,
                  height: rotated ? baseW : baseH,
                }}
              >
                <div
                  className={"pdf-surface " + tool}
                  style={{ width: baseW, height: baseH, transform }}
                  onPointerDown={down}
                  onDragStart={(e) => e.preventDefault()}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={() => {
                    gesture.current = null;
                    setDraft(null);
                  }}
                >
                  <canvas ref={canvas} />
                  <FormFields
                    fields={pg.fields}
                    values={state.values}
                    onChange={setField}
                    zoom={zoom}
                    enabled={!busy && mode === "fill" && tool === "select"}
                    focused={focused}
                    onFocus={setFocused}
                  />
                  <svg
                    viewBox={`0 0 ${pg.w} ${pg.h}`}
                    className={
                      "annotations " + (tool === "select" ? "interactive" : "")
                    }
                    onPointerMove={move}
                    onPointerUp={up}
                  >
                    <Marks
                      marks={displayMarks}
                      interactive={tool === "select" && mode === "fill"}
                      selected={selected}
                      onSelect={startSelect}
                      onEdit={editMark}
                    />
                    {tool === "select" && selectedMark && (
                      <rect
                        className="resize-handle"
                        x={
                          (draft?.id === selected ? draft : selectedMark).x +
                          (draft?.id === selected ? draft : selectedMark).w -
                          4
                        }
                        y={
                          (draft?.id === selected ? draft : selectedMark).y +
                          (draft?.id === selected ? draft : selectedMark).h -
                          4
                        }
                        width="8"
                        height="8"
                        fill="#536d41"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.currentTarget.ownerSVGElement.setPointerCapture(
                            e.pointerId,
                          );
                          gesture.current = {
                            operation: "resize",
                            original: selectedMark,
                          };
                        }}
                      />
                    )}
                    {showSearch &&
                      results
                        .filter((r) => r.pageId === pg.id)
                        .map((r, i) => (
                          <rect
                            key={i}
                            x={r.x}
                            y={r.y}
                            width={r.w}
                            height={r.h}
                            fill="#f5c742"
                            opacity=".4"
                            pointerEvents="none"
                          />
                        ))}
                  </svg>
                  {mode === "edit" && (
                    <div className="edit-text-layer">
                      {editItems.map((t, i) => (
                        <button
                          key={i}
                          title={"Edit: " + t.text}
                          aria-label={"Edit text: " + t.text}
                          style={{
                            left: t.x * zoom,
                            top: t.y * zoom,
                            width: t.w * zoom,
                            height: t.h * zoom,
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() =>
                            setTextEdit({
                              ...t,
                              type: "edit",
                              text: t.text,
                              color: "#000000",
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                  {textEdit && (
                    <div
                      className={
                        "text-entry " +
                        (textEdit.type === "sticky" ? "sticky-entry" : "")
                      }
                      style={{
                        left: textEdit.x * zoom,
                        top: textEdit.y * zoom,
                        width: textEdit.w * zoom,
                        minHeight: textEdit.h * zoom,
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <textarea
                        autoFocus
                        aria-label="Annotation text"
                        placeholder={
                          textEdit.type === "sticky"
                            ? "Write a note…"
                            : "Type here…"
                        }
                        value={textEdit.text}
                        onChange={(e) => {
                          const text = e.target.value;
                          setTextEdit({
                            ...textEdit,
                            text,
                            h: Math.max(
                              textEdit.h,
                              (Math.ceil(
                                text.length /
                                  Math.max(
                                    1,
                                    textEdit.w /
                                      ((textEdit.size || size) * 0.55),
                                  ),
                              ) +
                                text.split("\n").length -
                                1) *
                                (textEdit.size || size) *
                                1.2,
                            ),
                          });
                        }}
                        style={{
                          fontSize: (textEdit.size || size) * zoom,
                          color: textEdit.color || color,
                          minHeight: textEdit.h * zoom,
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setTextEdit(null);
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                            commitText();
                        }}
                      />
                      <div className="text-entry-actions">
                        <button
                          title="Save text"
                          aria-label="Save text"
                          onClick={commitText}
                        >
                          <Check size={16} />
                        </button>
                        <button
                          title="Cancel text"
                          aria-label="Cancel text"
                          onClick={() => setTextEdit(null)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="editor-footer">
          <span>
            <span className="status-dot" />
            {pg
              ? `${fieldCount} fillable fields · private on your device`
              : "A clear space for your next idea"}
          </span>
          <div className="page-controls">
            <button
              aria-label="Previous page"
              disabled={!pg || pageIndex === 0}
              onClick={() => navigate(state.pages[pageIndex - 1].id)}
            >
              <ChevronLeft size={15} />
            </button>
            <span>
              {pg ? `${pageIndex + 1} / ${state.pages.length}` : "— / —"}
            </span>
            <button
              aria-label="Next page"
              disabled={!pg || pageIndex === state.pages.length - 1}
              onClick={() => navigate(state.pages[pageIndex + 1].id)}
            >
              <ChevronRight size={15} />
            </button>
            <i />
            <button
              aria-label="Rotate page"
              title="Rotate page"
              disabled={!pg || busy}
              onClick={() => {
                commitText();
                change((s) => ({
                  ...s,
                  pages: s.pages.map((p) =>
                    p.id === pg.id
                      ? { ...p, rotation: (p.rotation + 90) % 360 }
                      : p,
                  ),
                }));
              }}
            >
              <RotateCw size={14} />
            </button>
            <button
              aria-label="Zoom out"
              disabled={!pg || zoom <= 0.25}
              onClick={() => setZoom((v) => Math.max(0.25, v - 0.25))}
            >
              <Minus size={14} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              aria-label="Zoom in"
              disabled={!pg || zoom >= 3}
              onClick={() => setZoom((v) => Math.min(3, v + 0.25))}
            >
              <Plus size={14} />
            </button>
            <button
              aria-label="Fit page width"
              title="Fit page width"
              disabled={!pg || busy}
              onClick={fit}
            >
              <Maximize size={14} />
            </button>
          </div>
        </div>
      </main>
      {!pg && (
        <>
          <section className="features">
            <div>
              <span className="feature-icon">
                <TextCursorInput size={19} />
              </span>
              <div>
                <h3>Just click. Then type.</h3>
                <p>Form fields and checkboxes, ready to fill.</p>
              </div>
            </div>
            <div>
              <span className="feature-icon">
                <PenLine size={18} />
              </span>
              <div>
                <h3>Make your mark.</h3>
                <p>Sign, annotate, and edit in one place.</p>
              </div>
            </div>
            <div>
              <span className="feature-icon">
                <Download size={18} />
              </span>
              <div>
                <h3>Yours to keep. Ready to share.</h3>
                <p>Download a filled, editable PDF.</p>
              </div>
            </div>
          </section>
          <footer>
            <span>Less friction. More flow.</span>
            <span>
              Made for the work in front of you.{" "}
              <span className="tiny-flower">✳</span>
            </span>
          </footer>
        </>
      )}
      {modal === "signature" && (
        <Modal title="Add your signature" onClose={() => setModal(null)}>
          <div className="dialog-tabs">
            <button
              className={signatureTab === "type" ? "active" : ""}
              onClick={() => setSignatureTab("type")}
            >
              Type
            </button>
            <button
              className={signatureTab === "draw" ? "active" : ""}
              onClick={() => setSignatureTab("draw")}
            >
              Draw
            </button>
          </div>
          {signatureTab === "type" ? (
            <>
              <label>
                Your name
                <input
                  autoFocus
                  className="signature-name"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Your signature"
                />
              </label>
              <p className="dialog-note">
                This adds a visual signature, not a digital certificate.
              </p>
              <button
                className="primary"
                disabled={!signature.trim()}
                onClick={() => {
                  setPendingImage(null);
                  setTool("signature");
                  setModal(null);
                  notify("Click on the page to place your signature.");
                }}
              >
                Use signature
              </button>
            </>
          ) : (
            <SignaturePad
              onUse={(data) => {
                setPendingImage({ data, ratio: 600 / 180 });
                setTool("signature");
                setModal(null);
                notify("Click on the page to place your signature.");
              }}
            />
          )}
        </Modal>
      )}
      {modal === "table" && (
        <Modal
          title={table.id ? "Edit table" : "Create a table"}
          onClose={() => setModal(null)}
        >
          <div className="table-dimensions">
            <label>
              Rows
              <input
                aria-label="Table rows"
                type="number"
                min="1"
                max="20"
                value={table.rows}
                onChange={(e) =>
                  setTable({
                    ...table,
                    rows: Math.min(20, Math.max(1, +e.target.value)),
                    cells: [],
                  })
                }
              />
            </label>
            <label>
              Columns
              <input
                aria-label="Table columns"
                type="number"
                min="1"
                max="10"
                value={table.cols}
                onChange={(e) =>
                  setTable({
                    ...table,
                    cols: Math.min(10, Math.max(1, +e.target.value)),
                    cells: [],
                  })
                }
              />
            </label>
          </div>
          <div
            className="table-inputs"
            style={{
              gridTemplateColumns: `repeat(${table.cols},minmax(70px,1fr))`,
            }}
          >
            {Array.from({ length: table.rows * table.cols }, (_, i) => (
              <input
                key={i}
                aria-label={`Row ${Math.floor(i / table.cols) + 1} column ${(i % table.cols) + 1}`}
                value={table.cells[i] || ""}
                onChange={(e) => {
                  const cells = [...table.cells];
                  cells[i] = e.target.value;
                  setTable({ ...table, cells });
                }}
              />
            ))}
          </div>
          <button
            className="primary"
            onClick={() => {
              if (table.id)
                change((s) => ({
                  ...s,
                  marks: s.marks.map((m) =>
                    m.id === table.id ? { ...m, ...table } : m,
                  ),
                }));
              else {
                setTool("table");
                notify("Click the page to place your table.");
              }
              setModal(null);
            }}
          >
            {table.id ? "Save table" : "Place table"}
          </button>
        </Modal>
      )}
      {modal === "watermark" && (
        <Modal title="Add a watermark" onClose={() => setModal(null)}>
          <label>
            Watermark text
            <input
              autoFocus
              value={watermark}
              onChange={(e) => setWatermark(e.target.value)}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={watermarkAll}
              onChange={(e) => setWatermarkAll(e.target.checked)}
            />{" "}
            Apply to all pages
          </label>
          <button
            className="primary"
            disabled={!watermark.trim()}
            onClick={addWatermark}
          >
            Add watermark
          </button>
        </Modal>
      )}
      {error && (
        <div className="message error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div className="message" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {drag && (
        <div className="drop-overlay">
          <Upload size={40} />
          <h2>Drop your PDF here</h2>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
