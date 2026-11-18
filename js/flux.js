/* 3D Flux Explorer — numerical surface integral of E·dA around point charges */
import * as THREE from '../vendor/three.module.min.js';
import { OrbitControls } from '../vendor/OrbitControls.js';

const { K, EPS0, fmtSI, fmtNum, bindSlider, clamp } = window.EL;
EL.buildNav('flux');
EL.renderAllTex();

const nC = 1e-9, PI = Math.PI;
const $ = id => document.getElementById(id);
const LINES_PER_NC = 4;

/* ---------------- State ---------------- */
let nextId = 1;
const state = {
  shape: 'potato', size: 1.5, c: [0, 0, 0],
  charges: [], selected: null,
  heat: true, wire: false, lines: true, cross: true
};

/* ---------------- Surface definitions ----------------
   Each shape = list of sheets P(u,v), u,v ∈ [0,1], plus an inside() test.
   Orientation is fixed per sheet so that dA points away from the centre. */
function potatoR(th, ph) {
  return 1 + 0.2 * Math.sin(2 * th) * Math.cos(3 * ph) + 0.12 * Math.cos(3 * th) + 0.08 * Math.sin(th) * Math.sin(2 * ph);
}
function shapeDef(shape, s, C) {
  const [cx, cy, cz] = C;
  const sph = (fr) => ({
    P: (u, v, o) => {
      const th = PI * u, ph = 2 * PI * v;
      const st = Math.sin(th), ct = Math.cos(th), sp = Math.sin(ph), cp = Math.cos(ph);
      const r = fr(th, ph);
      o[0] = cx + r[0] * st * cp; o[1] = cy + r[1] * ct; o[2] = cz + r[2] * st * sp;
    },
    nu: 140, nv: 280, du: 48, dv: 96
  });
  switch (shape) {
    case 'sphere': return { sheets: [sph(() => [s, s, s])], inside: (x, y, z) => (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 < s * s };
    case 'ellipsoid': {
      const a = 1.35 * s, b = 0.75 * s, c = 1.0 * s;
      return { sheets: [sph(() => [a, b, c])], inside: (x, y, z) => ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 + ((z - cz) / c) ** 2 < 1 };
    }
    case 'potato': {
      return {
        sheets: [sph((th, ph) => { const r = s * potatoR(th, ph); return [r, r, r]; })],
        inside: (x, y, z) => {
          const dx = x - cx, dy = y - cy, dz = z - cz, d = Math.hypot(dx, dy, dz);
          if (d < 1e-9) return true;
          const th = Math.acos(clamp(dy / d, -1, 1)); let ph = Math.atan2(dz, dx); if (ph < 0) ph += 2 * PI;
          return d < s * potatoR(th, ph);
        }
      };
    }
    case 'cube': {
      const face = (axis, sign) => ({
        P: (u, v, o) => {
          const a = 2 * u - 1, b = 2 * v - 1;
          const p = axis === 0 ? [sign, a, b] : axis === 1 ? [a, sign, b] : [a, b, sign];
          o[0] = cx + s * p[0]; o[1] = cy + s * p[1]; o[2] = cz + s * p[2];
        },
        nu: 90, nv: 90, du: 16, dv: 16
      });
      const sheets = [];
      for (let ax = 0; ax < 3; ax++) for (const sg of [-1, 1]) sheets.push(face(ax, sg));
      return { sheets, inside: (x, y, z) => Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) < s };
    }
    case 'cylinder': {
      const h = 1.1 * s;
      const side = { P: (u, v, o) => { const ph = 2 * PI * v; o[0] = cx + s * Math.cos(ph); o[1] = cy + h * (2 * u - 1); o[2] = cz + s * Math.sin(ph); }, nu: 100, nv: 240, du: 16, dv: 64 };
      const cap = sg => ({ P: (u, v, o) => { const ph = 2 * PI * v; o[0] = cx + u * s * Math.cos(ph); o[1] = cy + sg * h; o[2] = cz + u * s * Math.sin(ph); }, nu: 60, nv: 240, du: 10, dv: 64 });
      return { sheets: [side, cap(1), cap(-1)], inside: (x, y, z) => (x - cx) ** 2 + (z - cz) ** 2 < s * s && Math.abs(y - cy) < h };
    }
  }
}

