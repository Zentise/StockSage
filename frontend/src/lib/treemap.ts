export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarified treemap: areas proportional to weights, cells kept close to square. */
export function squarify(weights: number[], box: Rect): Rect[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const out: Rect[] = new Array(weights.length);
  if (total <= 0) return weights.map(() => ({ ...box, w: 0, h: 0 }));
  const order = weights.map((w, i) => ({ i, a: (w / total) * box.w * box.h })).sort((p, q) => q.a - p.a);
  let { x, y, w, h } = box;
  let row: typeof order = [];
  const worst = (r: typeof order, side: number) => {
    const s = r.reduce((a, b) => a + b.a, 0);
    const max = r[0]!.a, min = r[r.length - 1]!.a;
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const place = () => {
    const s = row.reduce((a, b) => a + b.a, 0);
    if (w >= h) {
      const cw = h > 0 ? s / h : 0;
      let cy = y;
      for (const c of row) {
        const ch = cw > 0 ? c.a / cw : 0;
        out[c.i] = { x, y: cy, w: cw, h: ch };
        cy += ch;
      }
      x += cw;
      w -= cw;
    } else {
      const ch = w > 0 ? s / w : 0;
      let cx = x;
      for (const c of row) {
        const cw = ch > 0 ? c.a / ch : 0;
        out[c.i] = { x: cx, y, w: cw, h: ch };
        cx += cw;
      }
      y += ch;
      h -= ch;
    }
    row = [];
  };
  for (const c of order) {
    const side = Math.min(w, h);
    if (row.length && worst([...row, c], side) > worst(row, side)) place();
    row.push(c);
  }
  if (row.length) place();
  return out;
}
