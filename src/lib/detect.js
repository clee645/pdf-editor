// Local visual detection for flat forms. No document pixels leave the browser.
export function detectFlatFields(canvas, scale, pageId) {
  const { width: w, height: h } = canvas,
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, w, h).data,
    ink = new Uint8Array(w * h),
    seen = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) {
    const j = i * 4;
    ink[i] = image[j] < 135 && image[j + 1] < 135 && image[j + 2] < 135 ? 1 : 0;
  }
  const fields = [];
  const add = (type, x, y, width, height, checked = false) => {
    const f = {
      id: `auto-${pageId}-${fields.length}`,
      pageId,
      type,
      x: x / scale,
      y: y / scale,
      w: width / scale,
      h: height / scale,
      detected: true,
      label: type === "checkbox" ? "Detected checkbox" : "Detected text field",
      value: type === "checkbox" ? checked : "",
    };
    if (!fields.some((a) => Math.abs(a.x - f.x) < 4 && Math.abs(a.y - f.y) < 4))
      fields.push(f);
  };
  // Connected ink outlines distinguish small square controls from text glyphs.
  const queue = [];
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const at = y * w + x;
      if (!ink[at] || seen[at]) continue;
      queue.length = 0;
      queue.push(at);
      seen[at] = 1;
      let minX = x,
        maxX = x,
        minY = y,
        maxY = y,
        count = 0;
      for (let q = 0; q < queue.length; q++) {
        const p = queue[q],
          px = p % w,
          py = (p / w) | 0;
        count++;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
        for (const n of [p - 1, p + 1, p - w, p + w])
          if (n >= 0 && n < ink.length && !seen[n] && ink[n]) {
            seen[n] = 1;
            queue.push(n);
          }
      }
      const bw = maxX - minX + 1,
        bh = maxY - minY + 1;
      if (
        bw < 6 * scale ||
        bh < 6 * scale ||
        bw > 23 * scale ||
        bh > 23 * scale ||
        bw / bh < 0.72 ||
        bw / bh > 1.35
      )
        continue;
      const thick = Math.max(1, Math.round(scale * 0.5));
      let top = 0,
        bottom = 0,
        left = 0,
        right = 0;
      for (let xx = minX; xx <= maxX; xx++) {
        for (let k = 0; k < thick; k++) {
          if (ink[(minY + k) * w + xx]) {
            top++;
            break;
          }
        }
        for (let k = 0; k < thick; k++) {
          if (ink[(maxY - k) * w + xx]) {
            bottom++;
            break;
          }
        }
      }
      for (let yy = minY; yy <= maxY; yy++) {
        for (let k = 0; k < thick; k++) {
          if (ink[yy * w + minX + k]) {
            left++;
            break;
          }
        }
        for (let k = 0; k < thick; k++) {
          if (ink[yy * w + maxX - k]) {
            right++;
            break;
          }
        }
      }
      if (
        top / bw > 0.8 &&
        bottom / bw > 0.8 &&
        left / bh > 0.8 &&
        right / bh > 0.8 &&
        count / (bw * bh) < 0.65
      ) {
        const margin = Math.max(2, Math.ceil(scale * 2));
        let interior = 0,
          area = 0;
        for (let yy = minY + margin; yy <= maxY - margin; yy++)
          for (let xx = minX + margin; xx <= maxX - margin; xx++) {
            interior += ink[yy * w + xx];
            area++;
          }
        add("checkbox", minX, minY, bw, bh, area > 0 && interior / area > 0.08);
      }
    }
  // Group light, colored background runs (common shaded form entry areas).
  const bands = [];
  for (let y = 0; y < h; y += 2) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const i = (y * w + x) * 4,
        r = image[i],
        g = image[i + 1],
        b = image[i + 2];
      const colored =
        x < w &&
        Math.max(r, g, b) > 190 &&
        Math.min(r, g, b) > 145 &&
        Math.max(r, g, b) - Math.min(r, g, b) > 12;
      if (colored && start < 0) start = x;
      if (!colored && start >= 0) {
        if (x - start > 55 * scale) bands.push({ x: start, y, w: x - start });
        start = -1;
      }
    }
  }
  const areas = [];
  for (const b of bands) {
    const prev = areas.find(
      (a) =>
        Math.abs(a.x - b.x) < 4 &&
        Math.abs(a.w - b.w) < 5 &&
        b.y - a.bottom <= 4,
    );
    if (prev) prev.bottom = b.y;
    else areas.push({ ...b, bottom: b.y });
  }
  for (const a of areas) {
    const hh = a.bottom - a.y + 2;
    if (hh >= 10 * scale && hh <= 65 * scale) add("text", a.x, a.y, a.w, hh);
  }
  // Blank underlined entry areas. Reject table rows with intersecting vertical rules.
  for (let y = Math.ceil(24 * scale); y < h - 10; y++) {
    let start = -1;
    for (let x = 5; x < w - 5; x++) {
      if (ink[y * w + x] && start < 0) start = x;
      if ((!ink[y * w + x] || x === w - 6) && start >= 0) {
        const end = x,
          len = end - start;
        start = -1;
        if (len < 65 * scale || len > w * 0.9) continue;
        let blank = 0,
          total = 0,
          vertical = false;
        const top = y - Math.round(16 * scale);
        for (let yy = top; yy < y - 3; yy++)
          for (let xx = end - len + 4; xx < end - 4; xx += 2) {
            total++;
            if (!ink[yy * w + xx]) blank++;
          }
        for (const xx of [end - len, end - 1]) {
          let hits = 0;
          for (let yy = top; yy < y - 3; yy++) if (ink[yy * w + xx]) hits++;
          if (hits > (y - 3 - top) * 0.65) vertical = true;
        }
        const fy = top / scale,
          fx = (end - len) / scale;
        if (
          !vertical &&
          blank / total > 0.985 &&
          !fields.some(
            (f) =>
              fx < f.x + f.w &&
              end / scale > f.x &&
              fy < f.y + f.h &&
              y / scale > f.y,
          )
        )
          add("text", end - len, top, len, 16 * scale);
      }
    }
  }
  return fields.sort((a, b) =>
    Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x,
  );
}