/* ---------------- Integration patches ---------------- */
let surf = null; // {def, patches: Float64Array [px,py,pz,ax,ay,az,h, sheet,u,v,du,dv]}
const STRIDE = 12;
const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0], _d = [0, 0, 0], _m = [0, 0, 0];
function patchVector(sheet, u, v, du, dv, out) {
  // dA ≈ (P(u+du/2) − P(u−du/2)) × (P(v+dv/2) − P(v−dv/2)), centre P(u,v)
  sheet.P(u + du / 2, v, _a); sheet.P(u - du / 2, v, _b);
  sheet.P(u, v + dv / 2, _c); sheet.P(u, v - dv / 2, _d);
  sheet.P(u, v, _m);
  const ex = _a[0] - _b[0], ey = _a[1] - _b[1], ez = _a[2] - _b[2];
  const fx = _c[0] - _d[0], fy = _c[1] - _d[1], fz = _c[2] - _d[2];
  out[0] = _m[0]; out[1] = _m[1]; out[2] = _m[2];
  out[3] = ey * fz - ez * fy; out[4] = ez * fx - ex * fz; out[5] = ex * fy - ey * fx;
}
function buildSurface() {
  const def = shapeDef(state.shape, state.size, state.c);
  // orientation sign per sheet (dA must point away from the centre)
  const o = [0, 0, 0, 0, 0, 0];
  def.sheets.forEach(sh => {
    patchVector(sh, 0.5, 0.37, 1e-3, 1e-3, o);
    const dot = (o[0] - state.c[0]) * o[3] + (o[1] - state.c[1]) * o[4] + (o[2] - state.c[2]) * o[5];
    sh.sign = dot >= 0 ? 1 : -1;
  });
  let n = 0;
  def.sheets.forEach(sh => (n += sh.nu * sh.nv));
  const patches = new Float64Array(n * STRIDE);
  let k = 0;
  def.sheets.forEach((sh, si) => {
    const du = 1 / sh.nu, dv = 1 / sh.nv;
    for (let i = 0; i < sh.nu; i++) for (let j = 0; j < sh.nv; j++) {
      const u = (i + 0.5) * du, v = (j + 0.5) * dv;
      patchVector(sh, u, v, du, dv, o);
      const b = k * STRIDE;
      patches[b] = o[0]; patches[b + 1] = o[1]; patches[b + 2] = o[2];
      patches[b + 3] = sh.sign * o[3]; patches[b + 4] = sh.sign * o[4]; patches[b + 5] = sh.sign * o[5];
      patches[b + 6] = Math.sqrt(Math.hypot(o[3], o[4], o[5])) * 1.3 + 1e-9;
      patches[b + 7] = si; patches[b + 8] = u; patches[b + 9] = v; patches[b + 10] = du; patches[b + 11] = dv;
      k++;
    }
  });
  surf = { def, patches, n };
}

/** flux of one point charge (nC) through the surface, N·m²/C, with local refinement */
function fluxOf(ch) {
  const P = surf.patches, kq = K * ch.q * nC;
  const qx = ch.x, qy = ch.y, qz = ch.z;
  let sum = 0, dmin = Infinity;
  const o = [0, 0, 0, 0, 0, 0];
  for (let k = 0; k < surf.n; k++) {
    const b = k * STRIDE;
    const rx = P[b] - qx, ry = P[b + 1] - qy, rz = P[b + 2] - qz;
    const r2 = rx * rx + ry * ry + rz * rz, r = Math.sqrt(r2);
    const h = P[b + 6];
    if (r < dmin) dmin = r;
    if (r < 4 * h) {
      // refine this patch m×m
      const sh = surf.def.sheets[P[b + 7]];
      const u0 = P[b + 8], v0 = P[b + 9], du = P[b + 10], dv = P[b + 11];
      const m = r < 1.5 * h ? 24 : 10;
      for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
        const u = u0 - du / 2 + (i + 0.5) * du / m, v = v0 - dv / 2 + (j + 0.5) * dv / m;
        patchVector(sh, u, v, du / m, dv / m, o);
        const sx = o[0] - qx, sy = o[1] - qy, sz = o[2] - qz;
        const s2 = sx * sx + sy * sy + sz * sz, s = Math.sqrt(s2);
        if (s < dmin) dmin = s;
        if (s < 1e-7) continue;
        sum += sh.sign * (sx * o[3] + sy * o[4] + sz * o[5]) / (s2 * s);
      }
    } else {
      sum += (rx * P[b + 3] + ry * P[b + 4] + rz * P[b + 5]) / (r2 * r);
    }
  }
  return { flux: kq * sum, dmin };
}

