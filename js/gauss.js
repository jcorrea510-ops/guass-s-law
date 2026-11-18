/* Gauss's Law Lab — symmetric charge distributions in 3D */
import * as THREE from '../vendor/three.module.min.js';
import { OrbitControls } from '../vendor/OrbitControls.js';

const { K, EPS0, fmtSI, fmtNum, texNum, tex, bindSlider, clamp, drawPlot } = window.EL;
EL.buildNav('gauss');
EL.renderAllTex();

const nC = 1e-9;
const PI = Math.PI;
const Lg = 2;              // length of the Gaussian cylinder (m)
const Rp = 0.6;            // radius of the pillbox caps (m)
const Ap = PI * Rp * Rp;   // pillbox cap area (m²)
const LR = 6;              // drawn length of "infinite" cylinders (m)
const S = 5;               // drawn size of "infinite" planes (m)
const CAP_T = 0.3;         // capacitor plate thickness (m)

/* =====================================================================
   Case definitions. Every E value is obtained from Gauss's law itself:
   E = Q_enc / (ε0 × area factor), so the graphs ARE Gauss's law.
   ===================================================================== */
const sgnTxt = v => v > 0 ? 'outward' : v < 0 ? 'inward' : '';
const CASES = {
  point: {
    name: 'Point charge', geom: 'sphere', singular: true,
    desc: 'A single point charge. Every sphere centred on it has E constant and radial over its surface.',
    params: { Q: { label: 'Charge Q', min: -20, max: 20, step: 0.5, value: 10, unit: 'nC' } },
    rmax: 3, r0: 1.5,
    qenc: (r, p) => p.Q * nC,
    total: p => p.Q * nC,
    breaks: () => [], vlines: () => [], conductors: () => [],
    region: () => ({ name: 'Gaussian sphere around a point charge', text: 'All of the charge is enclosed for every r, so the flux is the same for every sphere and E ∝ 1/r².', q: 'Q_{\\text{enc}} = Q', e: 'E = \\dfrac{Q}{4\\pi\\varepsilon_0 r^2} = \\dfrac{kQ}{r^2}' })
  },
  solidSphere: {
    name: 'Insulating sphere', geom: 'sphere',
    desc: 'Charge Q spread uniformly through the volume of an insulating sphere of radius R (ρ = Q ⁄ (4/3)πR³).',
    params: {
      Q: { label: 'Total charge Q', min: -20, max: 20, step: 0.5, value: 10, unit: 'nC' },
      R: { label: 'Radius R', min: 0.4, max: 1.5, step: 0.05, value: 1, unit: 'm' }
    },
    rmax: 3, r0: 0.6,
    qenc: (r, p) => p.Q * nC * (r < p.R ? Math.pow(r / p.R, 3) : 1),
    total: p => p.Q * nC,
    breaks: () => [], vlines: p => [{ x: p.R, label: 'R' }], conductors: () => [],
    region: (r, p) => r < p.R
      ? { name: 'Inside the sphere (r < R)', text: 'Only the charge within radius r is enclosed. Q_enc grows like r³ while the area grows like r², so E grows linearly with r.', q: 'Q_{\\text{enc}} = \\rho\\cdot\\tfrac43\\pi r^3 = Q\\,\\dfrac{r^3}{R^3}', e: 'E = \\dfrac{Q\\,r}{4\\pi\\varepsilon_0 R^3} = \\dfrac{kQ}{R^3}\\,r' }
      : { name: 'Outside the sphere (r ≥ R)', text: 'All of Q is enclosed: outside, the sphere looks exactly like a point charge at its centre.', q: 'Q_{\\text{enc}} = Q', e: 'E = \\dfrac{kQ}{r^2}' }
  },
  nonuniform: {
    name: 'Non-uniform sphere', geom: 'sphere',
    desc: 'Insulating sphere with charge density ρ(r) = A·r, where A = Q/(πR⁴). A classic AP Physics C integral.',
    params: {
      Q: { label: 'Total charge Q', min: -20, max: 20, step: 0.5, value: 10, unit: 'nC' },
      R: { label: 'Radius R', min: 0.4, max: 1.5, step: 0.05, value: 1, unit: 'm' }
    },
    rmax: 3, r0: 0.6,
    qenc: (r, p) => p.Q * nC * (r < p.R ? Math.pow(r / p.R, 4) : 1),
    total: p => p.Q * nC,
    breaks: () => [], vlines: p => [{ x: p.R, label: 'R' }], conductors: () => [],
    region: (r, p) => r < p.R
      ? { name: 'Inside (r < R): integrate ρ dV', text: 'The density varies with r, so Q_enc requires an integral over spherical shells of volume dV = 4πr′² dr′.', q: 'Q_{\\text{enc}} = \\int_0^r A r\'\\,(4\\pi r\'^2)\\,dr\' = \\pi A r^4 = Q\\dfrac{r^4}{R^4}', e: 'E = \\dfrac{A r^2}{4\\varepsilon_0} = \\dfrac{kQ}{R^4}\\,r^2' }
      : { name: 'Outside (r ≥ R)', text: 'All of Q is enclosed, so E = kQ/r², exactly like a point charge.', q: 'Q_{\\text{enc}} = \\pi A R^4 = Q', e: 'E = \\dfrac{kQ}{r^2}' }
  },
  shell: {
    name: 'Thin spherical shell', geom: 'sphere',
    desc: 'Charge Q spread uniformly over a thin spherical shell of radius R.',
    params: {
      Q: { label: 'Charge Q', min: -20, max: 20, step: 0.5, value: 10, unit: 'nC' },
      R: { label: 'Radius R', min: 0.4, max: 1.5, step: 0.05, value: 1, unit: 'm' }
    },
    rmax: 3, r0: 0.6,
    qenc: (r, p) => (r < p.R ? 0 : p.Q * nC),
    total: p => p.Q * nC,
    breaks: p => [p.R], vlines: p => [{ x: p.R, label: 'R' }], conductors: () => [],
    region: (r, p) => r < p.R
      ? { name: 'Inside the shell (r < R)', text: 'No charge is enclosed, so the flux is zero — and by symmetry E must be zero everywhere inside.', q: 'Q_{\\text{enc}} = 0', e: 'E = 0' }
      : { name: 'Outside the shell (r ≥ R)', text: 'All of Q is enclosed. E jumps by σ/ε₀ crossing the charged surface.', q: 'Q_{\\text{enc}} = Q', e: 'E = \\dfrac{kQ}{r^2}' }
  },
  conductorSphere: {
    name: 'Conducting sphere', geom: 'sphere',
    desc: 'A solid metal sphere with net charge Q. In equilibrium, E = 0 inside the metal, so all excess charge sits on the surface.',
    params: {
      Q: { label: 'Net charge Q', min: -20, max: 20, step: 0.5, value: 10, unit: 'nC' },
      R: { label: 'Radius R', min: 0.4, max: 1.5, step: 0.05, value: 1, unit: 'm' }
    },
    rmax: 3, r0: 0.6,
    qenc: (r, p) => (r < p.R ? 0 : p.Q * nC),
    total: p => p.Q * nC,
    breaks: p => [p.R], vlines: p => [{ x: p.R, label: 'R' }], conductors: p => [[0, p.R]],
    region: (r, p) => r < p.R
      ? { name: 'Inside the conductor (r < R)', text: 'E = 0 inside a conductor in electrostatic equilibrium, so Gauss\'s law says Q_enc = 0: the excess charge must be on the surface. V is constant (equipotential) throughout.', q: 'Q_{\\text{enc}} = 0', e: 'E = 0,\\quad V = \\dfrac{kQ}{R}' }
      : { name: 'Outside the conductor (r ≥ R)', text: 'All of Q is enclosed. Just outside, E = σ/ε₀ with σ = Q/(4πR²).', q: 'Q_{\\text{enc}} = Q', e: 'E = \\dfrac{kQ}{r^2}' }
  },
  shellCavity: {
    name: 'Charge in conducting shell', geom: 'sphere', singular: true,
    desc: 'Point charge q at the centre of a thick conducting shell (inner radius a, outer radius b) carrying net charge Q_shell.',
    params: {
      q: { label: 'Centre charge q', min: -10, max: 10, step: 0.5, value: 5, unit: 'nC' },
      Qs: { label: 'Net shell charge Q_shell', min: -10, max: 10, step: 0.5, value: 0, unit: 'nC' },
      a: { label: 'Inner radius a', min: 0.3, max: 1.2, step: 0.05, value: 0.8, unit: 'm' },
      b: { label: 'Outer radius b', min: 0.4, max: 1.5, step: 0.05, value: 1.2, unit: 'm' }
    },
    constrain: (p, changed) => {
      if (p.b < p.a + 0.1) { if (changed === 'a') p.b = Math.min(1.5, p.a + 0.1); else p.a = Math.max(0.3, p.b - 0.1); if (p.b < p.a + 0.1) p.a = p.b - 0.1; }
    },
    rmax: 3, r0: 1,
    qenc: (r, p) => (r < p.a ? p.q * nC : r < p.b ? 0 : (p.q + p.Qs) * nC),
    total: p => (p.q + p.Qs) * nC,
    breaks: p => [p.a, p.b], vlines: p => [{ x: p.a, label: 'a' }, { x: p.b, label: 'b' }], conductors: p => [[p.a, p.b]],
    region: (r, p) => r < p.a
      ? { name: 'In the cavity (r < a)', text: 'Only the centre charge is enclosed. The conductor\'s charges have no effect here (they are all outside this sphere and spherically symmetric).', q: 'Q_{\\text{enc}} = q', e: 'E = \\dfrac{kq}{r^2}' }
      : r < p.b
        ? { name: 'Inside the metal (a < r < b)', text: 'E = 0 in the conductor ⇒ Q_enc = 0. So the inner surface must carry an induced charge −q; the outer surface carries the rest: q + Q_shell.', q: 'Q_{\\text{enc}} = q + (-q) = 0', e: 'E = 0' }
        : { name: 'Outside (r > b)', text: 'Enclosed: q + (−q) + (q + Q_shell) = q + Q_shell.', q: 'Q_{\\text{enc}} = q + Q_{\\text{shell}}', e: 'E = \\dfrac{k\\,(q+Q_{\\text{shell}})}{r^2}' }
  },
  line: {
    name: 'Infinite line', geom: 'cyl', singular: true,
    desc: 'An infinitely long straight line with uniform linear charge density λ. Use a coaxial Gaussian cylinder of length L.',
    params: { lam: { label: 'Linear density λ', min: -10, max: 10, step: 0.5, value: 5, unit: 'nC/m' } },
    rmax: 3, r0: 1.2, vref: 1, vrefText: 'V(1 m) = 0 (V(∞) is not finite for an infinite line)',
    qenc: (r, p) => p.lam * nC * Lg,
    breaks: () => [], vlines: () => [], conductors: () => [],
    region: () => ({ name: 'Gaussian cylinder around the line', text: 'Charge enclosed is λL for any radius; flux leaves only through the curved side, so E ∝ 1/r.', q: 'Q_{\\text{enc}} = \\lambda L', e: 'E = \\dfrac{\\lambda}{2\\pi\\varepsilon_0 r} = \\dfrac{2k\\lambda}{r}' })
  },
  solidCyl: {
    name: 'Insulating cylinder', geom: 'cyl',
    desc: 'Infinitely long insulating cylinder of radius R with uniform volume charge; λ is the charge per unit length (ρ = λ / πR²).',
    params: {
      lam: { label: 'Charge per length λ', min: -10, max: 10, step: 0.5, value: 5, unit: 'nC/m' },
      R: { label: 'Radius R', min: 0.3, max: 1.5, step: 0.05, value: 1, unit: 'm' }
    },
    rmax: 3, r0: 0.6, vref: 'R', vrefText: 'V(R) = 0 (surface of the cylinder)',
    qenc: (r, p) => p.lam * nC * Lg * (r < p.R ? (r * r) / (p.R * p.R) : 1),
    breaks: () => [], vlines: p => [{ x: p.R, label: 'R' }], conductors: () => [],
    region: (r, p) => r < p.R
      ? { name: 'Inside the cylinder (r < R)', text: 'Enclosed charge grows like r² while the side area grows like r, so E ∝ r.', q: 'Q_{\\text{enc}} = \\rho\\,\\pi r^2 L = \\lambda L\\,\\dfrac{r^2}{R^2}', e: 'E = \\dfrac{\\rho r}{2\\varepsilon_0} = \\dfrac{\\lambda\\, r}{2\\pi\\varepsilon_0 R^2}' }
      : { name: 'Outside the cylinder (r ≥ R)', text: 'All the charge in length L is enclosed: looks like a line charge.', q: 'Q_{\\text{enc}} = \\lambda L', e: 'E = \\dfrac{\\lambda}{2\\pi\\varepsilon_0 r}' }
  },
  coax: {
    name: 'Coaxial cable', geom: 'cyl',
    desc: 'Solid inner conductor (radius a) with +λ and a thin outer conducting shell (radius b) with −λ — a cylindrical capacitor.',
    params: {
      lam: { label: 'Inner conductor λ', min: -10, max: 10, step: 0.5, value: 5, unit: 'nC/m' },
      a: { label: 'Inner radius a', min: 0.2, max: 1, step: 0.05, value: 0.5, unit: 'm' },
      b: { label: 'Outer radius b', min: 0.5, max: 2, step: 0.05, value: 1.5, unit: 'm' }
    },
    constrain: (p, changed) => {
      if (p.b < p.a + 0.2) { if (changed === 'a') p.b = Math.min(2, p.a + 0.2); else p.a = Math.max(0.2, p.b - 0.2); }
    },
    rmax: 3, r0: 1, vref: 'b', vrefText: 'V(b) = 0 (outer conductor grounded); ΔV = (λ/2πε₀) ln(b/a)',
    qenc: (r, p) => (r < p.a ? 0 : r < p.b ? p.lam * nC * Lg : 0),
    breaks: p => [p.a, p.b], vlines: p => [{ x: p.a, label: 'a' }, { x: p.b, label: 'b' }], conductors: p => [[0, p.a]],
    region: (r, p) => r < p.a
      ? { name: 'Inside the inner conductor (r < a)', text: 'Conductor ⇒ E = 0, and its charge +λ lives on its outer surface.', q: 'Q_{\\text{enc}} = 0', e: 'E = 0' }
      : r < p.b
        ? { name: 'Between the conductors (a < r < b)', text: 'Only the inner conductor\'s charge is enclosed.', q: 'Q_{\\text{enc}} = \\lambda L', e: 'E = \\dfrac{\\lambda}{2\\pi\\varepsilon_0 r}' }
        : { name: 'Outside the cable (r > b)', text: 'Equal and opposite charges: λL − λL = 0, so the field outside a coax cable vanishes.', q: 'Q_{\\text{enc}} = \\lambda L - \\lambda L = 0', e: 'E = 0' }
  },
  sheet: {
    name: 'Infinite sheet', geom: 'plane', mode: 'sym',
    desc: 'An infinite, thin, non-conducting sheet with uniform surface charge density σ. Use a pillbox that straddles the sheet.',
    params: { sig: { label: 'Surface density σ', min: -10, max: 10, step: 0.5, value: 4, unit: 'nC/m²' } },
    rmax: 3, r0: 1, vref: 0, vrefText: 'V(0) = 0 at the sheet',
    qenc: (x, p) => p.sig * nC * Ap,
    breaks: () => [0], vlines: () => [], conductors: () => [],
    region: () => ({ name: 'Pillbox straddling the sheet', text: 'Flux leaves through both end caps; E is the same at any distance — the field of an infinite sheet is uniform.', q: 'Q_{\\text{enc}} = \\sigma A', e: 'E = \\dfrac{\\sigma}{2\\varepsilon_0}' })
  },
  slab: {
    name: 'Thick slab', geom: 'plane', mode: 'sym',
    desc: 'An infinite slab of thickness 2d with uniform volume charge density ρ, centred on x = 0.',
    params: {
      rho: { label: 'Volume density ρ', min: -10, max: 10, step: 0.5, value: 4, unit: 'nC/m³' },
      d: { label: 'Half-thickness d', min: 0.2, max: 1.5, step: 0.05, value: 0.8, unit: 'm' }
    },
    rmax: 3, r0: 0.5, vref: 0, vrefText: 'V(0) = 0 at the centre plane',
    qenc: (x, p) => p.rho * nC * Ap * 2 * Math.min(Math.abs(x), p.d),
    breaks: () => [], vlines: p => [{ x: -p.d, label: '−d' }, { x: p.d, label: 'd' }], conductors: () => [],
    region: (x, p) => Math.abs(x) < p.d
      ? { name: 'Caps inside the slab (|x| < d)', text: 'The pillbox encloses a slice of thickness 2x, so E grows linearly from zero at the centre plane.', q: 'Q_{\\text{enc}} = \\rho A\\,(2x)', e: 'E = \\dfrac{\\rho\\, x}{\\varepsilon_0}' }
      : { name: 'Caps outside the slab (|x| ≥ d)', text: 'The whole thickness 2d is enclosed — uniform field like a sheet with σ = 2ρd.', q: 'Q_{\\text{enc}} = \\rho A\\,(2d)', e: 'E = \\dfrac{\\rho\\, d}{\\varepsilon_0}' }
  },
  conductorPlate: {
    name: 'Conducting plate', geom: 'plane', mode: 'one', anchor: () => 0,
    desc: 'A large charged metal plate of thickness 2t. Each face carries surface density σ. One pillbox cap sits inside the metal where E = 0.',
    params: {
      sig: { label: 'σ on each face', min: -10, max: 10, step: 0.5, value: 4, unit: 'nC/m²' },
      t: { label: 'Half-thickness t', min: 0.1, max: 0.8, step: 0.05, value: 0.3, unit: 'm' }
    },
    rmax: 3, r0: 1, vref: 0, vrefText: 'V = 0 in the plate',
    qenc: (x, p) => (Math.abs(x) < p.t ? 0 : p.sig * nC * Ap),
    breaks: p => [-p.t, p.t], vlines: p => [{ x: -p.t, label: '−t' }, { x: p.t, label: 't' }], conductors: p => [[-p.t, p.t]],
    region: (x, p) => Math.abs(x) < p.t
      ? { name: 'Both caps inside the metal', text: 'Inside a conductor E = 0, so no charge is enclosed: excess charge lives on the faces.', q: 'Q_{\\text{enc}} = 0', e: 'E = 0' }
      : { name: 'Outer cap outside the metal', text: 'The inner cap is in the metal (E = 0), so only one cap carries flux. This gives E = σ/ε₀ just outside any conductor.', q: 'Q_{\\text{enc}} = \\sigma A', e: 'E = \\dfrac{\\sigma}{\\varepsilon_0}' }
  },
  capacitor: {
    name: 'Parallel-plate capacitor', geom: 'plane', mode: 'one', anchor: p => -p.s / 2 - CAP_T / 2,
    desc: 'Two large conducting plates with +σ and −σ on their facing surfaces. The fixed pillbox cap sits inside the left (+) plate.',
    params: {
      sig: { label: 'Surface density σ', min: 0.5, max: 10, step: 0.5, value: 4, unit: 'nC/m²' },
      s: { label: 'Plate separation d', min: 0.6, max: 3, step: 0.1, value: 2, unit: 'm' }
    },
    rmax: 3, r0: 0, vref: 's+', vrefText: 'V = 0 on the negative plate; ΔV = σd/ε₀ = Ed',
    qenc: (x, p) => {
      const a = -p.s / 2 - CAP_T / 2;
      if (x <= a) return 0;
      let q = 0;
      if (x > -p.s / 2) q += p.sig * nC * Ap;
      if (x > p.s / 2) q -= p.sig * nC * Ap;
      return q;
    },
    breaks: p => [-p.s / 2, p.s / 2], vlines: p => [{ x: -p.s / 2, label: '+' }, { x: p.s / 2, label: '−' }],
    conductors: p => [[-p.s / 2 - CAP_T, -p.s / 2], [p.s / 2, p.s / 2 + CAP_T]],
    region: (x, p) => x < -p.s / 2 - CAP_T
      ? { name: 'Left of the capacitor', text: 'Nothing is enclosed between this cap and the metal (the outer faces carry no charge), so E = 0 outside an ideal capacitor.', q: 'Q_{\\text{enc}} = 0', e: 'E = 0' }
      : x < -p.s / 2
        ? { name: 'Inside the + plate', text: 'Inside the metal E = 0 and nothing is enclosed.', q: 'Q_{\\text{enc}} = 0', e: 'E = 0' }
        : x < p.s / 2
          ? { name: 'Between the plates', text: 'The pillbox encloses the +σ on the inner face of the left plate. The field is uniform, pointing from + to −.', q: 'Q_{\\text{enc}} = \\sigma A', e: 'E = \\dfrac{\\sigma}{\\varepsilon_0}' }
          : { name: 'In or beyond the − plate', text: 'Now the pillbox encloses +σA and −σA: Q_enc = 0, so E = 0 inside the − plate and outside the capacitor.', q: 'Q_{\\text{enc}} = \\sigma A - \\sigma A = 0', e: 'E = 0' }
  }
};

