import React, { useRef, useEffect } from "react";
import { pdfjs } from "./lib/pdf";
export function Marks({
  marks,
  onSelect,
  selected,
  onEdit,
  interactive = false,
}) {
  return marks.map((m) => (
    <g
      key={m.id}
      className={interactive ? "mark-hit" : ""}
      onPointerDown={
        interactive
          ? (e) => {
              e.stopPropagation();
              onSelect(e, m);
            }
          : undefined
      }
      onDoubleClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onEdit(m);
            }
          : undefined
      }
    >
      {m.type === "image" ? (
        <image href={m.data} x={m.x} y={m.y} width={m.w} height={m.h} />
      ) : m.type === "draw" ? (
        <polyline
          points={m.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={m.color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : m.type === "check" || m.type === "cross" ? (
        <path
          d={
            m.type === "check"
              ? `M${m.x + m.w * 0.1},${m.y + m.h * 0.5} l${m.w * 0.3},${m.h * 0.3} l${m.w * 0.5},${-m.h * 0.65}`
              : `M${m.x + m.w * 0.15},${m.y + m.h * 0.15} l${m.w * 0.7},${m.h * 0.7} M${m.x + m.w * 0.85},${m.y + m.h * 0.15} l${-m.w * 0.7},${m.h * 0.7}`
          }
          fill="none"
          stroke={m.color}
          strokeWidth="2"
        />
      ) : m.type === "ellipse" ? (
        <ellipse
          cx={m.x + m.w / 2}
          cy={m.y + m.h / 2}
          rx={m.w / 2}
          ry={m.h / 2}
          fill="transparent"
          stroke={m.color}
          strokeWidth="2"
        />
      ) : m.type === "line" ? (
        <line
          x1={m.x}
          y1={m.flipped ? m.y + m.h : m.y}
          x2={m.x + m.w}
          y2={m.flipped ? m.y : m.y + m.h}
          stroke={m.color}
          strokeWidth="2"
        />
      ) : m.type === "table" ? (
        <>
          <rect
            x={m.x}
            y={m.y}
            width={m.w}
            height={m.h}
            fill="transparent"
            stroke={m.color}
          />
          {Array.from({ length: m.rows - 1 }, (_, r) => (
            <line
              key={"r" + r}
              x1={m.x}
              x2={m.x + m.w}
              y1={m.y + ((r + 1) * m.h) / m.rows}
              y2={m.y + ((r + 1) * m.h) / m.rows}
              stroke={m.color}
            />
          ))}
          {Array.from({ length: m.cols - 1 }, (_, c) => (
            <line
              key={"c" + c}
              y1={m.y}
              y2={m.y + m.h}
              x1={m.x + ((c + 1) * m.w) / m.cols}
              x2={m.x + ((c + 1) * m.w) / m.cols}
              stroke={m.color}
            />
          ))}
          {(m.cells || []).map((t, i) => (
            <foreignObject
              key={i}
              x={m.x + ((i % m.cols) * m.w) / m.cols + 4}
              y={m.y + (Math.floor(i / m.cols) * m.h) / m.rows + 4}
              width={m.w / m.cols - 8}
              height={m.h / m.rows - 8}
            >
              <div
                xmlns="http://www.w3.org/1999/xhtml"
                style={{
                  fontSize: m.size,
                  color: m.color,
                  textAlign: "center",
                  overflow: "hidden",
                  height: "100%",
                  whiteSpace: "pre-wrap",
                  fontFamily: "Helvetica, Arial, sans-serif",
                }}
              >
                {t}
              </div>
            </foreignObject>
          ))}
        </>
      ) : [
          "text",
          "textbox",
          "date",
          "signature",
          "sticky",
          "watermark",
          "edit",
        ].includes(m.type) ? (
        <>
          {["sticky", "edit"].includes(m.type) && (
            <rect
              x={m.x}
              y={m.y}
              width={m.w}
              height={m.h}
              fill={m.type === "sticky" ? "#fff5ad" : "white"}
            />
          )}
          <foreignObject x={m.x} y={m.y} width={m.w} height={m.h}>
            <div
              xmlns="http://www.w3.org/1999/xhtml"
              style={{
                fontSize: m.size,
                color: m.color,
                textAlign: "center",
                fontFamily:
                  m.type === "signature"
                    ? "Times New Roman, serif"
                    : "Helvetica, Arial, sans-serif",
                fontStyle: m.type === "signature" ? "italic" : "normal",
                whiteSpace: "pre-wrap",
                overflowWrap: "break-word",
                lineHeight: 1.2,
                opacity: m.type === "watermark" ? 0.22 : 1,
                padding: m.type === "sticky" ? 5 : 0,
                height: "100%",
                overflow: "hidden",
              }}
            >
              {m.text}
            </div>
          </foreignObject>
        </>
      ) : (
        <rect
          x={m.x}
          y={m.y}
          width={m.w}
          height={m.h}
          fill={
            m.type === "rectangle"
              ? "transparent"
              : m.type === "whiteout"
                ? "white"
                : m.type === "blackout"
                  ? "black"
                  : m.color
          }
          stroke={m.type === "rectangle" ? m.color : undefined}
          strokeWidth="2"
          opacity={m.type === "highlight" ? 0.3 : 1}
        />
      )}
      {interactive && (
        <rect
          x={m.x - 3}
          y={m.y - 3}
          width={m.w + 6}
          height={m.h + 6}
          fill="transparent"
          stroke={selected === m.id ? "#738c5d" : "transparent"}
          strokeWidth="1"
          strokeDasharray="4 3"
        />
      )}
    </g>
  ));
}
export function Thumbnail({ source, pg, active, marks, values, onClick }) {
  const ref = useRef();
  useEffect(() => {
    let task,
      cancelled = false;
    (async () => {
      try {
        const p = await source.doc.getPage(pg.sourcePage);
        if (cancelled) return;
        const v = p.getViewport({
          scale: 110 / pg.w,
          rotation: (pg.intrinsic + pg.rotation) % 360,
        });
        const c = ref.current;
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
          console.warn("Thumbnail could not be rendered");
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [source, pg.sourcePage, pg.rotation]);
  const r = pg.rotation % 180 === 0,
    transform =
      pg.rotation === 90
        ? `translate(${pg.h} 0) rotate(90)`
        : pg.rotation === 180
          ? `translate(${pg.w} ${pg.h}) rotate(180)`
          : pg.rotation === 270
            ? `translate(0 ${pg.w}) rotate(270)`
            : "";
  return (
    <button
      className={"page-item " + (active ? "selected" : "")}
      onClick={onClick}
      aria-label={`Go to page ${pg.number}`}
    >
      <div className="mini-page">
        <canvas ref={ref} />
        <svg viewBox={`0 0 ${r ? pg.w : pg.h} ${r ? pg.h : pg.w}`}>
          <g transform={transform}>
            <Marks marks={marks} />
            {pg.fields.map((f) => {
              const val = values[f.id] ?? f.value;
              return (
                <g key={f.id}>
                  <rect
                    x={f.x}
                    y={f.y}
                    width={f.w}
                    height={f.h}
                    fill="#e5edd633"
                    stroke="#a2b28a"
                    strokeWidth=".6"
                  />
                  {f.type === "checkbox" || f.type === "radio" ? (
                    val && (
                      <text key={f.id} x={f.x} y={f.y + f.h} fontSize={f.h}>
                        ✓
                      </text>
                    )
                  ) : (
                    <text
                      key={f.id}
                      x={f.x + f.w / 2}
                      textAnchor="middle"
                      fill="#000000"
                      y={f.y + f.h * 0.7}
                      fontSize={Math.min(14, f.h * 0.6)}
                    >
                      {String(val || "")}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <span>{pg.number}</span>
    </button>
  );
}
export function FormFields({
  fields,
  values,
  onChange,
  zoom,
  enabled,
  focused,
  onFocus,
}) {
  return (
    <div
      className={"form-layer " + (!enabled ? "inactive" : "")}
      aria-label="PDF form fields"
    >
      {fields.map((f, i) => {
        const value = values[f.id] ?? f.value,
          style = {
            left: f.x * zoom,
            top: f.y * zoom,
            width: f.w * zoom,
            height: f.h * zoom,
            fontSize: Math.min(14, Math.max(8, f.h * 0.62)) * zoom,
          };
        const props = {
          disabled: f.readOnly || !enabled,
          "aria-label": f.label || `Field ${i + 1}`,
          title: f.label || `Field ${i + 1}`,
          style,
          tabIndex: enabled ? 0 : -1,
          onPointerDown: (e) => e.stopPropagation(),
          onFocus: () => onFocus(f.id),
          "data-field-id": f.id,
        };
        if (f.type === "checkbox" || f.type === "radio")
          return (
            <input
              key={f.id}
              {...props}
              type={f.type === "radio" ? "radio" : "checkbox"}
              checked={!!value}
              onClick={(e) => {
                if (f.type === "radio" && value) {
                  e.preventDefault();
                  onChange(f, false);
                }
              }}
              onChange={(e) => onChange(f, e.target.checked)}
            />
          );
        if (f.type === "choice")
          return (
            <select
              key={f.id}
              {...props}
              value={value || ""}
              onChange={(e) => onChange(f, e.target.value)}
            >
              <option value="">Choose…</option>
              {f.options.map((o, i) => (
                <option key={i} value={o.exportValue || o}>
                  {o.displayValue || o.exportValue || o}
                </option>
              ))}
            </select>
          );
        return f.multiline ? (
          <textarea
            key={f.id}
            {...props}
            value={value || ""}
            onChange={(e) => onChange(f, e.target.value)}
            maxLength={f.maxLength || undefined}
          />
        ) : (
          <input
            key={f.id}
            {...props}
            type="text"
            value={value || ""}
            onChange={(e) => onChange(f, e.target.value)}
            maxLength={f.maxLength || undefined}
          />
        );
      })}
    </div>
  );
}
export function Modal({ title, onClose, children }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