/* ---------------- Physics helpers ---------------- */
function fieldAt(x, y, z, out) {
  let ex = 0, ey = 0, ez = 0;
  for (const c of state.charges) {
    const dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const r2 = Math.max(dx * dx + dy * dy + dz * dz, 1e-10), r = Math.sqrt(r2);
    const f = K * c.q * nC / (r2 * r);
    ex += f * dx; ey += f * dy; ez += f * dz;
  }
  out[0] = ex; out[1] = ey; out[2] = ez;
}

/* ---------------- Three.js scene ---------------- */
const stage = $('stage'), canvas = $('cv3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x06080c, 1);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x06080c, 16, 34);
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 2.5; controls.maxDistance = 30;
scene.add(new THREE.AmbientLight(0xbfcaff, 0.6));
const dl = new THREE.DirectionalLight(0xffffff, 1.0); dl.position.set(5, 8, 6); scene.add(dl);
const dl2 = new THREE.DirectionalLight(0x8fa8ff, 0.4); dl2.position.set(-6, -3, -5); scene.add(dl2);
const floor = new THREE.PolarGridHelper(6, 16, 8, 96, 0x2a3560, 0x1c2547);
floor.position.y = -3.4; floor.material.transparent = true; floor.material.opacity = 0.5; scene.add(floor);
const axes = new THREE.AxesHelper(0.8); axes.position.set(-4.6, -3.4, -4.6); scene.add(axes);

function resetCamera() { camera.position.set(5.5, 3.6, 7.5); controls.target.set(0, 0, 0); controls.update(); }

// surface display
let surfMesh = null, surfWire = null, dispSheets = [];
const surfMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, roughness: 0.55, metalness: 0.0 });
const plainColor = new THREE.Color(0xffd166);
function buildDisplayMesh() {
  if (surfMesh) { scene.remove(surfMesh); surfMesh.geometry.dispose(); }
  if (surfWire) { scene.remove(surfWire); surfWire.geometry.dispose(); surfWire.material.dispose(); }
  const pos = [], nrm = [], idx = [];
  dispSheets = [];
  const o = [0, 0, 0, 0, 0, 0];
  let base = 0;
  for (const sh of surf.def.sheets) {
    const nu = sh.du, nv = sh.dv;
    const start = base;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const u = clamp(i / nu, 1e-4, 1 - 1e-4), v = j / nv;
      patchVector(sh, u, v, 1e-3, 1e-3, o);
      const L = Math.hypot(o[3], o[4], o[5]) || 1;
      pos.push(o[0], o[1], o[2]);
      nrm.push(sh.sign * o[3] / L, sh.sign * o[4] / L, sh.sign * o[5] / L);
      base++;
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = start + i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    dispSheets.push({ start, count: (nu + 1) * (nv + 1) });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setIndex(idx);
  surfMesh = new THREE.Mesh(g, surfMat);
  surfMesh.renderOrder = 2;
  scene.add(surfMesh);
  surfWire = new THREE.LineSegments(new THREE.WireframeGeometry(g), new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.12 }));
  surfWire.visible = state.wire;
  scene.add(surfWire);
}
function colorSurface() {
  const g = surfMesh.geometry;
  const P = g.attributes.position.array, N = g.attributes.normal.array, C = g.attributes.color.array;
  const n = P.length / 3;
  const vals = new Float32Array(n);
  const e = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    fieldAt(P[3 * i], P[3 * i + 1], P[3 * i + 2], e);
    vals[i] = e[0] * N[3 * i] + e[1] * N[3 * i + 1] + e[2] * N[3 * i + 2];
  }
  const sorted = Array.from(vals, Math.abs).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.9)] || 1;
  const out = new THREE.Color(0xff8a3d), inn = new THREE.Color(0x2f7bff), mid = new THREE.Color(0x1b2850);
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    if (!state.heat || !state.charges.length) { C[3 * i] = plainColor.r; C[3 * i + 1] = plainColor.g; C[3 * i + 2] = plainColor.b; continue; }
    const t = Math.tanh(vals[i] / ref * 1.4);
    tmp.copy(mid).lerp(t >= 0 ? out : inn, Math.pow(Math.abs(t), 0.7));
    C[3 * i] = tmp.r; C[3 * i + 1] = tmp.g; C[3 * i + 2] = tmp.b;
  }
  g.attributes.color.needsUpdate = true;
  surfMat.opacity = state.heat && state.charges.length ? 0.48 : 0.22;
}