/* Field from Gauss's law for the current geometry (radial or x-component, N/C) */
function Efield(x, c, p) {
  if (c.geom === 'sphere') {
    if (x <= 1e-9) return c.singular && c.qenc(0, p) !== 0 ? Infinity * Math.sign(c.qenc(0, p)) : 0;
    return c.qenc(x, p) / (4 * PI * EPS0 * x * x);
  }
  if (c.geom === 'cyl') {
    if (x <= 1e-9) return c.singular && c.qenc(0, p) !== 0 ? Infinity * Math.sign(c.qenc(0, p)) : 0;
    return c.qenc(x, p) / (2 * PI * EPS0 * x * Lg);
  }
  if (c.mode === 'sym') {
    if (x === 0) return 0;
    return Math.sign(x) * c.qenc(Math.abs(x), p) / (2 * EPS0 * Ap);
  }
  const n = x >= c.anchor(p) ? 1 : -1;
  return n * c.qenc(x, p) / (EPS0 * Ap);
}

/* =====================================================================
   State & UI
   ===================================================================== */
const $ = id => document.getElementById(id);
const state = { key: 'solidSphere', p: {}, r: 0.6, sweeping: false, sweepDir: 1, cut: true, arrows: true, dA: false };
let curve = null; // cached samples for graphs & V lookup

