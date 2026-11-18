/* Continuous charge distributions: rod, ring, disk, arc — Riemann sum of dE vs exact integral */
(function () {
  'use strict';
  const { K, EPS0, fmtSI, fmtNum, tex, bindSlider, fitCanvas, arrow, clamp, drawPlot } = window.EL;
  EL.buildNav('dist');

  const nC = 1e-9, PI = Math.PI;
  const $ = id => document.getElementById(id);

  const MODES = {
    rod: {
      desc: 'A straight rod of length L with uniform linear charge density λ. P can be anywhere in the plane.',
      params: {
        lam: { label: 'Linear density λ', min: -10, max: 10, step: 0.5, value: 2, unit: 'nC/m' },
        L: { label: 'Length L', min: 0.5, max: 4, step: 0.1, value: 2, unit: 'm' }
      },
      P0: [0, 1, 0], view3d: false
    },
    ring: {
      desc: 'A thin ring of radius R carrying total charge Q. P lies on the ring\'s axis (the x-axis).',
      params: {
        Q: { label: 'Total charge Q', min: -20, max: 20, step: 0.5, value: 10, unit: 'nC' },
        R: { label: 'Radius R', min: 0.3, max: 2, step: 0.05, value: 1, unit: 'm' }
      },
      P0: [1.2, 0, 0], view3d: true
    },
    disk: {
      desc: 'A uniformly charged disk of radius R (surface density σ), built from concentric rings of width dr. P is on the axis.',
      params: {
        sig: { label: 'Surface density σ', min: -10, max: 10, step: 0.5, value: 3, unit: 'nC/m²' },
        R: { label: 'Radius R', min: 0.3, max: 2.5, step: 0.05, value: 1.5, unit: 'm' }
      },
      P0: [1, 0, 0], view3d: true
    },
    arc: {
      desc: 'A circular arc of radius R and half-angle θ₀ with uniform λ, centred on the origin (θ₀ = 90° is a semicircle).',
      params: {
        lam: { label: 'Linear density λ', min: -10, max: 10, step: 0.5, value: 3, unit: 'nC/m' },
        R: { label: 'Radius R', min: 0.5, max: 2.5, step: 0.05, value: 1.5, unit: 'm' },
        th: { label: 'Half-angle θ₀', min: 10, max: 180, step: 1, value: 90, unit: '°' }
      },
      P0: [0, 0, 0], view3d: false
    }
  };

  const state = { mode: 'rod', p: {}, P: [0, 1, 0], N: 12, showDE: true, chain: false, comp: true, pair: true };

  /* ---------------- pieces & fields ---------------- */
  function pieces(N) {
    const p = state.p, out = [];
    switch (state.mode) {
      case 'rod': {
        const dq = p.lam * nC * p.L / N;
        for (let i = 0; i < N; i++) out.push({ x: -p.L / 2 + (i + 0.5) * p.L / N, y: 0, z: 0, dq, t: (i + 0.5) / N });
        break;
      }
      case 'ring': {
        const dq = p.Q * nC / N;
        for (let i = 0; i < N; i++) { const f = 2 * PI * i / N + PI / 2; out.push({ x: 0, y: p.R * Math.cos(f), z: p.R * Math.sin(f), dq, t: i / N, phi: f }); }
        break;
      }
      case 'disk': {
        const dr = p.R / N;
        for (let i = 0; i < N; i++) { const r = (i + 0.5) * dr; out.push({ x: 0, y: 0, z: 0, ring: r, dr, dq: p.sig * nC * 2 * PI * r * dr, t: (i + 0.5) / N }); }
        break;
      }
      case 'arc': {
        const th0 = p.th * PI / 180, dth = 2 * th0 / N;
        for (let i = 0; i < N; i++) { const f = -PI / 2 - th0 + (i + 0.5) * dth; out.push({ x: p.R * Math.cos(f), y: p.R * Math.sin(f), z: 0, dq: p.lam * nC * p.R * dth, t: (i + 0.5) / N }); }
        break;
      }
    }
    return out;
  }
  // dE of one piece at P (3-vector) and its potential
  function dEof(pc, P) {
    if (pc.ring !== undefined) {
      const x = P[0], d2 = x * x + pc.ring * pc.ring, d = Math.sqrt(d2);
      return { e: [K * pc.dq * x / (d2 * d), 0, 0], v: K * pc.dq / d };
    }
    const rx = P[0] - pc.x, ry = P[1] - pc.y, rz = P[2] - pc.z;
    const r2 = rx * rx + ry * ry + rz * rz;
    if (r2 < 1e-12) return { e: [NaN, NaN, NaN], v: NaN };
    const r = Math.sqrt(r2), f = K * pc.dq / (r2 * r);
    return { e: [f * rx, f * ry, f * rz], v: K * pc.dq / r };
  }
  function sumField(list, P) {
    let ex = 0, ey = 0, ez = 0, v = 0, tot = 0;
    const des = list.map(pc => { const d = dEof(pc, P); ex += d.e[0]; ey += d.e[1]; ez += d.e[2]; v += d.v; tot += Math.hypot(d.e[0], d.e[1], d.e[2]); return d.e; });
    const tiny = c => (Math.abs(c) < tot * 1e-12 ? 0 : c); // remove round-off left by exact cancellation
    return { E: [tiny(ex), tiny(ey), tiny(ez)], V: v, des };
  }
  // exact (analytic where available)
  function exact(P) {
    const p = state.p;
    switch (state.mode) {
      case 'rod': {
        const lam = p.lam * nC, x1 = -p.L / 2, x2 = p.L / 2, [x0, y0] = P;
        const r1 = Math.hypot(x0 - x1, y0), r2 = Math.hypot(x0 - x2, y0);
        if (Math.abs(y0) < 1e-9 && x0 >= x1 && x0 <= x2) return { E: [NaN, NaN, 0], V: Infinity, onCharge: true };
        const Ex = K * lam * (1 / r2 - 1 / r1);
        const Ey = Math.abs(y0) < 1e-9 ? 0 : (K * lam / y0) * ((x2 - x0) / r2 - (x1 - x0) / r1);
        // potential, evaluated on the side that is numerically stable
        let V;
        if (x0 <= 0) V = K * lam * Math.log((x2 - x0 + r2) / (x1 - x0 + r1));
        else V = K * lam * Math.log((-x1 + x0 + r1) / (-x2 + x0 + r2));
        return { E: [Ex, Ey, 0], V };
      }
      case 'ring': {
        const Q = p.Q * nC, x = P[0], d2 = x * x + p.R * p.R, d = Math.sqrt(d2);
        return { E: [K * Q * x / (d2 * d), 0, 0], V: K * Q / d };
      }
      case 'disk': {
        const s = p.sig * nC, x = P[0], d = Math.hypot(x, p.R);
        if (x === 0) return { E: [NaN, 0, 0], V: s / (2 * EPS0) * p.R, onCharge: true };
        return { E: [Math.sign(x) * s / (2 * EPS0) * (1 - Math.abs(x) / d), 0, 0], V: s / (2 * EPS0) * (d - Math.abs(x)) };
      }
      case 'arc': {
        const lam = p.lam * nC, th0 = p.th * PI / 180;
        if (Math.hypot(P[0], P[1]) < 1e-9) return { E: [0, 2 * K * lam / p.R * Math.sin(th0), 0], V: K * lam * 2 * th0, analytic: true };
        const s = sumField(pieces(6000), P);
        return { E: s.E, V: s.V, analytic: false };
      }
    }
  }

  /* ---------------- canvas / projection ---------------- */
  const stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d');
  const view = { w: 800, h: 600, ppm: 120, cx: 400, cy: 300 };
  const YAW = 0.62, PITCH = 0.32;
  function resize() {
    const { w, h } = fitCanvas(cv, ctx);
    view.w = w; view.h = h;
    const m = MODES[state.mode];
    const span = state.mode === 'rod' ? 6 : state.mode === 'arc' ? 6.2 : 7;
    view.ppm = clamp(Math.min(w / span, h / (span * 0.72)), 40, 180);
    view.cx = m.view3d ? w * 0.42 : w / 2;
    view.cy = state.mode === 'rod' ? h * 0.62 : h / 2;
    draw();
  }
  function proj(x, y, z) {
    if (!MODES[state.mode].view3d) return [view.cx + x * view.ppm, view.cy - y * view.ppm];
    const x1 = x * Math.cos(YAW) + z * Math.sin(YAW);
    const z1 = -x * Math.sin(YAW) + z * Math.cos(YAW);
    const y2 = y * Math.cos(PITCH) - z1 * Math.sin(PITCH);
    return [view.cx + x1 * view.ppm, view.cy - y2 * view.ppm];
  }
  // vector (not point) projection
  // vector (not point) projection, in the same pixel units as the input (no metre scaling)
  function projV(vx, vy, vz) { const o = proj(0, 0, 0), q = proj(vx, vy, vz); return [(q[0] - o[0]) / view.ppm, (q[1] - o[1]) / view.ppm]; }

  const pieceColor = (t, a = 1) => {
    const h = 190 + 130 * t; // cyan → magenta
    return `hsla(${h}, 90%, 66%, ${a})`;
  };
  const mono = () => getComputedStyle(document.body).getPropertyValue('--mono');

  function drawGrid() {
    const { w, h, ppm } = view;
    if (MODES[state.mode].view3d) {
      // 3D axes
      const ax = (vx, vy, vz, lab, col) => {
        const a = proj(-vx * 3.2, -vy * 3.2, -vz * 3.2), b = proj(vx * 3.4, vy * 3.4, vz * 3.4);
        ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = col; ctx.font = '600 12px ' + mono(); ctx.fillText(lab, b[0] + 6, b[1]);
      };
      ax(1, 0, 0, 'x (axis)', 'rgba(255,209,102,0.55)');
      ax(0, 1, 0, 'y', 'rgba(140,155,200,0.45)');
      ax(0, 0, 1, 'z', 'rgba(140,155,200,0.45)');
      // tick marks along x-axis
      ctx.fillStyle = 'rgba(154,166,196,0.7)'; ctx.font = '10.5px ' + mono(); ctx.textAlign = 'center';
      for (let x = -3; x <= 3; x++) {
        if (x === 0) continue;
        const p = proj(x, 0, 0);
        ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, 2 * PI); ctx.fill();
        ctx.fillText(x + ' m', p[0], p[1] + 16);
      }
      ctx.textAlign = 'left';
      return;
    }
    const step = 0.5;
    const x0 = Math.floor((0 - view.cx) / ppm / step) * step, x1 = (w - view.cx) / ppm;
    const y0 = Math.floor((view.cy - h) / ppm / step) * step, y1 = view.cy / ppm;
    ctx.lineWidth = 1;
    for (let x = x0; x <= x1; x += step) {
      const sx = Math.round(view.cx + x * ppm) + 0.5;
      ctx.strokeStyle = Math.abs(x) < 1e-9 ? 'rgba(120,140,200,0.55)' : Math.abs(x % 1) < 1e-9 ? 'rgba(51,64,106,0.5)' : 'rgba(51,64,106,0.25)';
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
    }
    for (let y = y0; y <= y1; y += step) {
      const sy = Math.round(view.cy - y * ppm) + 0.5;
      ctx.strokeStyle = Math.abs(y) < 1e-9 ? 'rgba(120,140,200,0.55)' : Math.abs(y % 1) < 1e-9 ? 'rgba(51,64,106,0.5)' : 'rgba(51,64,106,0.25)';
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(154,166,196,0.6)'; ctx.font = '10.5px ' + mono();
    for (let x = Math.ceil(x0); x <= x1; x++) if (x) ctx.fillText(x + ' m', view.cx + x * ppm + 3, view.cy + 13);
    for (let y = Math.ceil(y0); y <= y1; y++) if (y) ctx.fillText(y + ' m', view.cx + 4, view.cy - y * ppm - 3);
  }

  function drawObject(list) {
    const p = state.p;
    const sign = (state.mode === 'ring' ? p.Q : state.mode === 'disk' ? p.sig : p.lam);
    const base = sign >= 0 ? [255, 93, 93] : [77, 163, 255];
    const col = a => `rgba(${base[0]},${base[1]},${base[2]},${a})`;
    ctx.lineCap = 'round';
    switch (state.mode) {
      case 'rod': {
        const a = proj(-p.L / 2, 0, 0), b = proj(p.L / 2, 0, 0);
        ctx.strokeStyle = col(0.25); ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        ctx.strokeStyle = col(0.9); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        if (list.length <= 80) {
          ctx.strokeStyle = 'rgba(10,15,30,0.9)'; ctx.lineWidth = 1.5;
          for (let i = 1; i < list.length; i++) { const x = -p.L / 2 + i * p.L / list.length; const s = proj(x, 0, 0); ctx.beginPath(); ctx.moveTo(s[0], s[1] - 5); ctx.lineTo(s[0], s[1] + 5); ctx.stroke(); }
        }
        break;
      }
      case 'arc': {
        const th0 = p.th * PI / 180;
        ctx.strokeStyle = col(0.25); ctx.lineWidth = 16;
        const c = proj(0, 0, 0);
        ctx.beginPath(); ctx.arc(c[0], c[1], p.R * view.ppm, PI / 2 - th0, PI / 2 + th0); ctx.stroke();
        ctx.strokeStyle = col(0.9); ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(c[0], c[1], p.R * view.ppm, PI / 2 - th0, PI / 2 + th0); ctx.stroke();
        // radius & angle markings
        ctx.strokeStyle = 'rgba(180,190,220,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        for (const s of [-1, 1]) { const f = -PI / 2 + s * th0; const q = proj(p.R * Math.cos(f), p.R * Math.sin(f), 0); ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
        const q0 = proj(0, -p.R, 0); ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(q0[0], q0[1]); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(200,210,235,0.8)'; ctx.font = '600 12px ' + mono();
        ctx.fillText('θ₀ = ' + p.th + '°', c[0] + 8, c[1] + 34);
        ctx.fillText('R', (c[0] + q0[0]) / 2 + 6, (c[1] + q0[1]) / 2 + 20);
        break;
      }
      case 'ring': {
        ctx.strokeStyle = col(0.25); ctx.lineWidth = 12; strokeCircle3D(p.R);
        ctx.strokeStyle = col(0.9); ctx.lineWidth = 4; strokeCircle3D(p.R);
        break;
      }
      case 'disk': {
        ctx.fillStyle = col(0.16); ctx.beginPath(); pathCircle3D(p.R); ctx.fill();
        ctx.strokeStyle = col(0.85); ctx.lineWidth = 2.5; strokeCircle3D(p.R);
        const n = list.length, stepN = Math.max(1, Math.ceil(n / 24));
        ctx.lineWidth = 1;
        for (let i = 0; i < n; i += stepN) { ctx.strokeStyle = pieceColor(list[i].t, 0.35); strokeCircle3D(list[i].ring); }
        break;
      }
    }
    // dq dots
    if (state.mode !== 'disk') {
      for (const pc of list) {
        const s = proj(pc.x, pc.y, pc.z);
        ctx.fillStyle = pieceColor(pc.t, 0.95);
        ctx.beginPath(); ctx.arc(s[0], s[1], list.length > 60 ? 2.2 : 3.4, 0, 2 * PI); ctx.fill();
      }
    }
  }
  function pathCircle3D(R) {
    for (let i = 0; i <= 96; i++) { const f = 2 * PI * i / 96; const s = proj(0, R * Math.cos(f), R * Math.sin(f)); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }
  }
  function strokeCircle3D(R) { ctx.beginPath(); pathCircle3D(R); ctx.stroke(); }

  let cache = null;
  let hudMag = 1;
  function compute() {
    const list = pieces(state.N);
    const sum = sumField(list, state.P);
    const ex = exact(state.P);
    cache = { list, sum, ex };
    return cache;
  }

  function draw() {
    if (!cache) return;
    const { w, h } = view;
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, '#0b1124'); g.addColorStop(1, '#060914');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    drawGrid();
    const { list, sum } = cache;
    drawObject(list);
    const P = state.P, sp = proj(P[0], P[1], P[2]);
    const Emag = Math.hypot(...sum.E);
    const valid = isFinite(Emag);

    if (valid) {
      // scale: px per (N/C)
      let maxd = 0; for (const d of sum.des) maxd = Math.max(maxd, Math.hypot(...d));
      // net E is drawn ~140 px long; the individual dE use their own (larger) scale so they stay visible
      const S = Emag > 0 ? 140 / Emag : (maxd > 0 ? 90 / maxd : 0);
      const Sd = maxd > 0 ? 90 / maxd : 0;
      hudMag = Emag > 0 && Sd > 0 ? Sd / S : 1;
      const n = list.length, stride = n > 60 ? Math.ceil(n / 60) : 1;
      // individual dE vectors
      if (state.showDE && S > 0) {
        for (let i = 0; i < n; i += stride) {
          const d = sum.des[i]; const v = projV(d[0] * Sd, d[1] * Sd, d[2] * Sd);
          ctx.strokeStyle = ctx.fillStyle = pieceColor(list[i].t, 0.6);
          arrow(ctx, sp[0], sp[1], sp[0] + v[0], sp[1] + v[1], 6, 1.3);
        }
      }
      // highlighted symmetric pair
      if (state.pair && n >= 2 && Sd > 0) {
        let pair = [];
        if (state.mode === 'ring') { const i = Math.floor(n / 8); pair = n % 2 === 0 ? [i, i + n / 2] : [i]; }
        else if (state.mode === 'disk') pair = [Math.floor(n * 0.7)];
        else { const i = Math.floor(n / 5); pair = [i, n - 1 - i]; if (pair[0] === pair[1]) pair = [i]; }
        for (const i of pair) {
          const pc = list[i], d = sum.des[i];
          if (state.mode === 'disk') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; strokeCircle3D(pc.ring); }
          else {
            const s = proj(pc.x, pc.y, pc.z);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
            ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(sp[0], sp[1]); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s[0], s[1], 5.5, 0, 2 * PI); ctx.fill();
            ctx.font = '600 11px ' + mono(); ctx.fillText('dq', s[0] + 8, s[1] - 8);
          }
          const v = projV(d[0] * Sd, d[1] * Sd, d[2] * Sd);
          ctx.strokeStyle = ctx.fillStyle = '#ffffff';
          arrow(ctx, sp[0], sp[1], sp[0] + v[0], sp[1] + v[1], 9, 2.4);
          if (state.comp) {
            // components of this dE: along x (axis) and the perpendicular part
            const vx = projV(d[0] * Sd, 0, 0), vp = projV(0, d[1] * Sd, d[2] * Sd);
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = ctx.fillStyle = 'rgba(255,255,255,0.6)';
            if (Math.hypot(...vx) > 3) arrow(ctx, sp[0], sp[1], sp[0] + vx[0], sp[1] + vx[1], 6, 1.4);
            if (Math.hypot(...vp) > 3) arrow(ctx, sp[0] + vx[0], sp[1] + vx[1], sp[0] + vx[0] + vp[0], sp[1] + vx[1] + vp[1], 6, 1.4);
            ctx.setLineDash([]);
          }
        }
      }
      // tip-to-tail chain
      if (state.chain && S > 0) {
        let cx = sp[0], cy = sp[1];
        for (let i = 0; i < n; i++) {
          const d = sum.des[i]; const v = projV(d[0] * S, d[1] * S, d[2] * S);
          ctx.strokeStyle = ctx.fillStyle = pieceColor(list[i].t, 0.95);
          if (n <= 40) arrow(ctx, cx, cy, cx + v[0], cy + v[1], 5, 1.6);
          else { ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + v[0], cy + v[1]); ctx.stroke(); }
          cx += v[0]; cy += v[1];
        }
      }
      // net field
      if (Emag > 0 && S > 0) {
        const v = projV(sum.E[0] * S, sum.E[1] * S, sum.E[2] * S);
        if (state.comp && !MODES[state.mode].view3d) {
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = ctx.fillStyle = 'rgba(255,209,102,0.6)';
          if (Math.abs(v[0]) > 3) arrow(ctx, sp[0], sp[1], sp[0] + v[0], sp[1], 7, 1.6);
          if (Math.abs(v[1]) > 3) arrow(ctx, sp[0] + v[0], sp[1], sp[0] + v[0], sp[1] + v[1], 7, 1.6);
          ctx.setLineDash([]);
        }
        ctx.strokeStyle = ctx.fillStyle = '#ffd166';
        ctx.shadowColor = 'rgba(255,209,102,0.6)'; ctx.shadowBlur = 10;
        arrow(ctx, sp[0], sp[1], sp[0] + v[0], sp[1] + v[1], 13, 3.4);
        ctx.shadowBlur = 0;
        ctx.font = '700 12.5px ' + mono();
        ctx.fillText('E (net)', sp[0] + v[0] + 8, sp[1] + v[1] - 8);
      }
    }
    // point P
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(255,209,102,0.2)';
    ctx.beginPath(); ctx.arc(sp[0], sp[1], 8, 0, 2 * PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd166'; ctx.font = '700 13px ' + getComputedStyle(document.body).getPropertyValue('--sans');
    ctx.fillText('P', sp[0] - 18, sp[1] - 10);
  }

  /* ---------------- formulas, readouts, graph ---------------- */
  function updatePanels() {
    const { sum, ex, list } = cache;
    const p = state.p, P = state.P;
    const Enum = Math.hypot(...sum.E), Eex = Math.hypot(...ex.E);
    $('o_P').textContent = MODES[state.mode].view3d ? `x = ${fmtNum(P[0], 3)} m (on axis)` : `(${fmtNum(P[0], 3)}, ${fmtNum(P[1], 3)}) m`;
    if (ex.onCharge || !isFinite(Enum)) {
      $('o_Enum').textContent = '— (P is on the charge)'; $('o_Eex').textContent = '—'; $('o_err').textContent = '—'; $('o_comp').textContent = '—';
    } else {
      $('o_Enum').textContent = fmtSI(Enum, 'N/C', 4);
      $('o_Eex').textContent = fmtSI(Eex, 'N/C', 4);
      const err = Eex > 0 ? Math.abs(Enum - Eex) / Eex * 100 : (Enum === 0 ? 0 : 100);
      $('o_err').textContent = (Eex === 0 && Enum < 1e-9) ? 'both zero (symmetry)' : err < 1e-3 ? '< 0.001 % off' : fmtNum(err, 3) + ' % off';
      $('o_err').className = err < 1 ? 'hl-ok' : err < 5 ? '' : 'hl-warn';
      const cx = Math.abs(ex.E[0]) < 1e-9 * Eex ? 0 : ex.E[0], cy = Math.abs(ex.E[1]) < 1e-9 * Eex ? 0 : ex.E[1];
      $('o_comp').textContent = `${fmtSI(cx, '', 3)}, ${fmtSI(cy, '', 3)} N/C`;
    }
    $('o_V').textContent = isFinite(ex.V) ? fmtSI(ex.V, 'V') : '∞';
    const dqTxt = state.mode === 'disk' ? 'rings of width dr = ' + fmtNum(p.R / state.N, 3) + ' m' : 'dq = ' + fmtSI(list[0].dq, 'C');
    $('hud').textContent = `N = ${state.N} pieces · ${dqTxt}` + (state.showDE && hudMag > 1.05 ? ` · dE arrows ×${fmtNum(hudMag, 2)} vs E` : '');

    // formulas
    const onBis = Math.abs(P[0]) < 1e-6, onAxis = Math.abs(P[1]) < 1e-6 && Math.abs(P[0]) > p.L / 2;
    switch (state.mode) {
      case 'rod':
        tex($('f1'), 'dE = k\\dfrac{dq}{r^2} = k\\dfrac{\\lambda\\,dx}{(x_P-x)^2+y_P^2}', true);
        $('f2cap').textContent = '2 · Components, then integrate along the rod';
        tex($('f2'), '\\begin{gathered}E_x = k\\lambda\\!\\int_{-L/2}^{L/2}\\!\\frac{(x_P-x)\\,dx}{[(x_P-x)^2+y_P^2]^{3/2}}\\\\ E_y = k\\lambda\\!\\int_{-L/2}^{L/2}\\!\\frac{y_P\\,dx}{[(x_P-x)^2+y_P^2]^{3/2}}\\end{gathered}', true);
        if (onBis && Math.abs(P[1]) > 1e-6) tex($('f3'), '\\begin{gathered}\\text{On the bisector: } E_x = 0\\\\ E_y = \\frac{2k\\lambda}{y}\\,\\frac{L/2}{\\sqrt{y^2+(L/2)^2}}\\end{gathered}', true);
        else if (onAxis) tex($('f3'), '\\text{On the axis, distance } d \\text{ past an end: } E = \\frac{kQ}{d\\,(d+L)}', true);
        else tex($('f3'), '\\begin{gathered}E_x = k\\lambda\\left(\\frac{1}{r_2}-\\frac{1}{r_1}\\right)\\\\ E_y = \\frac{k\\lambda}{y_P}\\left(\\frac{x_2-x_P}{r_2}-\\frac{x_1-x_P}{r_1}\\right)\\end{gathered}', true);
        tex($('f4'), 'V = k\\lambda\\int_{-L/2}^{L/2}\\frac{dx}{r} = k\\lambda\\,\\ln\\frac{x_2-x_P+r_2}{x_1-x_P+r_1}', true);
        break;
      case 'ring':
        tex($('f1'), 'dE = k\\frac{dq}{r^2} = k\\frac{dq}{x^2+R^2}', true);
        $('f2cap').textContent = '2 · Perpendicular parts cancel in pairs; keep the axial part';
        tex($('f2'), 'E_x = \\int dE\\cos\\alpha = \\int k\\frac{dq}{x^2+R^2}\\cdot\\frac{x}{\\sqrt{x^2+R^2}}', true);
        tex($('f3'), 'E_x = \\frac{kQ\\,x}{(x^2+R^2)^{3/2}} \\qquad (\\text{max at } x = R/\\sqrt2)', true);
        tex($('f4'), 'V = \\int\\frac{k\\,dq}{\\sqrt{x^2+R^2}} = \\frac{kQ}{\\sqrt{x^2+R^2}}', true);
        break;
      case 'disk':
        tex($('f1'), 'dq = \\sigma\\,(2\\pi r\\,dr)\\;\\Rightarrow\\; dE_x = \\frac{k\\,dq\\;x}{(x^2+r^2)^{3/2}}', true);
        $('f2cap').textContent = '2 · Add up rings from r = 0 to R';
        tex($('f2'), 'E_x = \\int_0^R \\frac{k\\,\\sigma\\,2\\pi r\\,x\\,dr}{(x^2+r^2)^{3/2}}', true);
        tex($('f3'), 'E_x = \\frac{\\sigma}{2\\varepsilon_0}\\left(1-\\frac{x}{\\sqrt{x^2+R^2}}\\right)\\;\\xrightarrow{R\\to\\infty}\\;\\frac{\\sigma}{2\\varepsilon_0}', true);
        tex($('f4'), 'V = \\frac{\\sigma}{2\\varepsilon_0}\\left(\\sqrt{x^2+R^2}-x\\right)', true);
        break;
      case 'arc':
        tex($('f1'), 'dq = \\lambda R\\,d\\theta,\\qquad dE = k\\frac{\\lambda R\\,d\\theta}{R^2} = \\frac{k\\lambda}{R}\\,d\\theta', true);
        $('f2cap').textContent = '2 · At the centre, sideways parts cancel';
        tex($('f2'), 'E = \\int_{-\\theta_0}^{\\theta_0} \\frac{k\\lambda}{R}\\cos\\theta\\,d\\theta', true);
        tex($('f3'), 'E_{\\text{centre}} = \\frac{2k\\lambda}{R}\\sin\\theta_0 \\qquad (\\text{semicircle: } \\tfrac{2k\\lambda}{R})', true);
        tex($('f4'), 'V_{\\text{centre}} = \\frac{k\\,Q}{R} = 2k\\lambda\\theta_0', true);
        break;
    }
    drawGraph();
  }

  function drawGraph() {
    const p = state.p, P = state.P;
    const xs = [], ys = [], y2 = [], y3 = [];
    let opts;
    const legend = (items) => { $('gLegend').innerHTML = items.map(([c, t, dash]) => `<span><i style="background:${c};${dash ? 'border-radius:0;height:2px;width:14px' : ''}"></i>${t}</span>`).join(''); };
    switch (state.mode) {
      case 'rod': {
        const Q = p.lam * nC * p.L;
        for (let i = 1; i <= 400; i++) {
          const y = 4 * i / 400; xs.push(y);
          ys.push(exactRodY(y)); y2.push(K * Q / (y * y)); y3.push(2 * K * p.lam * nC / y);
        }
        $('gTitle').textContent = 'E on the perpendicular bisector';
        const onB = Math.abs(P[0]) < 1e-6 && P[1] > 0;
        opts = {
          xRange: [0, 4], curves: [{ xs, ys: y3, color: '#5fd0ff', dash: [5, 4], width: 1.6 }, { xs, ys: y2, color: '#c39bff', dash: [5, 4], width: 1.6 }, { xs, ys, color: '#ffd166' }],
          yRange: rangeOf(ys.filter((v, i) => xs[i] >= 0.4)), xLabel: 'y', xUnit: 'm', yLabel: 'E', yUnit: 'N/C',
          marker: onB ? { x: P[1], y: exactRodY(P[1]), text: fmtSI(exactRodY(P[1]), 'N/C') } : null
        };
        legend([['#ffd166', 'rod (exact)'], ['#5fd0ff', 'infinite line 2kλ/y', 1], ['#c39bff', 'point charge kQ/y²', 1]]);
        $('gNote').textContent = (onB ? '' : 'Drag P onto the bisector (x = 0) to see it on the graph. ') + 'Close to the rod it looks like an infinite line; far away, like a point charge.';
        break;
      }
      case 'ring': {
        const Q = p.Q * nC;
        for (let i = 0; i <= 400; i++) { const x = -3 + 6 * i / 400; xs.push(x); ys.push(K * Q * x / Math.pow(x * x + p.R * p.R, 1.5)); }
        $('gTitle').textContent = 'Eₓ along the axis of the ring';
        const Ex = exact(P).E[0];
        opts = { xRange: [-3, 3], curves: [{ xs, ys, color: '#ffd166' }], xLabel: 'x', xUnit: 'm', yLabel: 'Eₓ', yUnit: 'N/C', vlines: [{ x: -p.R / Math.SQRT2, label: '−R/√2' }, { x: p.R / Math.SQRT2, label: 'R/√2' }], marker: { x: P[0], y: Ex, text: fmtSI(Ex, 'N/C') } };
        legend([['#ffd166', 'Eₓ = kQx / (x²+R²)^(3/2)']]);
        $('gNote').textContent = 'E = 0 at the centre (every dE is cancelled by the opposite piece) and → kQ/x² far away. Maximum |E| at x = ±R/√2.';
        break;
      }
      case 'disk': {
        const s = p.sig * nC, Q = s * PI * p.R * p.R;
        for (let i = 0; i <= 400; i++) {
          const x = -3 + 6 * i / 400; xs.push(x);
          ys.push(x === 0 ? NaN : Math.sign(x) * s / (2 * EPS0) * (1 - Math.abs(x) / Math.hypot(x, p.R)));
          y2.push(x === 0 ? NaN : Math.sign(x) * s / (2 * EPS0)); y3.push(x === 0 ? NaN : Math.sign(x) * K * Q / (x * x));
        }
        $('gTitle').textContent = 'Eₓ along the axis of the disk';
        const Ex = exact(P).E[0];
        opts = {
          xRange: [-3, 3], curves: [{ xs, ys: y2, color: '#5fd0ff', dash: [5, 4], width: 1.6 }, { xs, ys: y3, color: '#c39bff', dash: [5, 4], width: 1.6 }, { xs, ys, color: '#ffd166' }],
          yRange: rangeOf(ys.concat(y2)), xLabel: 'x', xUnit: 'm', yLabel: 'Eₓ', yUnit: 'N/C',
          marker: isFinite(Ex) ? { x: P[0], y: Ex, text: fmtSI(Ex, 'N/C') } : null
        };
        legend([['#ffd166', 'disk (exact)'], ['#5fd0ff', 'infinite sheet σ/2ε₀', 1], ['#c39bff', 'point charge kQ/x²', 1]]);
        $('gNote').textContent = 'Close to the disk it acts like an infinite sheet; far away like a point charge. Eₓ jumps by σ/ε₀ across the disk.';
        break;
      }
      case 'arc': {
        for (let i = 0; i <= 360; i++) { const t = 180 * i / 360; xs.push(t); ys.push(2 * K * p.lam * nC / p.R * Math.sin(t * PI / 180)); }
        $('gTitle').textContent = 'E at the centre vs half-angle θ₀';
        const atC = Math.hypot(P[0], P[1]) < 1e-6;
        const Ec = 2 * K * p.lam * nC / p.R * Math.sin(p.th * PI / 180);
        opts = { xRange: [0, 180], curves: [{ xs, ys, color: '#ffd166' }], xLabel: 'θ₀', xUnit: 'deg', yLabel: 'E', yUnit: 'N/C', vlines: [{ x: 90, label: '90°' }], marker: { x: p.th, y: Ec, text: fmtSI(Ec, 'N/C') } };
        legend([['#ffd166', 'E = (2kλ/R) sin θ₀']]);
        $('gNote').textContent = (atC ? '' : 'P is not at the centre — the readouts use an exact numerical sum (N = 6000). ') + 'A full ring (θ₀ = 180°) gives zero field at its centre.';
        break;
      }
    }
    drawPlot($('graph'), opts);
  }
  function exactRodY(y) { const p = state.p, a = p.L / 2; return 2 * K * p.lam * nC / y * a / Math.sqrt(y * y + a * a); }
  function rangeOf(arr) {
    let lo = 0, hi = 0;
    for (const v of arr) if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pad = (hi - lo) * 0.12 || 1;
    return [lo < 0 ? lo - pad : -pad * 0.3, hi > 0 ? hi + pad : pad * 0.3];
  }

  /* ---------------- UI ---------------- */
  let sliders = {};
  function buildParams() {
    const m = MODES[state.mode];
    const box = $('paramBox'); box.innerHTML = '';
    state.p = {}; sliders = {};
    for (const [k, sp] of Object.entries(m.params)) {
      state.p[k] = sp.value;
      const d = document.createElement('div'); d.className = 'slider';
      d.innerHTML = `<div class="top"><span>${sp.label}</span><b id="q_${k}Val"></b></div><input type="range" id="q_${k}" min="${sp.min}" max="${sp.max}" step="${sp.step}" value="${sp.value}">`;
      box.appendChild(d);
      sliders[k] = bindSlider('q_' + k, {
        format: v => (sp.unit === 'nC' || sp.unit.startsWith('nC/') ? (v > 0 ? '+' : '') : '') + fmtNum(v, 3) + (sp.unit === '°' ? '°' : ' ' + sp.unit),
        onInput: v => { state.p[k] = v; refresh(); }
      });
    }
  }
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('active', b.dataset.m === m));
    $('modeDesc').textContent = MODES[m].desc;
    buildParams();
    state.P = MODES[m].P0.slice();
    $('optPair').parentElement.lastChild.textContent = m === 'disk' ? ' Highlight one ring' : ' Symmetric pair';
    $('f1cap').textContent = m === 'disk' ? '1 · Slice the disk into rings (each gives the ring result)' : '1 · Field of one small piece';
    $('scaleHud').textContent = MODES[m].view3d ? 'oblique 3D view · ticks every 1 m' : 'grid: 0.5 m';
    resize();
    refresh();
  }
  function refresh() { compute(); draw(); updatePanels(); }

  document.querySelectorAll('#modeSeg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
  bindSlider('N', { format: v => String(v), onInput: v => { state.N = v; refresh(); } });
  $('optDE').addEventListener('change', e => { state.showDE = e.target.checked; draw(); });
  $('optChain').addEventListener('change', e => { state.chain = e.target.checked; draw(); });
  $('optComp').addEventListener('change', e => { state.comp = e.target.checked; draw(); });
  $('optPair').addEventListener('change', e => { state.pair = e.target.checked; draw(); });

  // dragging P
  let dragging = false;
  function setPFromScreen(sx, sy) {
    const snap = v => Math.round(v * 20) / 20;
    if (MODES[state.mode].view3d) {
      const o = proj(0, 0, 0), a = proj(1, 0, 0);
      const ax = a[0] - o[0], ay = a[1] - o[1];
      const t = ((sx - o[0]) * ax + (sy - o[1]) * ay) / (ax * ax + ay * ay);
      state.P = [clamp(snap(t), -3, 3), 0, 0];
    } else {
      state.P = [snap((sx - view.cx) / view.ppm), snap((view.cy - sy) / view.ppm), 0];
    }
    refresh();
  }
  function pos(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  cv.addEventListener('pointerdown', ev => { dragging = true; cv.setPointerCapture(ev.pointerId); setPFromScreen(...pos(ev)); cv.style.cursor = 'grabbing'; });
  cv.addEventListener('pointermove', ev => {
    if (dragging) { setPFromScreen(...pos(ev)); return; }
    const [sx, sy] = pos(ev), sp = proj(...state.P);
    cv.style.cursor = Math.hypot(sx - sp[0], sy - sp[1]) < 16 ? 'grab' : 'crosshair';
  });
  const end = () => { dragging = false; cv.style.cursor = ''; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

  new ResizeObserver(resize).observe(stage);
  new ResizeObserver(() => cache && drawGraph()).observe($('graph'));
  setMode('rod');

  window.__dist = { state, exact, pieces, sumField, setMode, refresh };
})();