// charges
const chargeGroup = new THREE.Group(); scene.add(chargeGroup);
const glowTex = (() => {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const radiusOf = c => 0.1 + 0.03 * Math.sqrt(Math.abs(c.q));
function buildChargeMeshes() {
  chargeGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  chargeGroup.clear();
  for (const c of state.charges) {
    const pos = c.q > 0;
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(radiusOf(c), 32, 16),
      new THREE.MeshStandardMaterial({ color: pos ? 0xff5d5d : 0x4da3ff, emissive: pos ? 0x7a1515 : 0x0f3a7a, roughness: 0.35 }));
    m.userData.charge = c;
    g.add(m);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: pos ? 0xff6b6b : 0x5aaeff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.setScalar(radiusOf(c) * 7);
    g.add(sp);
    if (c === state.selected) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radiusOf(c) * 1.8, 0.012, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
      ring.userData.billboard = true;
      g.add(ring);
    }
    g.position.set(c.x, c.y, c.z);
    c.obj = g; c.mesh = m;
    chargeGroup.add(g);
  }
}
function syncChargePositions() { for (const c of state.charges) if (c.obj) c.obj.position.set(c.x, c.y, c.z); }

// field lines + crossings
let linesObj = null, crossOut = null, crossIn = null;
let crossCount = { out: 0, in: 0 };
function fibDirs(n) {
  const out = [], ga = PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) { const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), t = ga * i; out.push([r * Math.cos(t), y, r * Math.sin(t)]); }
  return out;
}
function traceLine3(src, d, dir, arrivals, segsAll, cOutAll, cInAll) {
  // trace into local buffers; backward lines that end on a + charge duplicate an
  // existing line, so they are discarded (avoids drawing the same line twice)
  const segs = [], cOut = [], cIn = [];
  let endedOnPositive = false;
  const r0 = radiusOf(src) * 1.05;
  let x = src.x + d[0] * r0, y = src.y + d[1] * r0, z = src.z + d[2] * r0;
  const inside = surf.def.inside;
  let wasIn = inside(x, y, z);
  const e = [0, 0, 0];
  const f = (px, py, pz, o) => { fieldAt(px, py, pz, e); const m = Math.hypot(e[0], e[1], e[2]) || 1; o[0] = dir * e[0] / m; o[1] = dir * e[1] / m; o[2] = dir * e[2] / m; };
  const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0];
  for (let step = 0; step < 900; step++) {
    let dmin = Infinity, hit = null;
    for (const c of state.charges) {
      const dd = Math.hypot(x - c.x, y - c.y, z - c.z);
      if (c !== src && dd < radiusOf(c)) { hit = c; break; }
      if (dd < dmin) dmin = dd;
    }
    if (hit) {
      if (hit.q > 0) endedOnPositive = true;
      if (arrivals && Math.sign(hit.q) === -Math.sign(src.q)) {
        const L = Math.hypot(x - hit.x, y - hit.y, z - hit.z) || 1;
        (arrivals.get(hit) || arrivals.set(hit, []).get(hit)).push([(x - hit.x) / L, (y - hit.y) / L, (z - hit.z) / L]);
      }
      break;
    }
    const h = clamp(0.25 * dmin, 0.01, 0.06);
    f(x, y, z, k1);
    f(x + k1[0] * h / 2, y + k1[1] * h / 2, z + k1[2] * h / 2, k2);
    f(x + k2[0] * h / 2, y + k2[1] * h / 2, z + k2[2] * h / 2, k3);
    f(x + k3[0] * h, y + k3[1] * h, z + k3[2] * h, k4);
    const nx = x + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    const ny = y + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    const nz = z + h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    segs.push(x, y, z, nx, ny, nz);
    const nowIn = inside(nx, ny, nz);
    if (nowIn !== wasIn) {
      // a field-line crossing: E direction along the line is dir*(travel direction)
      const goingOut = wasIn && !nowIn;
      const fluxOut = dir > 0 ? goingOut : !goingOut;
      (fluxOut ? cOut : cIn).push((x + nx) / 2, (y + ny) / 2, (z + nz) / 2);
      wasIn = nowIn;
    }
    x = nx; y = ny; z = nz;
    if (Math.abs(x) > 9 || Math.abs(y) > 9 || Math.abs(z) > 9) break;
  }
  if (dir < 0 && endedOnPositive) return;
  for (const v of segs) segsAll.push(v);
  for (const v of cOut) cOutAll.push(v);
  for (const v of cIn) cInAll.push(v);
}
function buildFieldLines() {
  for (const o of [linesObj, crossOut, crossIn]) if (o) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
  linesObj = crossOut = crossIn = null;
  crossCount = { out: 0, in: 0 };
  if (!state.charges.length) return;
  const segs = [], cOut = [], cIn = [];
  const arrivals = new Map();
  const count = c => Math.round(Math.abs(c.q) * LINES_PER_NC);
  for (const c of state.charges) if (c.q > 0) for (const d of fibDirs(count(c))) traceLine3(c, d, 1, arrivals, segs, cOut, cIn);
  for (const c of state.charges) {
    if (c.q >= 0) continue;
    const cand = fibDirs(count(c));
    for (const a of (arrivals.get(c) || [])) {
      // remove the candidate direction closest to each arriving line
      let bi = -1, bd = -2;
      cand.forEach((d, i) => { const dot = d[0] * a[0] + d[1] * a[1] + d[2] * a[2]; if (dot > bd) { bd = dot; bi = i; } });
      if (bi >= 0) cand.splice(bi, 1);
    }
    for (const d of cand) traceLine3(c, d, -1, null, segs, cOut, cIn);
  }
  crossCount = { out: cOut.length / 3, in: cIn.length / 3 };
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
  linesObj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xe6ecff, transparent: true, opacity: 0.55 }));
  linesObj.visible = state.lines; scene.add(linesObj);
  const mk = (arr, col) => {
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const p = new THREE.Points(gg, new THREE.PointsMaterial({ color: col, size: 0.24, map: glowTex, transparent: true, depthWrite: false, depthTest: false }));
    p.visible = state.lines && state.cross; p.renderOrder = 5; scene.add(p); return p;
  };
  crossOut = mk(cOut, 0xffe08a); crossIn = mk(cIn, 0x5fd0ff);
}