function caseObj() { return CASES[state.key]; }

function buildParams() {
  const c = caseObj();
  const box = $('paramBox');
  box.innerHTML = '';
  state.p = {};
  for (const [k, sp] of Object.entries(c.params)) {
    state.p[k] = sp.value;
    const div = document.createElement('div');
    div.className = 'slider';
    div.innerHTML = `<div class="top"><span>${sp.label}</span><b id="p_${k}Val"></b></div>
      <input type="range" id="p_${k}" min="${sp.min}" max="${sp.max}" step="${sp.step}" value="${sp.value}">`;
    box.appendChild(div);
  }
  const sliders = {};
  for (const [k, sp] of Object.entries(c.params)) {
    sliders[k] = bindSlider('p_' + k, {
      format: v => (sp.unit === 'm' ? fmtNum(v, 3) : (v > 0 ? '+' : '') + fmtNum(v, 3)) + ' ' + sp.unit,
      onInput: v => {
        state.p[k] = v;
        if (c.constrain) {
          c.constrain(state.p, k);
          for (const kk of Object.keys(sliders)) if (kk !== k) sliders[kk].set(state.p[kk]);
        }
        onParamsChanged();
      }
    });
  }
}

const rSlider = bindSlider('rSlider', { format: v => fmtNum(v, 3) + ' m', onInput: v => { state.r = v; onSurfaceChanged(); } });

