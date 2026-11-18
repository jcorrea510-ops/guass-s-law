/* Shared helpers for every page (classic script → window.EL) */
(function () {
  'use strict';
  const K = 8.9875517923e9;      // Coulomb constant, N·m²/C²
  const EPS0 = 8.8541878128e-12; // vacuum permittivity, C²/(N·m²)

  const PREFIXES = [
    { e: 12, s: 'T' }, { e: 9, s: 'G' }, { e: 6, s: 'M' }, { e: 3, s: 'k' }, { e: 0, s: '' },
    { e: -3, s: 'm' }, { e: -6, s: 'µ' }, { e: -9, s: 'n' }, { e: -12, s: 'p' }, { e: -15, s: 'f' }
  ];

  /** Format a value with an SI prefix: fmtSI(4.5e-8, 'C') → "45.0 nC" */
  function fmtSI(v, unit = '', digits = 3) {
    if (!isFinite(v)) return (v > 0 ? '∞' : v < 0 ? '−∞' : '—') + (unit ? ' ' + unit : '');
    if (v === 0) return '0 ' + unit;
    const a = Math.abs(v);
    let p = PREFIXES[PREFIXES.length - 1];
    for (const pr of PREFIXES) { if (a >= Math.pow(10, pr.e) * 0.9995) { p = pr; break; } }
    const scaled = v / Math.pow(10, p.e);
    return fmtNum(scaled, digits) + ' ' + p.s + unit;
  }

  /** Significant-figure formatting with a true minus sign */
  function fmtNum(v, digits = 3) {
    if (!isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : '—';
    if (v === 0) return '0';
    const a = Math.abs(v);
    let s;
    if (a >= 1e6 || a < 1e-3) {
      s = v.toExponential(digits - 1).replace('e+', 'e');
      const [m, ex] = s.split('e');
      s = m + '×10' + supNum(parseInt(ex, 10));
    } else {
      s = Number(v.toPrecision(digits)).toString();
    }
    return s.replace(/^-/, '−');
  }
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function supNum(n) { return String(n).split('').map(c => SUP[c] || c).join(''); }

  /** LaTeX-friendly scientific notation: 1.23 \times 10^{-9} */
  function texNum(v, digits = 3) {
    if (!isFinite(v)) return v > 0 ? '\\infty' : '-\\infty';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e4 || a < 1e-2) {
      const s = v.toExponential(digits - 1);
      const [m, ex] = s.split('e');
      return m + '\\times 10^{' + parseInt(ex, 10) + '}';
    }
    return Number(v.toPrecision(digits)).toString();
  }

  /* ---------- KaTeX ---------- */
  function tex(el, src, display = false) {
    if (!el) return;
    if (window.katex) {
      try { window.katex.render(src, el, { displayMode: display, throwOnError: false, strict: 'ignore' }); return; }
      catch (e) { /* fall through */ }
    }
    el.textContent = src;
  }
  function renderAllTex(root = document) {
    root.querySelectorAll('[data-tex]').forEach(el => {
      tex(el, el.getAttribute('data-tex'), el.hasAttribute('data-display'));
    });
  }

  /* ---------- Navigation ---------- */
  const PAGES = [
    { href: 'field.html', label: 'Electric Field', id: 'field' },
    { href: 'gauss.html', label: "Gauss's Law", id: 'gauss' },
    { href: 'flux.html', label: 'Flux Explorer', id: 'flux' },
    { href: 'distributions.html', label: 'Continuous Charges', id: 'dist' }
  ];
  function buildNav(activeId) {
    const host = document.getElementById('nav');
    if (!host) return;
    host.className = 'topnav';
    host.innerHTML =
      '<a class="brand" href="index.html"><span class="logo"></span><span>Electrostatics Lab</span></a>' +
      '<button class="menu-btn" aria-label="Menu" aria-expanded="false">☰</button>' +
      '<nav class="navlinks">' +
      PAGES.map(p => `<a href="${p.href}" class="${p.id === activeId ? 'active' : ''}">${p.label}</a>`).join('') +
      '</nav>';
    const btn = host.querySelector('.menu-btn');
    const links = host.querySelector('.navlinks');
    btn.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
  }

  /* ---------- Sliders ---------- */
  /**
   * bindSlider(id, {format, onInput}) — keeps the value label and the track fill in sync.
   * Expects <input type=range id=...> and an element with id = id + 'Val'.
   */
  function bindSlider(id, opts = {}) {
    const el = document.getElementById(id);
    const lab = document.getElementById(id + 'Val');
    const fmt = opts.format || (v => v);
    function sync(fire) {
      const min = parseFloat(el.min), max = parseFloat(el.max), v = parseFloat(el.value);
      el.style.setProperty('--fill', ((v - min) / (max - min) * 100) + '%');
      if (lab) lab.textContent = fmt(v);
      if (fire && opts.onInput) opts.onInput(v);
    }
    el.addEventListener('input', () => sync(true));
    sync(false);
    return {
      el,
      get value() { return parseFloat(el.value); },
      set(v, fire = false) { el.value = v; sync(fire); },
      refresh() { sync(false); }
    };
  }

  /* ---------- HiDPI canvas ---------- */
  function fitCanvas(canvas, ctx) {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h, dpr };
  }

  function arrow(ctx, x0, y0, x1, y1, head = 7, width = 2) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 0.5) return;
    const ux = dx / L, uy = dy / L;
    const hh = Math.min(head, L * 0.6);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * hh * 0.7, y1 - uy * hh * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * hh - uy * hh * 0.5, y1 - uy * hh + ux * hh * 0.5);
    ctx.lineTo(x1 - ux * hh + uy * hh * 0.5, y1 - uy * hh - ux * hh * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  function toast(el, msg, ms = 1800) {
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  window.EL = { K, EPS0, fmtSI, fmtNum, texNum, tex, renderAllTex, buildNav, bindSlider, fitCanvas, arrow, toast, clamp };
})();
