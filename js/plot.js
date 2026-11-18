/* Small, dependency-free 2D plotting helper → EL.drawPlot */
(function () {
  'use strict';
  const { fitCanvas, fmtNum } = window.EL;
  const PREF = [
    { e: 9, s: 'G' }, { e: 6, s: 'M' }, { e: 3, s: 'k' }, { e: 0, s: '' }, { e: -3, s: 'm' }, { e: -6, s: 'µ' }, { e: -9, s: 'n' }, { e: -12, s: 'p' }
  ];
  function pickPrefix(maxAbs) {
    if (!(maxAbs > 0) || !isFinite(maxAbs)) return { e: 0, s: '' };
    for (const p of PREF) if (maxAbs >= Math.pow(10, p.e) * 0.999) return p;
    return PREF[PREF.length - 1];
  }
  function niceStep(range, target) {
    const raw = range / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }

  /**
   * opts: {
   *   xRange:[a,b], yRange?:[a,b], curves:[{xs, ys, color, width, dash, label}],
   *   xLabel, xUnit, yLabel, yUnit, marker:{x, y, color}, vlines:[{x,label}], shades:[{x0,x1,label}],
   *   clipX?: number (ignore |y| for x < clipX when auto-ranging)
   * }
   */
  function drawPlot(canvas, opts) {
    const ctx = canvas.getContext('2d');
    const { w, h } = fitCanvas(canvas, ctx);
    ctx.clearRect(0, 0, w, h);
    const mono = getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace';
    const M = { l: 54, r: 14, t: 14, b: 34 };
    const pw = w - M.l - M.r, ph = h - M.t - M.b;
    if (pw < 20 || ph < 20) return;
    const [x0, x1] = opts.xRange;

    // y range
    let ymin, ymax;
    if (opts.yRange) { [ymin, ymax] = opts.yRange; }
    else {
      ymin = 0; ymax = 0;
      for (const c of opts.curves) {
        for (let i = 0; i < c.xs.length; i++) {
          const y = c.ys[i];
          if (!isFinite(y)) continue;
          if (opts.clipX !== undefined && c.xs[i] < opts.clipX) continue;
          if (y < ymin) ymin = y; if (y > ymax) ymax = y;
        }
      }
      if (ymax - ymin === 0) { ymax = 1; ymin = -1; if (opts.zeroIsFlat) { ymin = -1; ymax = 1; } }
      const pad = (ymax - ymin) * 0.12;
      if (ymax > 0) ymax += pad; if (ymin < 0) ymin -= pad;
      if (ymin === 0 && ymax > 0) ymin = -pad * 0.35;
      if (ymax === 0 && ymin < 0) ymax = pad * 0.35;
    }
    const X = x => M.l + (x - x0) / (x1 - x0) * pw;
    const Y = y => M.t + (ymax - y) / (ymax - ymin) * ph;

    // shades (e.g. conductor regions)
    for (const s of (opts.shades || [])) {
      const a = Math.max(X(s.x0), M.l), b = Math.min(X(s.x1), M.l + pw);
      if (b <= a) continue;
      ctx.fillStyle = 'rgba(150, 160, 190, 0.10)';
      ctx.fillRect(a, M.t, b - a, ph);
      if (s.label && b - a > 30) {
        ctx.fillStyle = 'rgba(170, 180, 210, 0.7)';
        ctx.font = '10px ' + mono; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(s.label, (a + b) / 2, M.t + ph - 3);
      }
    }

    // grid + ticks
    const yPre = pickPrefix(Math.max(Math.abs(ymin), Math.abs(ymax)));
    const ys = niceStep(ymax - ymin, 5);
    const xs = niceStep(x1 - x0, Math.max(3, Math.floor(pw / 70)));
    ctx.lineWidth = 1;
    ctx.font = '10.5px ' + mono;
    ctx.strokeStyle = 'rgba(51, 64, 106, 0.45)';
    ctx.fillStyle = 'rgba(154, 166, 196, 0.85)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.ceil(ymin / ys) * ys; v <= ymax + 1e-12 * Math.abs(ymax); v += ys) {
      const py = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(M.l, py); ctx.lineTo(M.l + pw, py); ctx.stroke();
      const val = Math.abs(v) < ys * 1e-6 ? 0 : v / Math.pow(10, yPre.e);
      ctx.fillText(fmtNum(val, 3), M.l - 6, py);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) {
      const px = Math.round(X(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(px, M.t); ctx.lineTo(px, M.t + ph); ctx.stroke();
      ctx.fillText(fmtNum(Math.abs(v) < xs * 1e-6 ? 0 : v, 3), px, M.t + ph + 5);
    }
    // zero axes
    ctx.strokeStyle = 'rgba(160, 175, 215, 0.7)';
    if (ymin < 0 && ymax > 0) { ctx.beginPath(); ctx.moveTo(M.l, Math.round(Y(0)) + 0.5); ctx.lineTo(M.l + pw, Math.round(Y(0)) + 0.5); ctx.stroke(); }
    if (x0 < 0 && x1 > 0) { ctx.beginPath(); ctx.moveTo(Math.round(X(0)) + 0.5, M.t); ctx.lineTo(Math.round(X(0)) + 0.5, M.t + ph); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(120, 135, 180, 0.8)';
    ctx.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);

    // axis labels
    ctx.fillStyle = 'rgba(200, 210, 235, 0.9)';
    ctx.font = '600 11px ' + mono;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${opts.xLabel || 'x'}${opts.xUnit ? ' (' + opts.xUnit + ')' : ''}`, M.l + pw, h - 1);
    ctx.save();
    ctx.translate(12, M.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${opts.yLabel || 'y'} (${yPre.s}${opts.yUnit || ''})`, 0, 0);
    ctx.restore();

    // vertical reference lines
    for (const vl of (opts.vlines || [])) {
      if (vl.x < x0 || vl.x > x1) continue;
      const px = Math.round(X(vl.x)) + 0.5;
      ctx.strokeStyle = 'rgba(180, 190, 220, 0.45)'; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(px, M.t); ctx.lineTo(px, M.t + ph); ctx.stroke(); ctx.setLineDash([]);
      if (vl.label) {
        ctx.fillStyle = 'rgba(200, 210, 235, 0.85)'; ctx.font = '600 11px ' + mono;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(vl.label, px, M.t + 3);
      }
    }

    // curves (clipped to plot area)
    ctx.save();
    ctx.beginPath(); ctx.rect(M.l, M.t, pw, ph); ctx.clip();
    for (const c of opts.curves) {
      ctx.strokeStyle = c.color || '#ffd166';
      ctx.lineWidth = c.width || 2.2;
      ctx.setLineDash(c.dash || []);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let pen = false;
      const big = (ymax - ymin) * 50;
      for (let i = 0; i < c.xs.length; i++) {
        const y = c.ys[i];
        if (!isFinite(y)) { pen = false; continue; }
        const py = Y(Math.max(ymin - big, Math.min(ymax + big, y)));
        const px = X(c.xs[i]);
        if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // marker
    const mk = opts.marker;
    if (mk && mk.x >= x0 && mk.x <= x1) {
      const px = X(mk.x);
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.6)'; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(px, M.t); ctx.lineTo(px, M.t + ph); ctx.stroke(); ctx.setLineDash([]);
      if (isFinite(mk.y)) {
        const py = Y(Math.max(ymin, Math.min(ymax, mk.y)));
        ctx.fillStyle = mk.color || '#ffd166';
        ctx.strokeStyle = '#0b1020'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (mk.text) {
          ctx.font = '600 11px ' + mono;
          const tw = ctx.measureText(mk.text).width;
          let tx = px + 10, ty = py - 16;
          if (tx + tw + 8 > M.l + pw) tx = px - tw - 18;
          if (ty < M.t + 2) ty = py + 8;
          ctx.fillStyle = 'rgba(10, 15, 30, 0.85)';
          ctx.fillRect(tx - 4, ty - 1, tw + 8, 16);
          ctx.fillStyle = mk.color || '#ffd166'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(mk.text, tx, ty + 1);
        }
      }
    }
    return { X, Y, ymin, ymax };
  }

  window.EL.drawPlot = drawPlot;
})();