function setupCase(key) {
  state.key = key;
  const c = caseObj();
  $('caseDesc').textContent = c.desc;
  buildParams();
  // Gaussian-surface slider range
  const el = rSlider.el;
  if (c.geom === 'plane' && c.mode === 'one') { el.min = -c.rmax; el.max = c.rmax; }
  else { el.min = c.geom === 'plane' ? 0.02 : 0.03; el.max = c.rmax; }
  state.r = c.r0 || (c.geom === 'plane' && c.mode === 'one' ? 0 : 1);
  rSlider.set(state.r);
  $('rLabel').textContent = c.geom === 'sphere' ? 'Sphere radius r' : c.geom === 'cyl' ? 'Cylinder radius r' : (c.mode === 'sym' ? 'Cap distance x (each side)' : 'Outer cap position x');
  $('areaLabel').textContent = c.geom === 'sphere' ? 'Area 4πr²' : c.geom === 'cyl' ? 'Side area 2πrL (L = 2 m)' : (c.mode === 'sym' ? 'Cap area A (×2 caps)' : 'Cap area A');
  $('eLabel').textContent = c.geom === 'plane' ? 'Eₓ at outer cap' : 'E at surface';
  $('vLabel').textContent = c.geom === 'plane' ? 'V at outer cap' : 'V at surface';
  $('gE_title').textContent = c.geom === 'plane' ? 'Electric field Eₓ(x)' : 'Electric field E(r)';
  $('gV_title').textContent = c.geom === 'plane' ? 'Potential V(x)' : 'Potential V(r)';
  $('stepCap1').textContent = '1 · Flux through the ' + (c.geom === 'sphere' ? 'Gaussian sphere' : c.geom === 'cyl' ? 'Gaussian cylinder' : 'Gaussian pillbox') + ' (symmetry)';
  tex($('f1'), c.geom === 'sphere'
    ? '\\Phi_E=\\oint \\vec E\\cdot d\\vec A = E\\oint dA = E\\,(4\\pi r^2)'
    : c.geom === 'cyl'
      ? '\\Phi_E = \\underbrace{\\int_{\\text{side}} E\\,dA}_{E\\,(2\\pi r L)} + \\underbrace{\\int_{\\text{caps}}\\vec E\\cdot d\\vec A}_{0\\ (\\vec E\\perp d\\vec A)} = E\\,(2\\pi r L)'
      : c.mode === 'sym'
        ? '\\Phi_E = \\underbrace{EA}_{\\text{right cap}} + \\underbrace{EA}_{\\text{left cap}} + \\underbrace{0}_{\\text{side}} = 2EA'
        : '\\Phi_E = \\underbrace{0}_{\\text{cap in metal}} + \\underbrace{0}_{\\text{side}} + \\underbrace{EA}_{\\text{outer cap}} = EA', true);
  build3D();
  onParamsChanged();
  resetCamera();
}

function onParamsChanged() {
  computeCurves();
  rebuildDistribution();
  onSurfaceChanged();
}

/* ---------- sampling E and V ---------- */
function computeCurves() {
  const c = caseObj(), p = state.p;
  const x0 = c.geom === 'plane' ? -c.rmax : 0, x1 = c.rmax;
  const N = 3000;
  const brk = c.breaks(p).filter(b => b > x0 && b < x1).sort((a, b) => a - b);
  const xs = [];
  const start = c.geom === 'plane' ? x0 : x1 * 1e-3;
  for (let i = 0; i <= N; i++) xs.push(start + (x1 - start) * i / N);
  const eps = 1e-6;
  for (const b of brk) { xs.push(b - eps, b + eps); }
  if (c.geom === 'plane' && c.mode === 'one') { const a = c.anchor(p); xs.push(a - eps, a + eps); }
  xs.sort((a, b) => a - b);
  const special = brk.concat(c.geom === 'plane' && c.mode === 'one' ? [c.anchor(p)] : []);
  for (let i = xs.length - 1; i >= 0; i--) if (special.some(b => Math.abs(xs[i] - b) < eps / 2)) xs.splice(i, 1);
  const Es = xs.map(x => Efield(x, c, p));
  // cumulative integral of E (trapezoid; breaks have their own samples)
  const C = new Float64Array(xs.length);
  for (let i = 1; i < xs.length; i++) {
    const e0 = isFinite(Es[i - 1]) ? Es[i - 1] : Es[i], e1 = isFinite(Es[i]) ? Es[i] : Es[i - 1];
    C[i] = C[i - 1] + 0.5 * (e0 + e1) * (xs[i] - xs[i - 1]);
  }
  const interpC = x => {
    if (x <= xs[0]) return C[0];
    if (x >= xs[xs.length - 1]) return C[C.length - 1];
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
    return C[lo] + t * (C[hi] - C[lo]);
  };
  let Vfun;
  if (c.geom === 'sphere') {
    const Vend = K * c.total(p) / x1; // exterior is point-like
    Vfun = x => Vend + (C[C.length - 1] - interpC(x));
  } else {
    let ref = c.vref;
    if (ref === 'R') ref = p.R; else if (ref === 'b') ref = p.b; else if (ref === 's+') ref = p.s / 2;
    const Cref = interpC(ref);
    Vfun = x => -(interpC(x) - Cref);
  }
  const Vs = xs.map(x => Vfun(x));
  // plot copies with gaps at surface charges
  const pE = { xs: [], ys: [] };
  for (let i = 0; i < xs.length; i++) {
    if (i > 0 && brk.some(b => xs[i - 1] < b && xs[i] > b)) { pE.xs.push(xs[i]); pE.ys.push(NaN); }
    pE.xs.push(xs[i]); pE.ys.push(Es[i]);
  }
  curve = { xs, Es, Vs, Vfun, x0, x1, pE };
}