/* ---------------- Recompute & UI ---------------- */
function recompute(full) {
  if (full) { buildSurface(); buildDisplayMesh(); }
  let total = 0, qenc = 0, near = null;
  const rows = [];
  for (const c of state.charges) {
    const { flux, dmin } = fluxOf(c);
    const ratio = flux / (c.q * nC / EPS0);
    const inside = ratio > 0.5;
    if (dmin < 0.03) near = c;
    c.flux = flux; c.inside = inside;
    total += flux;
    if (inside) qenc += c.q * nC;
    rows.push(c);
  }
  const pred = qenc / EPS0;
  $('r_flux').textContent = fmtSI(total, 'N·m²/C', 4);
  $('r_qenc').textContent = fmtSI(qenc, 'C');
  $('r_qenc').className = 'big ' + (qenc > 0 ? 'hl-pos' : qenc < 0 ? 'hl-neg' : '');
  $('r_pred').textContent = fmtSI(pred, 'N·m²/C', 4);
  const scale = Math.max(Math.abs(pred), ...state.charges.map(c => Math.abs(c.q * nC / EPS0)), 1e-30);
  const err = Math.abs(total - pred) / scale * 100;
  $('r_err').textContent = state.charges.length ? (err < 0.01 ? '✓ < 0.01 %' : (err < 1 ? '✓ ' : '') + fmtNum(err, 2) + ' % difference') : '—';
  $('r_err').className = err < 1 ? 'hl-ok' : 'hl-warn';
  $('r_warn').textContent = near ? `⚠ A charge is (almost) on the surface — the flux is not well defined there. Move it clearly inside or outside.` : '';
  $('hud').innerHTML = `<span class="k">Φ</span> ${fmtSI(total, 'N·m²/C', 4)} &nbsp; <span class="k">Q<sub>enc</sub>/ε₀</span> ${fmtSI(pred, 'N·m²/C', 4)}`;

  const tb = $('chargeTable').querySelector('tbody');
  tb.innerHTML = '';
  for (const c of rows) {
    const tr = document.createElement('tr');
    if (c === state.selected) tr.className = 'sel';
    const fl = Math.abs(c.flux) < Math.abs(c.q * nC / EPS0) * 1e-4 ? '≈ 0' : fmtNum(c.flux, 4);
    tr.innerHTML = `<td class="${c.q > 0 ? 'hl-pos' : 'hl-neg'}">${c.q > 0 ? '+' : '−'}${fmtNum(Math.abs(c.q), 3)} nC</td>
      <td>(${fmtNum(c.x, 2)}, ${fmtNum(c.y, 2)}, ${fmtNum(c.z, 2)})</td>
      <td class="${c.inside ? 'hl-g' : ''}">${c.inside ? 'inside' : 'outside'}</td><td class="r">${fl}</td>`;
    tr.addEventListener('click', () => select(c));
    tb.appendChild(tr);
  }
  colorSurface();
  buildFieldLines();
  $('r_lines').textContent = state.charges.length ? `${crossCount.out} / ${crossCount.in}` : '—';
  syncSelPanel();
}

