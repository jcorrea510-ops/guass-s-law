/* Electric Field Lab — 2D superposition of point charges
   Units: positions in metres, charges in nC, E in N/C, V in volts. */
(function () {
  'use strict';
  const { K, fmtSI, fmtNum, bindSlider, fitCanvas, arrow, toast, clamp } = window.EL;
  EL.buildNav('field');
  EL.renderAllTex();

  const NC = 1e-9;
  const DV_STEPS = [1, 2, 5, 10, 20, 50, 100];
  const MAX_LINES = 320;

  /* ---------------- State ---------------- */
  let nextId = 1;
  const state = {
    charges: [],
    selected: null,
    show: { lines: true, vectors: false, equi: true, heat: false, forces: false, grid: true, labels: true },
    vecLen: false,
    density: 3,
    dV: 10,
    snap: true,
    probeA: { on: true, x: 0, y: 2 },
    probeB: { on: false, x: 2.5, y: 2 },
    particles: [],
    tool: 'select',
    testSign: 1,
    massUg: 1,
    tscale: 0.5,
    paused: false
  };

  /* ---------------- Canvas & view ---------------- */
  const stage = document.getElementById('stage');
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const hud = document.getElementById('hud');
  const toastEl = document.getElementById('toast');
  const scaleHud = document.getElementById('scaleHud');
  const staticCv = document.createElement('canvas');
  const sctx = staticCv.getContext('2d');
  const heatCv = document.createElement('canvas');
  const hctx = heatCv.getContext('2d');

  const view = { w: 800, h: 600, dpr: 1, ppm: 80, cx: 400, cy: 300 };
  let dirtyStatic = true;

  function resize() {
    const { w, h, dpr } = fitCanvas(cv, ctx);
    view.w = w; view.h = h; view.dpr = dpr;
    view.ppm = clamp(Math.min(w, h) / 9, 34, 110);
    view.cx = w / 2; view.cy = h / 2;
    staticCv.width = cv.width; staticCv.height = cv.height;
    dirtyStatic = true;
    scaleHud.textContent = 'grid: 1 m · ' + Math.round(view.ppm) + ' px/m';
  }
  const toSX = x => view.cx + x * view.ppm;
  const toSY = y => view.cy - y * view.ppm;
  const toWX = sx => (sx - view.cx) / view.ppm;
  const toWY = sy => (view.cy - sy) / view.ppm;

  const chargeRadiusPx = c => c.small ? 6 : 10 + 2.6 * Math.sqrt(Math.abs(c.q));
  const chargeRadiusW = c => chargeRadiusPx(c) / view.ppm;

  /* ---------------- Physics ---------------- */
  // Fills out[0..1] with E (N/C) and returns V (volts) at (x, y)
  function field(x, y, out) {
    let ex = 0, ey = 0, v = 0;
    const cs = state.charges;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      const dx = x - c.x, dy = y - c.y;
      let r2 = dx * dx + dy * dy;
      if (r2 < 1e-12) r2 = 1e-12;
      const r = Math.sqrt(r2);
      const kq = K * c.q * NC;
      const f = kq / (r2 * r);
      ex += f * dx; ey += f * dy;
      v += kq / r;
    }
    out[0] = ex; out[1] = ey;
    return v;
  }
  const tmp = [0, 0];
  function potential(x, y) {
    let v = 0;
    for (const c of state.charges) {
      const r = Math.max(1e-6, Math.hypot(x - c.x, y - c.y));
      v += K * c.q * NC / r;
    }
    return v;
  }
  function forceOn(c) {
    let fx = 0, fy = 0;
    for (const o of state.charges) {
      if (o === c) continue;
      const dx = c.x - o.x, dy = c.y - o.y;
      const r2 = Math.max(1e-8, dx * dx + dy * dy), r = Math.sqrt(r2);
      const f = K * c.q * o.q * NC * NC / (r2 * r);
      fx += f * dx; fy += f * dy;
    }
    return [fx, fy];
  }
  function nearestCharge(x, y) {
    let best = null, bd = Infinity;
    for (const c of state.charges) {
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < bd) { bd = d; best = c; }
    }
    return { c: best, d: bd };
  }

  /* ---------------- Field lines ---------------- */
  function traceLine(src, angle, dir, arrivals) {
    // dir = +1 follows E (from + charge), −1 follows −E (from − charge)
    const r0 = chargeRadiusW(src);
    let x = src.x + Math.cos(angle) * r0 * 1.02;
    let y = src.y + Math.sin(angle) * r0 * 1.02;
    const pts = [x, y];
    const pxW = 1 / view.ppm;
    const xmin = toWX(-view.w * 0.6), xmax = toWX(view.w * 1.6);
    const ymin = toWY(view.h * 1.6), ymax = toWY(-view.h * 0.6);
    const cs = state.charges;
    const e = [0, 0];
    const dirAt = (px, py, o) => {
      field(px, py, e);
      const m = Math.hypot(e[0], e[1]);
      if (m === 0 || !isFinite(m)) { o[0] = 0; o[1] = 0; return 0; }
      o[0] = dir * e[0] / m; o[1] = dir * e[1] / m;
      return m;
    };
    const k1 = [0, 0], k2 = [0, 0], k3 = [0, 0], k4 = [0, 0];
    let end = null;
    for (let step = 0; step < 5000; step++) {
      // adaptive step: small near charges, ~3 px elsewhere
      let dmin = Infinity;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        const d = Math.hypot(x - c.x, y - c.y);
        if (c !== src || step > 3) {
          if (d < chargeRadiusW(c) && !(c === src && step < 8)) { end = c; break; }
        }
        if (d < dmin) dmin = d;
      }
      if (end) break;
      const h = clamp(0.25 * dmin, 0.6 * pxW, 3.5 * pxW);
      if (dirAt(x, y, k1) === 0) break;
      dirAt(x + k1[0] * h / 2, y + k1[1] * h / 2, k2);
      dirAt(x + k2[0] * h / 2, y + k2[1] * h / 2, k3);
      dirAt(x + k3[0] * h, y + k3[1] * h, k4);
      const nx = x + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      const ny = y + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      if (Math.hypot(nx - x, ny - y) < h * 0.05) break; // stagnation point
      x = nx; y = ny;
      pts.push(x, y);
      if (x < xmin || x > xmax || y < ymin || y > ymax) break;
    }
    if (end && end !== src) {
      // snap the end onto the charge's rim and record the arrival angle
      const a = Math.atan2(y - end.y, x - end.x);
      if (arrivals && Math.sign(end.q) === -Math.sign(src.q)) {
        (arrivals.get(end) || arrivals.set(end, []).get(end)).push(a);
      }
    }
    return { pts, dir };
  }

  function computeFieldLines() {
    const cs = state.charges;
    const totalAbs = cs.reduce((s, c) => s + Math.abs(c.q), 0);
    if (!totalAbs) return [];
    // per-charge counts, scaled down if the total would be excessive
    const posTotal = cs.filter(c => c.q > 0).reduce((s, c) => s + c.q, 0);
    const negTotal = cs.filter(c => c.q < 0).reduce((s, c) => s - c.q, 0);
    const big = Math.max(posTotal, negTotal);
    const density = Math.min(state.density, MAX_LINES / Math.max(big, 1e-9));
    const count = c => Math.max(2, Math.round(Math.abs(c.q) * density));
    const lines = [];
    const arrivals = new Map();
    for (const c of cs) {
      if (c.q <= 0) continue;
      const n = count(c);
      for (let k = 0; k < n; k++) lines.push(traceLine(c, Math.PI / n + 2 * Math.PI * k / n, 1, arrivals));
    }
    // negative charges: fill in lines that didn't come from a positive charge
    for (const c of cs) {
      if (c.q >= 0) continue;
      const n = count(c);
      const arr = (arrivals.get(c) || []).map(a => (a + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
      const need = n - arr.length;
      if (need <= 0) continue;
      const newAngles = [];
      if (arr.length === 0) {
        for (let k = 0; k < n; k++) newAngles.push(Math.PI / n + 2 * Math.PI * k / n);
      } else {
        const all = arr.slice();
        for (let k = 0; k < need; k++) {
          let gi = 0, gap = -1;
          for (let i = 0; i < all.length; i++) {
            const a = all[i], b = i + 1 < all.length ? all[i + 1] : all[0] + 2 * Math.PI;
            if (b - a > gap) { gap = b - a; gi = i; }
          }
          const na = all[gi] + gap / 2;
          newAngles.push(na);
          all.push(na % (2 * Math.PI));
          all.sort((a, b) => a - b);
        }
      }
      for (const a of newAngles) lines.push(traceLine(c, a, -1, null));
    }
    return lines;
  }

  /* ---------------- Marching squares ---------------- */
  function contourSegments(grid, cols, rows, step, levelsFn) {
    // grid: Float64Array of V at nodes (cols+1)*(rows+1); returns segments in screen px per level-sign
    const segs = { pos: [], neg: [], zero: [] };
    const W = cols + 1;
    const dV = state.dV;
    const maxK = 24;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = grid[j * W + i], b = grid[j * W + i + 1], c = grid[(j + 1) * W + i + 1], d = grid[(j + 1) * W + i];
        if (!isFinite(a) || !isFinite(b) || !isFinite(c) || !isFinite(d)) continue;
        const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
        let k0 = Math.ceil(lo / dV), k1 = Math.floor(hi / dV);
        if (k1 < k0) continue;
        k0 = Math.max(k0, -maxK); k1 = Math.min(k1, maxK);
        const x0 = i * step, y0 = j * step;
        for (let k = k0; k <= k1; k++) {
          const L = k * dV;
          let idx = 0;
          if (a > L) idx |= 8; if (b > L) idx |= 4; if (c > L) idx |= 2; if (d > L) idx |= 1;
          if (idx === 0 || idx === 15) continue;
          const t = (p, q) => (q === p ? 0.5 : (L - p) / (q - p));
          const top = () => [x0 + step * t(a, b), y0];
          const right = () => [x0 + step, y0 + step * t(b, c)];
          const bottom = () => [x0 + step * t(d, c), y0 + step];
          const left = () => [x0, y0 + step * t(a, d)];
          const out = k === 0 ? segs.zero : (k > 0 ? segs.pos : segs.neg);
          const add = (p, q) => out.push(p[0], p[1], q[0], q[1]);
          const center = (a + b + c + d) / 4;
          switch (idx) {
            case 1: case 14: add(left(), bottom()); break;
            case 2: case 13: add(bottom(), right()); break;
            case 3: case 12: add(left(), right()); break;
            case 4: case 11: add(top(), right()); break;
            case 6: case 9: add(top(), bottom()); break;
            case 7: case 8: add(left(), top()); break;
            case 5: // a<, b>, c<, d>  (saddle)
              if (center > L) { add(left(), top()); add(bottom(), right()); }
              else { add(left(), bottom()); add(top(), right()); }
              break;
            case 10: // a>, b<, c>, d<
              if (center > L) { add(top(), right()); add(left(), bottom()); }
              else { add(left(), top()); add(bottom(), right()); }
              break;
          }
        }
      }
    }
    return segs;
  }

  /* ---------------- Static layer rendering ---------------- */
  function renderStatic() {
    const { w, h, dpr } = view;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, staticCv.width, staticCv.height);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // background
    const g = sctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, '#0b1124'); g.addColorStop(1, '#060914');
    sctx.fillStyle = g; sctx.fillRect(0, 0, w, h);

    const cs = state.charges;
    const step = 5;
    const cols = Math.ceil(w / step), rows = Math.ceil(h / step);
    let grid = null;
    if ((state.show.equi || state.show.heat) && cs.length) {
      grid = new Float64Array((cols + 1) * (rows + 1));
      for (let j = 0; j <= rows; j++) {
        const y = toWY(j * step);
        for (let i = 0; i <= cols; i++) {
          const x = toWX(i * step);
          let v = 0, inside = false;
          for (let n = 0; n < cs.length; n++) {
            const c = cs[n];
            const r = Math.hypot(x - c.x, y - c.y);
            if (r < chargeRadiusW(c) * 0.55) inside = true;
            v += K * c.q * NC / Math.max(r, 1e-6);
          }
          grid[j * (cols + 1) + i] = inside ? NaN : v;
        }
      }
    }

    // potential heat map
    if (state.show.heat && grid) {
      heatCv.width = cols + 1; heatCv.height = rows + 1;
      const img = hctx.createImageData(cols + 1, rows + 1);
      const Vs = state.dV * 6;
      for (let n = 0; n < grid.length; n++) {
        let v = grid[n];
        if (!isFinite(v)) {
          // fill singular nodes with neighbour sign
          v = 1e9 * Math.sign(potential(toWX((n % (cols + 1)) * step), toWY(Math.floor(n / (cols + 1)) * step)));
        }
        const t = Math.tanh(v / Vs);
        const a = Math.abs(t);
        const p = n * 4;
        if (t > 0) { img.data[p] = 255; img.data[p + 1] = 70 + 40 * (1 - a); img.data[p + 2] = 80; }
        else { img.data[p] = 50; img.data[p + 1] = 140 + 20 * (1 - a); img.data[p + 2] = 255; }
        img.data[p + 3] = Math.round(Math.pow(a, 0.8) * 150);
      }
      hctx.putImageData(img, 0, 0);
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(heatCv, 0, 0, cols + 1, rows + 1, 0, 0, (cols + 1) * step, (rows + 1) * step);
    }

    // grid & axes
    if (state.show.grid) drawGrid(sctx);

    // equipotentials
    if (state.show.equi && grid) {
      const segs = contourSegments(grid, cols, rows, step);
      const strokeSegs = (arr, style, width, dash) => {
        if (!arr.length) return;
        sctx.strokeStyle = style; sctx.lineWidth = width; sctx.setLineDash(dash || []);
        sctx.beginPath();
        for (let i = 0; i < arr.length; i += 4) { sctx.moveTo(arr[i], arr[i + 1]); sctx.lineTo(arr[i + 2], arr[i + 3]); }
        sctx.stroke();
      };
      sctx.lineCap = 'round';
      strokeSegs(segs.pos, 'rgba(87, 227, 137, 0.62)', 1.2);
      strokeSegs(segs.neg, 'rgba(87, 227, 200, 0.62)', 1.2, [5, 4]);
      strokeSegs(segs.zero, 'rgba(220, 255, 230, 0.9)', 1.8, [2, 4]);
      sctx.setLineDash([]);
    }

    // vector grid
    if (state.show.vectors && cs.length) drawVectors(sctx);

    // field lines
    if (state.show.lines && cs.length) drawFieldLines(sctx, computeFieldLines());

    dirtyStatic = false;
  }

  function drawGrid(c) {
    const { w, h, ppm } = view;
    const x0 = Math.floor(toWX(0)), x1 = Math.ceil(toWX(w));
    const y0 = Math.floor(toWY(h)), y1 = Math.ceil(toWY(0));
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(51, 64, 106, 0.22)';
    c.beginPath();
    for (let x = x0; x <= x1; x += 0.5) { const sx = Math.round(toSX(x)) + 0.5; c.moveTo(sx, 0); c.lineTo(sx, h); }
    for (let y = y0; y <= y1; y += 0.5) { const sy = Math.round(toSY(y)) + 0.5; c.moveTo(0, sy); c.lineTo(w, sy); }
    c.stroke();
    c.strokeStyle = 'rgba(51, 64, 106, 0.45)';
    c.beginPath();
    for (let x = x0; x <= x1; x++) { const sx = Math.round(toSX(x)) + 0.5; c.moveTo(sx, 0); c.lineTo(sx, h); }
    for (let y = y0; y <= y1; y++) { const sy = Math.round(toSY(y)) + 0.5; c.moveTo(0, sy); c.lineTo(w, sy); }
    c.stroke();
    c.strokeStyle = 'rgba(120, 140, 200, 0.55)';
    c.beginPath();
    c.moveTo(0, Math.round(toSY(0)) + 0.5); c.lineTo(w, Math.round(toSY(0)) + 0.5);
    c.moveTo(Math.round(toSX(0)) + 0.5, 0); c.lineTo(Math.round(toSX(0)) + 0.5, h);
    c.stroke();
    c.fillStyle = 'rgba(154, 166, 196, 0.6)';
    c.font = '10.5px ' + getComputedStyle(document.body).getPropertyValue('--mono');
    c.textAlign = 'center'; c.textBaseline = 'top';
    const labStep = ppm < 50 ? 2 : 1;
    for (let x = x0; x <= x1; x++) if (x !== 0 && x % labStep === 0) c.fillText(x + ' m', toSX(x), toSY(0) + 4);
    c.textAlign = 'left'; c.textBaseline = 'middle';
    for (let y = y0; y <= y1; y++) if (y !== 0 && y % labStep === 0) c.fillText(y + ' m', toSX(0) + 5, toSY(y));
  }

  function drawVectors(c) {
    const { w, h } = view;
    const sp = 34;
    const pts = [];
    const e = [0, 0];
    for (let sy = sp / 2; sy < h; sy += sp) {
      for (let sx = sp / 2; sx < w; sx += sp) {
        const x = toWX(sx), y = toWY(sy);
        const nc = nearestCharge(x, y);
        if (nc.c && nc.d < chargeRadiusW(nc.c) + 8 / view.ppm) continue;
        field(x, y, e);
        const m = Math.hypot(e[0], e[1]);
        if (!(m > 0)) continue;
        pts.push([sx, sy, e[0] / m, e[1] / m, m]);
      }
    }
    if (!pts.length) return;
    const mags = pts.map(p => p[4]).sort((a, b) => a - b);
    const lo = Math.log10(mags[Math.floor(mags.length * 0.05)]);
    const hi = Math.log10(mags[Math.floor(mags.length * 0.95)]);
    const ref = mags[Math.floor(mags.length * 0.9)];
    for (const [sx, sy, ux, uy, m] of pts) {
      const t = clamp((Math.log10(m) - lo) / Math.max(hi - lo, 1e-6), 0, 1);
      const L = state.vecLen ? clamp(m / ref, 0.08, 1) * sp * 0.9 : sp * 0.72;
      const r = Math.round(90 + 165 * t), gg = Math.round(110 + 99 * t), b = Math.round(170 - 68 * t);
      c.strokeStyle = c.fillStyle = `rgba(${r},${gg},${b},${0.35 + 0.65 * t})`;
      const dx = ux * L / 2, dy = -uy * L / 2;
      arrow(c, sx - dx, sy - dy, sx + dx, sy + dy, 6, 1.5);
    }
  }

  function drawFieldLines(c, lines) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = 'rgba(226, 233, 255, 0.78)';
    c.lineWidth = 1.35;
    c.beginPath();
    for (const L of lines) {
      const p = L.pts;
      c.moveTo(toSX(p[0]), toSY(p[1]));
      for (let i = 2; i < p.length; i += 2) c.lineTo(toSX(p[i]), toSY(p[i + 1]));
    }
    c.stroke();
    // arrowheads along each line, pointing along E
    c.fillStyle = 'rgba(236, 241, 255, 0.95)';
    for (const L of lines) {
      const p = L.pts;
      let s = 0, next = 46 + 0; // px
      for (let i = 2; i < p.length; i += 2) {
        const ax = toSX(p[i - 2]), ay = toSY(p[i - 1]), bx = toSX(p[i]), by = toSY(p[i + 1]);
        const ds = Math.hypot(bx - ax, by - ay);
        s += ds;
        if (s >= next && i + 2 < p.length) {
          if (bx > -20 && bx < view.w + 20 && by > -20 && by < view.h + 20) {
            let ux = (bx - ax) / (ds || 1), uy = (by - ay) / (ds || 1);
            if (L.dir < 0) { ux = -ux; uy = -uy; }
            c.beginPath();
            c.moveTo(bx + ux * 5, by + uy * 5);
            c.lineTo(bx - ux * 4 - uy * 4, by - uy * 4 + ux * 4);
            c.lineTo(bx - ux * 4 + uy * 4, by - uy * 4 - ux * 4);
            c.closePath(); c.fill();
          }
          next += 150;
        }
      }
    }
  }

  /* ---------------- Dynamic layer ---------------- */
  function drawCharges(c) {
    const cs = state.charges;
    // forces
    if (state.show.forces && cs.length > 1) {
      const fs = cs.map(forceOn);
      const mags = fs.map(f => Math.hypot(f[0], f[1]));
      const fmax = Math.max(...mags) || 1;
      c.strokeStyle = c.fillStyle = '#ff9f43';
      c.font = '600 11px ' + getComputedStyle(document.body).getPropertyValue('--mono');
      cs.forEach((ch, i) => {
        const m = mags[i];
        if (!(m > 0) || ch.small) return;
        const L = 18 + 62 * Math.sqrt(m / fmax);
        const ux = fs[i][0] / m, uy = fs[i][1] / m;
        const r = chargeRadiusPx(ch);
        const sx = toSX(ch.x), sy = toSY(ch.y);
        arrow(c, sx + ux * r, sy - uy * r, sx + ux * (r + L), sy - uy * (r + L), 9, 2.6);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(fmtSI(m, 'N', 3), sx + ux * (r + L + 22), sy - uy * (r + L + 12));
      });
      // plate/rod charges: draw thin
      cs.forEach((ch, i) => {
        const m = mags[i];
        if (!(m > 0) || !ch.small) return;
        const L = 6 + 22 * Math.sqrt(m / fmax);
        const ux = fs[i][0] / m, uy = fs[i][1] / m;
        const sx = toSX(ch.x), sy = toSY(ch.y);
        arrow(c, sx, sy, sx + ux * (6 + L), sy - uy * (6 + L), 5, 1.4);
      });
    }
    for (const ch of cs) {
      const sx = toSX(ch.x), sy = toSY(ch.y), r = chargeRadiusPx(ch);
      const pos = ch.q > 0;
      const glow = c.createRadialGradient(sx, sy, r * 0.2, sx, sy, r * 2.4);
      glow.addColorStop(0, pos ? 'rgba(255,93,93,0.35)' : 'rgba(77,163,255,0.35)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = glow;
      c.beginPath(); c.arc(sx, sy, r * 2.4, 0, Math.PI * 2); c.fill();
      const body = c.createRadialGradient(sx - r * 0.35, sy - r * 0.35, r * 0.1, sx, sy, r);
      if (pos) { body.addColorStop(0, '#ffb0b0'); body.addColorStop(1, '#e23c3c'); }
      else { body.addColorStop(0, '#b5dcff'); body.addColorStop(1, '#2a77d6'); }
      c.fillStyle = body;
      c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill();
      if (state.selected === ch) {
        c.strokeStyle = '#ffd166'; c.lineWidth = 2; c.setLineDash([4, 3]);
        c.beginPath(); c.arc(sx, sy, r + 5, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      }
      c.strokeStyle = 'rgba(255,255,255,0.95)';
      c.lineWidth = ch.small ? 1.4 : 2.2;
      const s = r * 0.48;
      c.beginPath(); c.moveTo(sx - s, sy); c.lineTo(sx + s, sy);
      if (pos) { c.moveTo(sx, sy - s); c.lineTo(sx, sy + s); }
      c.stroke();
      if (state.show.labels && !ch.small) {
        c.font = '600 11px ' + getComputedStyle(document.body).getPropertyValue('--mono');
        c.textAlign = 'center'; c.textBaseline = 'top';
        const txt = (ch.q > 0 ? '+' : '−') + fmtNum(Math.abs(ch.q), 3) + ' nC';
        c.fillStyle = 'rgba(7,11,23,0.7)';
        const tw = c.measureText(txt).width;
        c.fillRect(sx - tw / 2 - 3, sy + r + 4, tw + 6, 15);
        c.fillStyle = pos ? '#ffb3b3' : '#b3d8ff';
        c.fillText(txt, sx, sy + r + 5);
      }
    }
  }

  function drawProbe(c, p, label) {
    const sx = toSX(p.x), sy = toSY(p.y);
    const e = [0, 0];
    field(p.x, p.y, e);
    const m = Math.hypot(e[0], e[1]);
    if (m > 0 && isFinite(m)) {
      const L = 58;
      const ux = e[0] / m, uy = e[1] / m;
      c.strokeStyle = c.fillStyle = 'rgba(255, 209, 102, 0.55)';
      c.setLineDash([3, 3]);
      if (Math.abs(ux) > 0.02) arrow(c, sx, sy, sx + ux * L, sy, 6, 1.4);
      if (Math.abs(uy) > 0.02) arrow(c, sx, sy, sx, sy - uy * L, 6, 1.4);
      c.setLineDash([]);
      c.strokeStyle = c.fillStyle = '#ffd166';
      arrow(c, sx, sy, sx + ux * L, sy - uy * L, 10, 2.6);
    }
    c.strokeStyle = '#ffd166'; c.lineWidth = 2;
    c.fillStyle = 'rgba(255, 209, 102, 0.18)';
    c.beginPath(); c.arc(sx, sy, 9, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(sx - 13, sy); c.lineTo(sx - 4, sy); c.moveTo(sx + 4, sy); c.lineTo(sx + 13, sy);
    c.moveTo(sx, sy - 13); c.lineTo(sx, sy - 4); c.moveTo(sx, sy + 4); c.lineTo(sx, sy + 13); c.stroke();
    c.font = '700 12px ' + getComputedStyle(document.body).getPropertyValue('--sans');
    c.fillStyle = '#ffd166'; c.textAlign = 'left'; c.textBaseline = 'bottom';
    c.fillText(label, sx + 10, sy - 8);
  }

  function drawParticles(c) {
    for (const p of state.particles) {
      if (p.trail.length > 2) {
        c.strokeStyle = p.q0 > 0 ? 'rgba(255, 140, 140, 0.75)' : 'rgba(140, 200, 255, 0.75)';
        c.lineWidth = 1.8; c.lineJoin = 'round';
        c.beginPath();
        c.moveTo(toSX(p.trail[0]), toSY(p.trail[1]));
        for (let i = 2; i < p.trail.length; i += 2) c.lineTo(toSX(p.trail[i]), toSY(p.trail[i + 1]));
        c.stroke();
      }
      const sx = toSX(p.x), sy = toSY(p.y);
      c.fillStyle = p.q0 > 0 ? '#ff8080' : '#80c4ff';
      c.strokeStyle = '#fff'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(sx, sy, 6, 0, Math.PI * 2); c.fill(); c.stroke();
      if (p.alive) {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 1e-3) {
          c.strokeStyle = c.fillStyle = 'rgba(195, 155, 255, 0.9)';
          const L = clamp(sp * 6, 10, 60);
          arrow(c, sx, sy, sx + p.vx / sp * L, sy - p.vy / sp * L, 6, 1.6);
        }
      } else if (p.status) {
        c.font = '600 11px ' + getComputedStyle(document.body).getPropertyValue('--sans');
        c.fillStyle = '#c39bff'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(p.status, sx + 10, sy);
      }
    }
    if (launch.active) {
      const sx = toSX(launch.x), sy = toSY(launch.y);
      c.fillStyle = state.testSign > 0 ? '#ff8080' : '#80c4ff';
      c.beginPath(); c.arc(sx, sy, 6, 0, Math.PI * 2); c.fill();
      const ex = toSX(launch.ex), ey = toSY(launch.ey);
      if (Math.hypot(ex - sx, ey - sy) > 4) {
        c.strokeStyle = c.fillStyle = '#c39bff';
        c.setLineDash([5, 4]); arrow(c, sx, sy, ex, ey, 10, 2); c.setLineDash([]);
        const v = launchVelocity();
        c.font = '600 12px ' + getComputedStyle(document.body).getPropertyValue('--mono');
        c.fillText('v₀ = ' + fmtNum(Math.hypot(v[0], v[1]), 3) + ' m/s', ex + 10, ey - 10);
      }
    }
  }

  function render() {
    if (dirtyStatic) renderStatic();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticCv, 0, 0);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    if (state.probeA.on && state.probeB.on) {
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(toSX(state.probeA.x), toSY(state.probeA.y)); ctx.lineTo(toSX(state.probeB.x), toSY(state.probeB.y)); ctx.stroke();
      ctx.setLineDash([]);
    }
    drawCharges(ctx);
    drawParticles(ctx);
    if (state.probeA.on) drawProbe(ctx, state.probeA, 'A');
    if (state.probeB.on) drawProbe(ctx, state.probeB, 'B');
  }

  /* ---------------- Test-charge dynamics ---------------- */
  const launch = { active: false, x: 0, y: 0, ex: 0, ey: 0 };
  const V_PER_M = 2; // drag 1 m → 2 m/s
  function launchVelocity() { return [(launch.ex - launch.x) * V_PER_M, (launch.ey - launch.y) * V_PER_M]; }

  function spawnParticle(x, y, vx, vy) {
    const q0 = state.testSign * NC, m = state.massUg * 1e-9;
    const p = { x, y, vx, vy, q0, m, trail: [x, y], alive: true, status: '' };
    p.E0 = energy(p).E;
    state.particles.push(p);
    if (state.particles.length > 8) state.particles.shift();
  }
  function energy(p) {
    const K_ = 0.5 * p.m * (p.vx * p.vx + p.vy * p.vy);
    const U = p.q0 * potential(p.x, p.y);
    return { K: K_, U, E: K_ + U };
  }
  function stepParticles(dt) {
    const e = [0, 0];
    const bx = Math.max(view.w, view.h) / view.ppm * 2.5;
    for (const p of state.particles) {
      if (!p.alive) continue;
      let t = 0, guard = 0;
      while (t < dt && guard++ < 4000) {
        field(p.x, p.y, e);
        let ax = p.q0 * e[0] / p.m, ay = p.q0 * e[1] / p.m;
        const nc = nearestCharge(p.x, p.y);
        const dmin = nc.d;
        const a = Math.hypot(ax, ay), v = Math.hypot(p.vx, p.vy);
        let h = dt - t;
        if (a > 0) h = Math.min(h, 0.05 * Math.sqrt(dmin / a));
        if (v > 0) h = Math.min(h, 0.02 * dmin / v);
        h = Math.max(h, 1e-7);
        // velocity Verlet
        p.vx += 0.5 * h * ax; p.vy += 0.5 * h * ay;
        p.x += h * p.vx; p.y += h * p.vy;
        field(p.x, p.y, e);
        ax = p.q0 * e[0] / p.m; ay = p.q0 * e[1] / p.m;
        p.vx += 0.5 * h * ax; p.vy += 0.5 * h * ay;
        t += h;
        const n2 = nearestCharge(p.x, p.y);
        if (n2.c && n2.d < chargeRadiusW(n2.c) * 0.9) { p.alive = false; p.status = 'hit a charge'; break; }
        if (Math.abs(p.x) > bx || Math.abs(p.y) > bx) { p.alive = false; p.status = 'escaped'; break; }
      }
      const tr = p.trail;
      const lx = tr[tr.length - 2], ly = tr[tr.length - 1];
      if (Math.hypot(p.x - lx, p.y - ly) * view.ppm > 1.5) tr.push(p.x, p.y);
      if (tr.length > 6000) tr.splice(0, 2);
    }
  }

  /* ---------------- UI wiring ---------------- */
  const $ = id => document.getElementById(id);
  const snapV = v => state.snap ? Math.round(v * 4) / 4 : Math.round(v * 1000) / 1000;

  function addCharge(x, y, q, extra) {
    const c = Object.assign({ id: nextId++, x, y, q }, extra || {});
    state.charges.push(c);
    return c;
  }
  function freeSpot() {
    const R = Math.min(view.w, view.h) / view.ppm * 0.35;
    for (let tries = 0; tries < 60; tries++) {
      const x = snapV((Math.random() * 2 - 1) * R), y = snapV((Math.random() * 2 - 1) * R * 0.8);
      if (state.charges.every(c => Math.hypot(c.x - x, c.y - y) > 1)) return [x, y];
    }
    return [0, 0];
  }

  function loadPreset(name) {
    state.charges = []; state.selected = null; state.particles = [];
    const q = 5;
    switch (name) {
      case 'single': addCharge(0, 0, q); break;
      case 'singleNeg': addCharge(0, 0, -q); break;
      case 'dipole': addCharge(-1.5, 0, q); addCharge(1.5, 0, -q); break;
      case 'like': addCharge(-1.5, 0, q); addCharge(1.5, 0, q); break;
      case 'unequal': addCharge(-1, 0, 2 * 4); addCharge(1.5, 0, -4); break;
      case 'quad': addCharge(-1.25, 1.25, q); addCharge(1.25, 1.25, -q); addCharge(1.25, -1.25, q); addCharge(-1.25, -1.25, -q); break;
      case 'triangle': {
        const R = 1.6;
        for (let k = 0; k < 3; k++) {
          const a = Math.PI / 2 + k * 2 * Math.PI / 3;
          addCharge(Math.round(R * Math.cos(a) * 100) / 100, Math.round(R * Math.sin(a) * 100) / 100, k === 0 ? -q : q);
        }
        break;
      }
      case 'capacitor': {
        const n = 21, half = 3, dq = 0.6;
        for (let i = 0; i < n; i++) {
          const x = -half + 2 * half * i / (n - 1);
          addCharge(x, 1.25, dq, { small: true });
          addCharge(x, -1.25, -dq, { small: true });
        }
        break;
      }
      case 'rod': {
        const n = 17;
        for (let i = 0; i < n; i++) addCharge(-2.4 + 4.8 * i / (n - 1), 0, 0.6, { small: true });
        break;
      }
      case 'rodPoint': {
        const n = 13;
        for (let i = 0; i < n; i++) addCharge(-3 + 3.6 * i / (n - 1), -1.5, 0.6, { small: true });
        addCharge(1.5, 1.75, -4);
        break;
      }
      case 'random': {
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const [x, y] = freeSpot();
          let qq = Math.round((Math.random() * 16 - 8) * 2) / 2;
          if (Math.abs(qq) < 1) qq = qq < 0 ? -2 : 2;
          addCharge(x, y, qq);
        }
        break;
      }
    }
    changed();
  }

  function changed() {
    dirtyStatic = true;
    updateChargePanel();
    updateProbePanel();
  }

  function updateChargePanel() {
    const net = state.charges.reduce((s, c) => s + c.q, 0);
    $('netQ').textContent = (net > 0 ? '+' : '') + fmtNum(net, 4).replace('−', '−') + ' nC';
    $('nCharges').textContent = state.charges.length;
    const s = state.selected;
    $('selBox').style.display = s ? '' : 'none';
    if (!s) return;
    selQ.set(s.q);
    if (document.activeElement !== $('selX')) $('selX').value = +s.x.toFixed(3);
    if (document.activeElement !== $('selY')) $('selY').value = +s.y.toFixed(3);
    const f = forceOn(s);
    const fm = Math.hypot(f[0], f[1]);
    $('selF').textContent = state.charges.length > 1 ? fmtSI(fm, 'N') : '0 N (alone)';
    $('selFdir').textContent = fm > 0 ? fmtNum(Math.atan2(f[1], f[0]) * 180 / Math.PI, 3) + '° from +x' : '—';
  }

  function updateProbePanel() {
    const A = state.probeA, B = state.probeB;
    const e = [0, 0];
    if (A.on) {
      const v = field(A.x, A.y, e);
      const m = Math.hypot(e[0], e[1]);
      $('pA_pos').textContent = `(${fmtNum(A.x, 3)}, ${fmtNum(A.y, 3)}) m`;
      $('pA_E').textContent = fmtSI(m, 'N/C');
      $('pA_Ex').textContent = fmtSI(e[0], 'N/C');
      $('pA_Ey').textContent = fmtSI(e[1], 'N/C');
      $('pA_dir').textContent = m > 0 ? fmtNum(Math.atan2(e[1], e[0]) * 180 / Math.PI, 3) + '°' : '—';
      $('pA_V').textContent = fmtSI(v, 'V');
      $('pA_V').className = 'big ' + (v > 0 ? 'hl-pos' : v < 0 ? 'hl-neg' : '');
    } else {
      ['pA_pos', 'pA_E', 'pA_Ex', 'pA_Ey', 'pA_dir', 'pA_V'].forEach(id => $(id).textContent = '—');
    }
    $('pBbox').style.display = B.on ? '' : 'none';
    if (B.on) {
      const vB = potential(B.x, B.y);
      $('pB_V').textContent = fmtSI(vB, 'V');
      if (A.on) {
        const dV = vB - potential(A.x, A.y);
        $('pB_dV').textContent = fmtSI(dV, 'V');
        $('pB_W').textContent = fmtSI(NC * dV, 'J');
        $('pB_Wf').textContent = fmtSI(-NC * dV, 'J');
      } else {
        $('pB_dV').textContent = 'enable probe A'; $('pB_W').textContent = '—'; $('pB_Wf').textContent = '—';
      }
    }
  }

  function updateParticlePanel() {
    const p = state.particles[state.particles.length - 1];
    if (!p) { ['t_v', 't_K', 't_U', 't_E', 't_drift'].forEach(id => $(id).textContent = '—'); return; }
    const en = energy(p);
    $('t_v').textContent = fmtNum(Math.hypot(p.vx, p.vy), 3) + ' m/s';
    $('t_K').textContent = fmtSI(en.K, 'J');
    $('t_U').textContent = fmtSI(en.U, 'J');
    $('t_E').textContent = fmtSI(en.E, 'J', 4);
    const scale = Math.max(Math.abs(p.E0), Math.abs(en.K), Math.abs(en.U), 1e-30);
    const drift = Math.abs(en.E - p.E0) / scale * 100;
    $('t_drift').textContent = drift < 0.01 ? '< 0.01 %' : fmtNum(drift, 2) + ' %';
  }

  // sliders
  const selQ = bindSlider('selQ', {
    format: v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmtNum(Math.abs(v), 3) + ' nC',
    onInput: v => {
      if (!state.selected) return;
      if (v === 0) { v = state.selected.q > 0 ? -0.5 : 0.5; selQ.set(v); }
      state.selected.q = v; changed();
    }
  });
  bindSlider('density', { format: v => v.toFixed(1), onInput: v => { state.density = v; dirtyStatic = true; } });
  const dVs = bindSlider('dV', { format: i => DV_STEPS[i] + ' V', onInput: i => { state.dV = DV_STEPS[i]; dirtyStatic = true; } });
  dVs.set(3); state.dV = DV_STEPS[3];
  bindSlider('mass', { format: v => fmtNum(v, 2) + ' µg', onInput: v => { state.massUg = v; } });
  bindSlider('tscale', { format: v => fmtNum(v, 2) + '×', onInput: v => { state.tscale = v; } });

  const toggles = { showLines: 'lines', showVectors: 'vectors', showEqui: 'equi', showHeat: 'heat', showForces: 'forces', showGrid: 'grid', showLabels: 'labels' };
  for (const [id, key] of Object.entries(toggles)) {
    $(id).addEventListener('change', e => { state.show[key] = e.target.checked; dirtyStatic = true; });
  }
  $('vecLen').addEventListener('change', e => { state.vecLen = e.target.checked; dirtyStatic = true; });
  $('snap').addEventListener('change', e => { state.snap = e.target.checked; });
  $('probeA').addEventListener('change', e => { state.probeA.on = e.target.checked; updateProbePanel(); });
  $('probeB').addEventListener('change', e => { state.probeB.on = e.target.checked; updateProbePanel(); });

  $('addPos').addEventListener('click', () => { const [x, y] = freeSpot(); state.selected = addCharge(x, y, 5); changed(); });
  $('addNeg').addEventListener('click', () => { const [x, y] = freeSpot(); state.selected = addCharge(x, y, -5); changed(); });
  $('clearAll').addEventListener('click', () => { state.charges = []; state.selected = null; state.particles = []; $('preset').value = ''; changed(); });
  $('preset').addEventListener('change', e => { if (e.target.value) loadPreset(e.target.value); });
  $('delSel').addEventListener('click', deleteSelected);
  function deleteSelected() {
    if (!state.selected) return;
    state.charges = state.charges.filter(c => c !== state.selected);
    state.selected = null; changed();
  }
  const onXY = () => {
    const s = state.selected; if (!s) return;
    const x = parseFloat($('selX').value), y = parseFloat($('selY').value);
    if (isFinite(x)) s.x = clamp(x, -50, 50);
    if (isFinite(y)) s.y = clamp(y, -50, 50);
    changed();
  };
  $('selX').addEventListener('input', onXY);
  $('selY').addEventListener('input', onXY);

  document.querySelectorAll('#testSign button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#testSign button').forEach(o => o.classList.toggle('active', o === b));
    state.testSign = parseInt(b.dataset.v, 10);
  }));
  $('launchBtn').addEventListener('click', () => {
    state.tool = state.tool === 'launch' ? 'select' : 'launch';
    syncTool();
    if (state.tool === 'launch') toast(toastEl, 'Press and drag on the field to launch a test charge');
  });
  function syncTool() {
    $('launchBtn').classList.toggle('on', state.tool === 'launch');
    $('launchBtn').textContent = state.tool === 'launch' ? 'Launching… (cancel)' : 'Launch…';
    cv.style.cursor = state.tool === 'launch' ? 'crosshair' : 'default';
  }
  $('pauseBtn').addEventListener('click', () => {
    state.paused = !state.paused;
    $('pauseBtn').textContent = state.paused ? 'Resume' : 'Pause';
  });
  $('clearParticles').addEventListener('click', () => { state.particles = []; updateParticlePanel(); });

  /* ---------------- Pointer interaction ---------------- */
  let drag = null; // {type:'charge'|'probeA'|'probeB', obj, ox, oy}
  function pointerPos(ev) {
    const r = cv.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }
  function hitTest(sx, sy) {
    const touch = 8;
    for (const key of ['probeB', 'probeA']) {
      const p = state[key];
      if (p.on && Math.hypot(toSX(p.x) - sx, toSY(p.y) - sy) < 14 + touch) return { type: key, obj: p };
    }
    let best = null, bd = Infinity;
    for (const c of state.charges) {
      const d = Math.hypot(toSX(c.x) - sx, toSY(c.y) - sy);
      if (d < chargeRadiusPx(c) + touch && d < bd) { bd = d; best = c; }
    }
    return best ? { type: 'charge', obj: best } : null;
  }

  cv.addEventListener('pointerdown', ev => {
    const [sx, sy] = pointerPos(ev);
    const x = toWX(sx), y = toWY(sy);
    cv.setPointerCapture(ev.pointerId);
    if (state.tool === 'launch') {
      const nc = nearestCharge(x, y);
      if (nc.c && nc.d < chargeRadiusW(nc.c) * 1.2) { toast(toastEl, 'Too close to a charge — pick another spot'); return; }
      launch.active = true; launch.x = launch.ex = x; launch.y = launch.ey = y;
      return;
    }
    const hit = hitTest(sx, sy);
    if (hit) {
      drag = { type: hit.type, obj: hit.obj, ox: hit.obj.x - x, oy: hit.obj.y - y };
      if (hit.type === 'charge') { state.selected = hit.obj; updateChargePanel(); }
      cv.style.cursor = 'grabbing';
    } else {
      state.selected = null; updateChargePanel();
    }
  });
  cv.addEventListener('pointermove', ev => {
    const [sx, sy] = pointerPos(ev);
    const x = toWX(sx), y = toWY(sy);
    if (launch.active) { launch.ex = x; launch.ey = y; }
    else if (drag) {
      const lim = 40;
      let nx = clamp(x + drag.ox, -lim, lim), ny = clamp(y + drag.oy, -lim, lim);
      if (drag.type === 'charge') {
        nx = snapV(nx); ny = snapV(ny);
        if (nx !== drag.obj.x || ny !== drag.obj.y) { drag.obj.x = nx; drag.obj.y = ny; changed(); }
      } else {
        drag.obj.x = state.snap ? Math.round(nx * 20) / 20 : nx;
        drag.obj.y = state.snap ? Math.round(ny * 20) / 20 : ny;
        updateProbePanel();
      }
    } else if (state.tool !== 'launch') {
      cv.style.cursor = hitTest(sx, sy) ? 'grab' : 'default';
    }
    // HUD
    const e = [0, 0];
    const v = field(x, y, e);
    const nc = nearestCharge(x, y);
    if (nc.c && nc.d < chargeRadiusW(nc.c)) {
      hud.innerHTML = `<span class="k">charge</span> ${nc.c.q > 0 ? '+' : '−'}${fmtNum(Math.abs(nc.c.q), 3)} nC at (${fmtNum(nc.c.x, 3)}, ${fmtNum(nc.c.y, 3)}) m`;
    } else {
      hud.innerHTML = `<span class="k">x</span> ${x.toFixed(2)} m <span class="k">y</span> ${y.toFixed(2)} m &nbsp; <span class="k">|E|</span> ${fmtSI(Math.hypot(e[0], e[1]), 'N/C')} &nbsp; <span class="k">V</span> ${fmtSI(v, 'V')}`;
    }
  });
  const endPointer = () => {
    if (launch.active) {
      launch.active = false;
      const v = launchVelocity();
      spawnParticle(launch.x, launch.y, v[0], v[1]);
      state.paused = false; $('pauseBtn').textContent = 'Pause';
      state.tool = 'select'; syncTool();
    }
    if (drag) { drag = null; cv.style.cursor = 'default'; }
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', () => { launch.active = false; drag = null; });
  cv.addEventListener('pointerleave', () => { if (!drag && !launch.active) hud.textContent = 'Move the cursor over the field'; });

  window.addEventListener('keydown', ev => {
    const tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (ev.key === 'Escape' && state.tool === 'launch') { state.tool = 'select'; syncTool(); return; }
    const s = state.selected;
    if (!s) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); deleteSelected(); return; }
    const d = ev.shiftKey ? 1 : 0.25;
    const moves = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
    if (moves[ev.key]) {
      ev.preventDefault();
      s.x = Math.round((s.x + moves[ev.key][0]) * 1000) / 1000;
      s.y = Math.round((s.y + moves[ev.key][1]) * 1000) / 1000;
      changed();
    }
  });

  /* ---------------- Main loop ---------------- */
  let last = performance.now();
  let panelTick = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.paused && state.particles.some(p => p.alive)) stepParticles(dt * state.tscale);
    render();
    if ((panelTick++ & 3) === 0) updateParticlePanel();
    requestAnimationFrame(frame);
  }

  new ResizeObserver(() => resize()).observe(stage);
  resize();
  loadPreset('dipole');
  requestAnimationFrame(frame);

  // expose for debugging/tests
  window.__fieldLab = { state, field, potential, computeFieldLines, loadPreset };
})();