/* ---------- readouts, derivation, graphs ---------- */
function onSurfaceChanged() {
  const c = caseObj(), p = state.p, r = state.r;
  let qenc, area, E, xForE;
  if (c.geom === 'sphere') { qenc = c.qenc(r, p); area = 4 * PI * r * r; E = Efield(r, c, p); xForE = r; }
  else if (c.geom === 'cyl') { qenc = c.qenc(r, p); area = 2 * PI * r * Lg; E = Efield(r, c, p); xForE = r; }
  else if (c.mode === 'sym') { qenc = c.qenc(r, p); area = 2 * Ap; E = Efield(r, c, p); xForE = r; }
  else { qenc = c.qenc(r, p); area = Ap; E = Efield(r, c, p); xForE = r; }
  const flux = qenc / EPS0;
  const V = curve.Vfun(xForE);
  $('o_area').textContent = c.geom === 'plane' ? fmtNum(Ap, 3) + ' m²' + (c.mode === 'sym' ? ' ×2' : '') : fmtNum(area, 4) + ' m²';
  $('o_qenc').textContent = fmtSI(qenc, 'C');
  $('o_qenc').className = 'big ' + (qenc > 0 ? 'hl-pos' : qenc < 0 ? 'hl-neg' : '');
  $('o_flux').textContent = fmtSI(flux, 'N·m²/C');
  $('o_E').textContent = fmtSI(E, 'N/C');
  $('o_dir').textContent = E === 0 ? '— (E = 0)' : c.geom === 'plane' ? (E > 0 ? '+x' : '−x') : 'radially ' + sgnTxt(E);
  $('o_V').textContent = fmtSI(V, 'V');

  const reg = c.region(r, p);
  $('regionBox').innerHTML = `<b>${reg.name}.</b> ${reg.text}`;
  $('hudRegion').textContent = reg.name;
  tex($('f2'), reg.q, true);
  tex($('f3'), reg.e, true);
  const areaTex = c.geom === 'sphere' ? `4\\pi(${texNum(r)})^2` : c.geom === 'cyl' ? `2\\pi(${texNum(r)})(${Lg})` : (c.mode === 'sym' ? `2(${texNum(Ap)})` : texNum(Ap));
  tex($('f4'),
    `\\begin{gathered}Q_{\\text{enc}} = ${texNum(qenc / nC)}\\,\\text{nC},\\quad \\Phi_E = \\dfrac{Q_{\\text{enc}}}{\\varepsilon_0} = ${texNum(flux)}\\,\\text{N}\\cdot\\text{m}^2/\\text{C}` +
    ` \\\\ E = \\dfrac{\\Phi_E}{${areaTex}} = ${texNum(E)}\\ \\text{N/C}\\end{gathered}`, true);

  // graphs
  const vlines = c.vlines(p);
  const shades = c.conductors(p).map(([a, b]) => ({ x0: a, x1: b, label: 'metal' }));
  const clipX = c.singular ? c.rmax * 0.12 : undefined;
  const xl = c.geom === 'plane' ? 'x' : 'r';
  const res = drawPlot($('graphE'), {
    xRange: [curve.x0, curve.x1], curves: [{ xs: curve.pE.xs, ys: curve.pE.ys, color: '#ffd166' }],
    xLabel: xl, xUnit: 'm', yLabel: c.geom === 'plane' ? 'Eₓ' : 'E', yUnit: 'N/C', vlines, shades, clipX,
    marker: { x: r, y: E, text: fmtSI(E, 'N/C') }
  });
  state.Eref = res ? Math.max(Math.abs(res.ymin), Math.abs(res.ymax)) / 1.12 : 1;
  drawPlot($('graphV'), {
    xRange: [curve.x0, curve.x1], curves: [{ xs: curve.xs, ys: curve.Vs, color: '#c39bff' }],
    xLabel: xl, xUnit: 'm', yLabel: 'V', yUnit: 'V', vlines, shades, clipX,
    marker: { x: r, y: V, text: fmtSI(V, 'V'), color: '#c39bff' }
  });
  $('vRefNote').textContent = 'Reference: ' + (c.geom === 'sphere' ? 'V(∞) = 0' : c.vrefText) + '. Slope of V = −E.';
  update3DSurface(E);
}

/* =====================================================================
   3D scene
   ===================================================================== */
const stage = $('stage');
const canvas = $('cv3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x06080c, 1);
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x06080c, 14, 30);
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 25;

scene.add(new THREE.AmbientLight(0xbfcaff, 0.55));
const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(5, 8, 6); scene.add(dl);
const dl2 = new THREE.DirectionalLight(0x8fa8ff, 0.45); dl2.position.set(-6, -3, -5); scene.add(dl2);

const floor = new THREE.PolarGridHelper(5, 16, 8, 96, 0x2a3560, 0x1c2547);
floor.material.transparent = true; floor.material.opacity = 0.55;
scene.add(floor);

const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.004); // keeps z ≤ 0.004 so objects lying in z = 0 stay whole
const clips = () => (state.cut ? [clipPlane] : []);
const clippable = []; // materials that should respect the cutaway
function cm(mat) { clippable.push(mat); mat.clippingPlanes = clips(); return mat; }
function applyClips() { for (const m of clippable) { m.clippingPlanes = clips(); m.needsUpdate = true; } cutFaces.visible = state.cut; }

// round sprite for charge points
function dotTexture() {
  const s = 64, cvs = document.createElement('canvas'); cvs.width = cvs.height = s;
  const g = cvs.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cvs); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const DOT = dotTexture();

let distGroup = new THREE.Group(); scene.add(distGroup);
let cutFaces = new THREE.Group(); scene.add(cutFaces);
let gaussGroup = new THREE.Group(); scene.add(gaussGroup);
let points = null; // { obj, pos: Float32Array, sign: Int8Array }
const arrowGroup = new THREE.Group(); scene.add(arrowGroup);
const arrowsE = [], arrowsA = [];
for (let i = 0; i < 40; i++) {
  const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xffd166, 0.14, 0.09);
  cm(a.line.material); cm(a.cone.material);
  a.visible = false; arrowGroup.add(a); arrowsE.push(a);
  const b = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.35, 0x57e389, 0.1, 0.06);
  cm(b.line.material); cm(b.cone.material);
  b.visible = false; arrowGroup.add(b); arrowsA.push(b);
}

// mulberry32 — stable pseudo-random positions so points don't flicker while sliding
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function randDir(rand) {
  const u = rand() * 2 - 1, th = rand() * 2 * PI, s = Math.sqrt(1 - u * u);
  return [s * Math.cos(th), u, s * Math.sin(th)];
}
function fibSphere(n, R) {
  const out = [];
  const ga = PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), th = ga * i;
    out.push([R * rr * Math.cos(th), R * y, R * rr * Math.sin(th)]);
  }
  return out;
}
const countFor = (mag, per, max) => Math.min(max, Math.round(Math.abs(mag) * per));

// material helpers
const insulatorMat = sign => cm(new THREE.MeshStandardMaterial({ color: sign >= 0 ? 0xff7a7a : 0x6fb4ff, transparent: true, opacity: 0.14, roughness: 0.7, depthWrite: false, side: THREE.DoubleSide }));
const metalMat = () => cm(new THREE.MeshStandardMaterial({ color: 0xa9b3c9, metalness: 0.7, roughness: 0.32, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }));
const cutMat = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false });