const sq = bindSlider('sq', { format: v => (v > 0 ? '+' : '') + fmtNum(v, 3) + ' nC', onInput: v => { const s = state.selected; if (!s) return; if (v === 0) { v = s.q > 0 ? -0.5 : 0.5; sq.set(v); } s.q = v; buildChargeMeshes(); recompute(false); } });
const sxyz = ['x', 'y', 'z'].map(k => bindSlider('s' + k, { format: v => fmtNum(v, 3) + ' m', onInput: v => { const s = state.selected; if (!s) return; s[k] = v; syncChargePositions(); scheduleRecompute(); } }));
function syncSelPanel() {
  const s = state.selected;
  $('selBox').style.display = s ? '' : 'none';
  if (!s) return;
  sq.set(s.q); sxyz[0].set(s.x); sxyz[1].set(s.y); sxyz[2].set(s.z);
}
function select(c) { state.selected = c; buildChargeMeshes(); recompute(false); }

const surfSliders = {
  size: bindSlider('size', { format: v => fmtNum(v, 3) + ' m', onInput: v => { state.size = v; scheduleRecompute(true); } }),
  cx: bindSlider('cx', { format: v => fmtNum(v, 3) + ' m', onInput: v => { state.c[0] = v; scheduleRecompute(true); } }),
  cy: bindSlider('cy', { format: v => fmtNum(v, 3) + ' m', onInput: v => { state.c[1] = v; scheduleRecompute(true); } }),
  cz: bindSlider('cz', { format: v => fmtNum(v, 3) + ' m', onInput: v => { state.c[2] = v; scheduleRecompute(true); } })
};
$('shape').addEventListener('change', e => { state.shape = e.target.value; recompute(true); });
$('optHeat').addEventListener('change', e => { state.heat = e.target.checked; colorSurface(); });
$('optWire').addEventListener('change', e => { state.wire = e.target.checked; if (surfWire) surfWire.visible = state.wire; });
$('optLines').addEventListener('change', e => { state.lines = e.target.checked; if (linesObj) linesObj.visible = state.lines; [crossOut, crossIn].forEach(o => o && (o.visible = state.lines && state.cross)); });
$('optCross').addEventListener('change', e => { state.cross = e.target.checked; [crossOut, crossIn].forEach(o => o && (o.visible = state.lines && state.cross)); });
$('resetCam').addEventListener('click', resetCamera);