function rimLines(R, color = 0xffffff, op = 0.18) {
  // faint latitude/longitude rims that make translucent volumes readable
  const g = new THREE.Group(), m = cm(new THREE.LineBasicMaterial({ color, transparent: true, opacity: op }));
  g.add(lineLoop(circlePts(128, t => [R * Math.cos(t), 0, R * Math.sin(t)]), m));
  for (let i = 0; i < 3; i++) { const th = PI * i / 3; g.add(lineLoop(circlePts(128, t => [R * Math.cos(t) * Math.cos(th), R * Math.sin(t), R * Math.cos(t) * Math.sin(th)]), m)); }
  return g;
}

function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const i = clippable.indexOf(o.material); if (i >= 0) clippable.splice(i, 1);
      o.material.dispose();
    }
  });
  g.clear();
}

function rebuildDistribution() {
  disposeGroup(distGroup); disposeGroup(cutFaces);
  const c = caseObj(), p = state.p;
  const rand = rng(1234);
  const pts = []; // [x,y,z,sign]
  const add = (x, y, z, s) => pts.push(x, y, z, s);
  const mesh = (geo, mat, grp = distGroup) => { const m = new THREE.Mesh(geo, mat); grp.add(m); return m; };
  const sgn = v => (v >= 0 ? 1 : -1);

  switch (state.key) {
    case 'point': {
      const s = sgn(p.Q);
      const m = mesh(new THREE.SphereGeometry(0.12, 32, 16), new THREE.MeshStandardMaterial({ color: s > 0 ? 0xff5d5d : 0x4da3ff, emissive: s > 0 ? 0x801818 : 0x103a80, roughness: 0.4 }));
      if (p.Q === 0) m.material.color.set(0x888888);
      add(0, 0, 0, s);
      break;
    }
    case 'solidSphere': case 'nonuniform': {
      mesh(new THREE.SphereGeometry(p.R, 64, 40), insulatorMat(p.Q));
      distGroup.add(rimLines(p.R, p.Q >= 0 ? 0xff9a9a : 0x9ccaff, 0.3));
      mesh(new THREE.CircleGeometry(p.R, 64), cutMat(p.Q >= 0 ? 0xff7a7a : 0x6fb4ff, 0.1), cutFaces);
      const n = countFor(p.Q, 45, 900), pw = state.key === 'nonuniform' ? 1 / 4 : 1 / 3;
      for (let i = 0; i < n; i++) { const r = p.R * Math.pow(rand(), pw); const d = randDir(rand); add(d[0] * r, d[1] * r, d[2] * r, sgn(p.Q)); }
      break;
    }
    case 'shell': {
      mesh(new THREE.SphereGeometry(p.R, 64, 40), insulatorMat(p.Q));
      distGroup.add(rimLines(p.R, p.Q >= 0 ? 0xff9a9a : 0x9ccaff, 0.3));
      for (const q of fibSphere(countFor(p.Q, 40, 800), p.R)) add(q[0], q[1], q[2], sgn(p.Q));
      break;
    }
    case 'conductorSphere': {
      mesh(new THREE.SphereGeometry(p.R * 0.995, 64, 40), metalMat());
      mesh(new THREE.CircleGeometry(p.R * 0.995, 64), cutMat(0xa9b3c9, 0.28), cutFaces);
      for (const q of fibSphere(countFor(p.Q, 40, 800), p.R * 1.01)) add(q[0], q[1], q[2], sgn(p.Q));
      break;
    }
    case 'shellCavity': {
      const s = sgn(p.q);
      mesh(new THREE.SphereGeometry(0.1, 32, 16), new THREE.MeshStandardMaterial({ color: s > 0 ? 0xff5d5d : 0x4da3ff, emissive: s > 0 ? 0x801818 : 0x103a80 }));
      if (p.q !== 0) add(0, 0, 0, s);
      mesh(new THREE.SphereGeometry(p.a, 64, 40), metalMat());
      mesh(new THREE.SphereGeometry(p.b, 64, 40), metalMat());
      mesh(new THREE.RingGeometry(p.a, p.b, 96), cutMat(0xa9b3c9, 0.3), cutFaces);
      for (const q of fibSphere(countFor(p.q, 40, 500), p.a * 0.985)) add(q[0], q[1], q[2], -sgn(p.q));
      for (const q of fibSphere(countFor(p.q + p.Qs, 40, 900), p.b * 1.012)) add(q[0], q[1], q[2], sgn(p.q + p.Qs));
      break;
    }
    case 'line': {
      const s = sgn(p.lam);
      mesh(new THREE.CylinderGeometry(0.025, 0.025, LR, 16), cm(new THREE.MeshStandardMaterial({ color: s > 0 ? 0xff7a7a : 0x6fb4ff, emissive: s > 0 ? 0x601010 : 0x0e3060 })));
      const n = countFor(p.lam, 24, 300);
      for (let i = 0; i < n; i++) add(0, -LR / 2 + LR * (i + 0.5) / n, 0, s);
      break;
    }
    case 'solidCyl': {
      mesh(new THREE.CylinderGeometry(p.R, p.R, LR, 64, 1, true), insulatorMat(p.lam));
      mesh(new THREE.PlaneGeometry(2 * p.R, LR), cutMat(p.lam >= 0 ? 0xff7a7a : 0x6fb4ff, 0.08), cutFaces);
      const n = countFor(p.lam, 110, 1100);
      for (let i = 0; i < n; i++) { const r = p.R * Math.sqrt(rand()), th = rand() * 2 * PI; add(r * Math.cos(th), (rand() - 0.5) * LR, r * Math.sin(th), sgn(p.lam)); }
      break;
    }
    case 'coax': {
      mesh(new THREE.CylinderGeometry(p.a, p.a, LR, 64, 1, false), metalMat());
      mesh(new THREE.CylinderGeometry(p.b, p.b, LR, 64, 1, true), metalMat());
      mesh(new THREE.PlaneGeometry(2 * p.a, LR), cutMat(0xa9b3c9, 0.3), cutFaces);
      for (const sx of [-1, 1]) { const m = mesh(new THREE.PlaneGeometry(0.04, LR), cutMat(0xa9b3c9, 0.45), cutFaces); m.position.x = sx * p.b; }
      const ringPts = (R, count, s) => {
        const rings = Math.max(1, Math.round(count / 24)), per = Math.max(1, Math.round(count / rings));
        for (let i = 0; i < rings; i++) for (let j = 0; j < per; j++) {
          const th = 2 * PI * (j + (i % 2) * 0.5) / per;
          add(R * Math.cos(th), -LR / 2 + LR * (i + 0.5) / rings, R * Math.sin(th), s);
        }
      };
      ringPts(p.a * 1.02, countFor(p.lam, 70, 700), sgn(p.lam));
      ringPts(p.b * 0.985, countFor(p.lam, 70, 700), -sgn(p.lam));
      break;
    }
    case 'sheet': case 'slab': case 'conductorPlate': case 'capacitor': {
      const lattice = (x, count, s) => {
        const m = Math.max(2, Math.round(Math.sqrt(count)));
        for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
          add(x, -S / 2 + S * (i + 0.5 + (rand() - 0.5) * 0.4) / m, -S / 2 + S * (j + 0.5 + (rand() - 0.5) * 0.4) / m, s);
        }
      };
      if (state.key === 'sheet') {
        mesh(new THREE.BoxGeometry(0.03, S, S), insulatorMat(p.sig));
        lattice(0, countFor(p.sig, 90, 900), sgn(p.sig));
      } else if (state.key === 'slab') {
        mesh(new THREE.BoxGeometry(2 * p.d, S, S), insulatorMat(p.rho));
        mesh(new THREE.PlaneGeometry(2 * p.d, S), cutMat(p.rho >= 0 ? 0xff7a7a : 0x6fb4ff, 0.08), cutFaces);
        const n = countFor(p.rho * 2 * p.d, 60, 1400);
        for (let i = 0; i < n; i++) add((rand() * 2 - 1) * p.d, (rand() - 0.5) * S, (rand() - 0.5) * S, sgn(p.rho));
      } else if (state.key === 'conductorPlate') {
        mesh(new THREE.BoxGeometry(2 * p.t, S, S), metalMat());
        mesh(new THREE.PlaneGeometry(2 * p.t, S), cutMat(0xa9b3c9, 0.3), cutFaces);
        lattice(p.t + 0.015, countFor(p.sig, 60, 700), sgn(p.sig));
        lattice(-p.t - 0.015, countFor(p.sig, 60, 700), sgn(p.sig));
      } else {
        for (const sx of [-1, 1]) {
          const m = mesh(new THREE.BoxGeometry(CAP_T, S, S), metalMat()); m.position.x = sx * (p.s / 2 + CAP_T / 2);
          const f = mesh(new THREE.PlaneGeometry(CAP_T, S), cutMat(0xa9b3c9, 0.3), cutFaces); f.position.x = sx * (p.s / 2 + CAP_T / 2);
        }
        lattice(-p.s / 2 + 0.015, countFor(p.sig, 60, 700), 1);
        lattice(p.s / 2 - 0.015, countFor(p.sig, 60, 700), -1);
      }
      break;
    }
  }

  // charge point cloud
  const n = pts.length / 4;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sign = new Int8Array(n);
  for (let i = 0; i < n; i++) { pos[3 * i] = pts[4 * i]; pos[3 * i + 1] = pts[4 * i + 1]; pos[3 * i + 2] = pts[4 * i + 2]; sign[i] = pts[4 * i + 3]; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const big = state.key === 'point' || (state.key === 'shellCavity');
  const mat = cm(new THREE.PointsMaterial({ size: big ? 0.09 : 0.08, map: DOT, vertexColors: true, transparent: true, depthWrite: false, alphaTest: 0.02, sizeAttenuation: true }));
  const obj = new THREE.Points(geo, mat);
  distGroup.add(obj);
  points = { obj, pos, sign, col };
  cutFaces.visible = state.cut;
}

function insideTest() {
  const c = caseObj(), r = state.r;
  if (c.geom === 'sphere') return (x, y, z) => x * x + y * y + z * z < r * r;
  if (c.geom === 'cyl') return (x, y, z) => x * x + z * z < r * r && Math.abs(y) <= Lg / 2;
  if (c.mode === 'sym') return (x, y, z) => Math.abs(x) < r && y * y + z * z < Rp * Rp;
  const a = c.anchor(state.p), lo = Math.min(a, r), hi = Math.max(a, r);
  return (x, y, z) => x > lo && x < hi && y * y + z * z < Rp * Rp;
}
function recolorPoints() {
  if (!points) return;
  const inside = insideTest();
  const { pos, sign, col } = points;
  for (let i = 0; i < sign.length; i++) {
    const inn = inside(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
    const base = sign[i] > 0 ? [1.0, 0.36, 0.36] : [0.3, 0.64, 1.0];
    const f = inn ? 1.3 : 0.42;
    col[3 * i] = Math.min(1, base[0] * f); col[3 * i + 1] = Math.min(1, base[1] * f); col[3 * i + 2] = Math.min(1, base[2] * f);
  }
  points.obj.geometry.attributes.color.needsUpdate = true;
}

/* ---------- Gaussian surface meshes ---------- */
const goldMat = () => cm(new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x4a3300, transparent: true, opacity: 0.17, roughness: 0.5, side: THREE.DoubleSide, depthWrite: false }));
const steelMat = () => cm(new THREE.MeshStandardMaterial({ color: 0x8ea0d0, emissive: 0x111a33, transparent: true, opacity: 0.13, roughness: 0.6, side: THREE.DoubleSide, depthWrite: false }));
const wireMat = (color = 0xffd166, op = 0.55) => cm(new THREE.LineBasicMaterial({ color, transparent: true, opacity: op }));
function circlePts(n, f) { const a = []; for (let i = 0; i <= n; i++) a.push(f(2 * PI * i / n)); return a; }
function lineLoop(ptsArr, mat) { return new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsArr.map(v => new THREE.Vector3(...v))), mat); }

let gParts = {};
function build3D() {
  disposeGroup(gaussGroup);
  gParts = {};
  const c = caseObj();
  if (c.geom === 'sphere') {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), goldMat()));
    const wm = wireMat();
    for (let i = 1; i < 8; i++) {
      const phi = -PI / 2 + PI * i / 8, y = Math.sin(phi), rr = Math.cos(phi);
      g.add(lineLoop(circlePts(96, t => [rr * Math.cos(t), y, rr * Math.sin(t)]), wm));
    }
    for (let i = 0; i < 12; i++) {
      const th = PI * i / 12;
      g.add(lineLoop(circlePts(96, t => [Math.cos(t) * Math.cos(th), Math.sin(t), Math.cos(t) * Math.sin(th)]), wm));
    }
    gaussGroup.add(g); gParts.body = g;
  } else if (c.geom === 'cyl') {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 72, 1, true), goldMat()));
    const sm = steelMat();
    for (const sy of [-0.5, 0.5]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(1, 72), sm);
      cap.rotation.x = -PI / 2; cap.position.y = sy; g.add(cap);
    }
    const wm = wireMat();
    for (const y of [-0.5, -0.25, 0, 0.25, 0.5]) g.add(lineLoop(circlePts(96, t => [Math.cos(t), y, Math.sin(t)]), wm));
    for (let i = 0; i < 12; i++) { const th = 2 * PI * i / 12; g.add(lineLoop([[Math.cos(th), -0.5, Math.sin(th)], [Math.cos(th), 0.5, Math.sin(th)]], wm)); }
    gaussGroup.add(g); gParts.body = g;
  } else {
    // pillbox with axis along x; unit length centred at origin, radius Rp
    const g = new THREE.Group();
    const side = new THREE.Mesh(new THREE.CylinderGeometry(Rp, Rp, 1, 72, 1, true).rotateZ(-PI / 2), steelMat());
    g.add(side);
    gaussGroup.add(g); gParts.body = g;
    const capGeo = new THREE.CircleGeometry(Rp, 72).rotateY(PI / 2);
    const wm = wireMat();
    const mkCap = () => {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(capGeo, goldMat()));
      grp.add(lineLoop(circlePts(96, t => [0, Rp * Math.cos(t), Rp * Math.sin(t)]), wm));
      gaussGroup.add(grp);
      return grp;
    };
    gParts.capA = mkCap(); gParts.capB = mkCap();
    const sw = wireMat(0x8ea0d0, 0.5);
    gParts.sideLines = [];
    for (let i = 0; i < 10; i++) {
      const th = 2 * PI * i / 10;
      const l = lineLoop([[-0.5, Rp * Math.cos(th), Rp * Math.sin(th)], [0.5, Rp * Math.cos(th), Rp * Math.sin(th)]], sw);
      g.add(l);
    }
  }
}