function addCharge(x, y, z, q) { const c = { id: nextId++, x, y, z, q }; state.charges.push(c); return c; }
function freeSpot() {
  for (let t = 0; t < 50; t++) {
    const p = [(Math.random() * 2 - 1) * 3, (Math.random() * 2 - 1) * 2, (Math.random() * 2 - 1) * 3].map(v => Math.round(v * 20) / 20);
    if (state.charges.every(c => Math.hypot(c.x - p[0], c.y - p[1], c.z - p[2]) > 0.8)) return p;
  }
  return [0, 0, 0];
}
$('addPos').addEventListener('click', () => { const p = freeSpot(); state.selected = addCharge(...p, 3); buildChargeMeshes(); recompute(false); });
$('addNeg').addEventListener('click', () => { const p = freeSpot(); state.selected = addCharge(...p, -3); buildChargeMeshes(); recompute(false); });
$('delSel').addEventListener('click', () => {
  if (!state.selected) return;
  state.charges = state.charges.filter(c => c !== state.selected); state.selected = null;
  buildChargeMeshes(); recompute(false);
});
function loadPreset(name) {
  state.charges = []; state.selected = null;
  switch (name) {
    case 'inside': addCharge(0.3, 0.2, 0, 5); break;
    case 'outside': addCharge(0, 0, 0, 5); addCharge(2.8, 0.4, 0.5, -4); break;
    case 'dipoleIn': addCharge(-0.5, 0, 0, 4); addCharge(0.5, 0, 0, -4); break;
    case 'straddle': addCharge(-0.6, 0, 0, 4); addCharge(2.2, 0, 0, -4); break;
    case 'three': addCharge(-0.4, 0.3, 0.2, 5); addCharge(0.5, -0.4, -0.3, -2); addCharge(2.9, 1, 0, 3); break;
  }
  buildChargeMeshes(); recompute(false);
}
$('preset').addEventListener('change', e => { if (e.target.value) loadPreset(e.target.value); e.target.value = ''; });

// debounce heavy recomputation while dragging sliders
let pending = null;
function scheduleRecompute(full = false) {
  if (pending) { pending.full = pending.full || full; return; }
  pending = { full };
  requestAnimationFrame(() => { const f = pending.full; pending = null; recompute(f); });
}

/* ---------------- 3D dragging of charges ---------------- */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const dragPlane = new THREE.Plane();
let dragging = null;
const hitPoint = new THREE.Vector3(), offset = new THREE.Vector3();
function setNDC(ev) { const r = canvas.getBoundingClientRect(); ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1); }
canvas.addEventListener('pointerdown', ev => {
  setNDC(ev);
  raycaster.setFromCamera(ndc, camera);
  const meshes = state.charges.map(c => c.mesh).filter(Boolean);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if (!hit) return;
  const c = hit.object.userData.charge;
  dragging = c;
  controls.enabled = false;
  const n = new THREE.Vector3(); camera.getWorldDirection(n);
  const p = new THREE.Vector3(c.x, c.y, c.z);
  dragPlane.setFromNormalAndCoplanarPoint(n, p);
  raycaster.ray.intersectPlane(dragPlane, hitPoint);
  offset.copy(p).sub(hitPoint);
  canvas.setPointerCapture(ev.pointerId);
  if (state.selected !== c) { state.selected = c; buildChargeMeshes(); syncSelPanel(); }
}, true);
canvas.addEventListener('pointermove', ev => {
  setNDC(ev);
  if (!dragging) {
    raycaster.setFromCamera(ndc, camera);
    const over = raycaster.intersectObjects(state.charges.map(c => c.mesh).filter(Boolean), false).length > 0;
    canvas.style.cursor = over ? 'grab' : '';
    return;
  }
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
    const p = hitPoint.add(offset);
    dragging.x = Math.round(clamp(p.x, -4, 4) * 100) / 100;
    dragging.y = Math.round(clamp(p.y, -3.2, 3.2) * 100) / 100;
    dragging.z = Math.round(clamp(p.z, -4, 4) * 100) / 100;
    syncChargePositions();
    scheduleRecompute();
  }
  canvas.style.cursor = 'grabbing';
});
const endDrag = () => { if (dragging) { dragging = null; controls.enabled = true; canvas.style.cursor = ''; } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ---------------- Loop ---------------- */
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
function loop() {
  controls.update();
  chargeGroup.traverse(o => { if (o.userData.billboard) o.quaternion.copy(camera.quaternion); });
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

resize();
resetCamera();
buildSurface(); buildDisplayMesh();
loadPreset('outside');
requestAnimationFrame(loop);

window.__flux = { state, fluxOf, recompute, loadPreset, camera, get surf() { return surf; } };