const tmpV = new THREE.Vector3(), tmpO = new THREE.Vector3();
function setArrow(a, ox, oy, oz, dx, dy, dz, len) {
  tmpO.set(ox, oy, oz); tmpV.set(dx, dy, dz).normalize();
  a.position.copy(tmpO); a.setDirection(tmpV);
  a.setLength(len, Math.min(0.16, len * 0.45), Math.min(0.1, len * 0.28));
  a.visible = true;
}

function update3DSurface(Esurf) {
  const c = caseObj(), p = state.p, r = state.r;
  arrowsE.forEach(a => (a.visible = false));
  arrowsA.forEach(a => (a.visible = false));
  const Eref = state.Eref || 1;
  const pw = c.singular ? 0.5 : 1; // compress the huge range near point/line charges
  const lenFor = E => (E === 0 || !isFinite(E) ? (isFinite(E) ? 0 : 0.6) : 0.12 + 0.55 * Math.pow(Math.min(1, Math.abs(E) / Eref), pw));
  let ia = 0, ib = 0;
  const putE = (x, y, z, nx, ny, nz, E) => {
    if (!state.arrows || E === 0 || ia >= arrowsE.length) return;
    const L = lenFor(E);
    if (E > 0) setArrow(arrowsE[ia++], x, y, z, nx, ny, nz, L);
    else setArrow(arrowsE[ia++], x + nx * L, y + ny * L, z + nz * L, -nx, -ny, -nz, L);
  };
  const putA = (x, y, z, nx, ny, nz) => { if (state.dA && ib < arrowsA.length) setArrow(arrowsA[ib++], x, y, z, nx, ny, nz, 0.35); };

  if (c.geom === 'sphere') {
    gParts.body.scale.setScalar(r);
    for (const d of fibSphere(26, 1)) { putE(d[0] * r, d[1] * r, d[2] * r, d[0], d[1], d[2], Esurf); putA(d[0] * r, d[1] * r, d[2] * r, d[0], d[1], d[2]); }
    positionLabel(new THREE.Vector3(0, r, 0), 'r = ' + fmtNum(r, 3) + ' m');
  } else if (c.geom === 'cyl') {
    gParts.body.scale.set(r, Lg, r);
    for (const y of [-Lg / 3, 0, Lg / 3]) for (let i = 0; i < 8; i++) {
      const th = 2 * PI * (i + (y === 0 ? 0.5 : 0)) / 8, nx = Math.cos(th), nz = Math.sin(th);
      putE(nx * r, y, nz * r, nx, 0, nz, Esurf);
      if (y === 0) putA(nx * r, y, nz * r, nx, 0, nz);
    }
    putA(0, Lg / 2, 0, 0, 1, 0); putA(0, -Lg / 2, 0, 0, -1, 0);
    putA(r * 0.6, Lg / 2, 0, 0, 1, 0); putA(-r * 0.6, -Lg / 2, 0, 0, -1, 0);
    positionLabel(new THREE.Vector3(r, Lg / 2, 0), 'r = ' + fmtNum(r, 3) + ' m, L = 2 m');
  } else {
    let xa, xb;
    if (c.mode === 'sym') { xa = -r; xb = r; } else { xa = c.anchor(p); xb = r; }
    const len = Math.max(Math.abs(xb - xa), 1e-3);
    gParts.body.scale.set(len, 1, 1);
    gParts.body.position.x = (xa + xb) / 2;
    gParts.capA.position.x = xa; gParts.capB.position.x = xb;
    const capPts = [[0, 0], [0.32, 0], [-0.32, 0], [0, 0.32], [0, -0.32]];
    const nB = xb >= xa ? 1 : -1;
    const Ex_b = Efield(xb, c, p), Ex_a = Efield(xa, c, p);
    for (const [yy, zz] of capPts) {
      if (Ex_b !== 0) putE(xb, yy, zz, Math.sign(Ex_b), 0, 0, Math.abs(Ex_b));
      if (c.mode === 'sym' && Ex_a !== 0) putE(xa, yy, zz, Math.sign(Ex_a), 0, 0, Math.abs(Ex_a));
    }
    putA(xb, 0, 0, nB, 0, 0); putA(xa, 0, 0, -nB, 0, 0);
    for (let i = 0; i < 6; i++) { const th = 2 * PI * i / 6; putA((xa + xb) / 2, Rp * Math.cos(th), Rp * Math.sin(th), 0, Math.cos(th), Math.sin(th)); }
    positionLabel(new THREE.Vector3(xb, Rp + 0.15, 0), 'x = ' + fmtNum(xb, 3) + ' m');
  }
  recolorPoints();
}

const gLabel = $('gLabel');
let labelAnchor = new THREE.Vector3(), labelText = '';
function positionLabel(v, t) { labelAnchor.copy(v); labelText = t; gLabel.textContent = t; }
function updateLabel() {
  const v = labelAnchor.clone().project(camera);
  const w = stage.clientWidth, h = stage.clientHeight;
  const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
  const vis = v.z < 1 && x > 0 && x < w && y > 0 && y < h;
  gLabel.style.display = vis ? '' : 'none';
  gLabel.style.left = x + 'px'; gLabel.style.top = (y - 14) + 'px';
}

function resetCamera() {
  const c = caseObj();
  if (c.geom === 'sphere') camera.position.set(2.9, 2.1, 4.6);
  else if (c.geom === 'cyl') camera.position.set(5.8, 2.8, 7.2);
  else camera.position.set(3.4, 2.6, 6.4);
  floor.position.y = c.geom === 'sphere' ? -2.2 : c.geom === 'cyl' ? -3.2 : -2.7;
  controls.target.set(0, 0, 0);
  controls.update();
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  // graphs depend on panel width
  if (curve) onSurfaceChanged();
}
new ResizeObserver(resize).observe(stage);
new ResizeObserver(() => { if (curve) onSurfaceChanged(); }).observe($('graphE'));

/* ---------- controls ---------- */
$('caseSel').addEventListener('change', e => setupCase(e.target.value));
$('optCut').addEventListener('change', e => { state.cut = e.target.checked; applyClips(); });
$('optArrows').addEventListener('change', e => { state.arrows = e.target.checked; onSurfaceChanged(); });
$('optDA').addEventListener('change', e => { state.dA = e.target.checked; onSurfaceChanged(); });
$('optRotate').addEventListener('change', e => { controls.autoRotate = e.target.checked; });
controls.autoRotateSpeed = 1.2;
$('resetCam').addEventListener('click', resetCamera);
$('sweepBtn').addEventListener('click', () => {
  state.sweeping = !state.sweeping;
  $('sweepBtn').textContent = state.sweeping ? '❚❚ Pause' : '▶ Sweep';
  $('sweepBtn').classList.toggle('on', state.sweeping);
});

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state.sweeping) {
    const el = rSlider.el, lo = parseFloat(el.min), hi = parseFloat(el.max);
    let r = state.r + state.sweepDir * (hi - lo) / 7 * dt;
    if (r >= hi) { r = hi; state.sweepDir = -1; }
    if (r <= lo) { r = lo; state.sweepDir = 1; }
    state.r = r; rSlider.set(r); onSurfaceChanged();
  }
  controls.update();
  renderer.render(scene, camera);
  updateLabel();
  requestAnimationFrame(loop);
}

// deep link: gauss.html#coax
const hash = location.hash.replace('#', '');
if (CASES[hash]) $('caseSel').value = hash;
setupCase($('caseSel').value);
resize();
if (document.fonts) document.fonts.ready.then(() => onSurfaceChanged());
requestAnimationFrame(loop);

window.__gauss = { CASES, Efield, state, get curve() { return curve; } };
