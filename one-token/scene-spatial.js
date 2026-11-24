/* Beamline hall assemblies and beat choreography driven by reader progress. */
(() => {
'use strict';

function create(THREE, theme, renderer) {
const { colors, scene } = theme.makeScene(THREE);
let beamCacheBust = false;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (c, t, r, dt) => lerp(c, t, 1 - Math.exp(-r * dt));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const frac = x => x - Math.floor(x);
const HEX = {
  hall: colors.ground, plinth: colors.hardwarePlinth, ink: colors.ink, ink2: colors.silhouette,
  steel: colors.hardwareFrame, steelL: colors.hardwareBody, pale: colors.hardwareDeck,
  graphite: colors.hardwareFrame, token: colors.token, train: colors.fault,
  serve: colors.cache, tool: colors.tool, slab: colors.hardwarePale
};

/* ---------------- world layout ---------------- */
const Y0 = 0.62, X_GATE = 5, X_TOK = 12, X_TRAIN = 27, X_POST = 45, X_REL = 58, X_INTAKE = 72, X_TOWER = 86,
  X_SAMPLE = 95, X_STREAM = 103, X_SCREEN = 111, X_BENCH = 104, Z_BACK = -7;
const NPL = 61, PLATE0 = 0.95, PSTEP = 0.2, TOWER_TOP = PLATE0 + (NPL - 1) * PSTEP, HEAD_Y = TOWER_TOP + 0.22;
const RAIL_Z = [-3.2, -1.6, 0, 1.6, 3.2];
const railPts = z => [[-15, 5.4, z], [-10, 3.7, z * .78], [-6, 1.5, z * .3], [-3, Y0, 0]];

const SEG_DEF = [
  ['feed', 1.2, [...railPts(-1.6), [X_GATE, Y0, 0], [X_TOK - .5, Y0, 0]]],
  ['tokens', .8, [[X_TOK - .5, Y0, 0], [X_TOK + 4, Y0, 0], [X_TRAIN - 3.4, Y0, 0]]],
  ['train-up', 1.0, [[X_TRAIN - 3.4, Y0, 0], [X_TRAIN - 1.4, Y0, 0], [X_TRAIN, 1.3, 0], [X_TRAIN, 7, 0], [X_TRAIN, TOWER_TOP + .4, 0]]],
  ['absorb', .6, null],
  ['ship-post', 1.0, null],
  ['ship-rel', 1.2, null],
  ['request', 1.3, [[X_SCREEN + 1.4, 2.1, -.25], [X_SCREEN + 1.9, Y0, -3], [X_SCREEN - 1, Y0, Z_BACK], [X_INTAKE - 1, Y0, Z_BACK], [X_INTAKE - 4.2, Y0, -3.6], [X_INTAKE - 2.6, Y0, -.3], [X_INTAKE + .5, Y0, 0]]],
  ['serve-up', 1.0, [[X_INTAKE + .5, Y0, 0], [X_TOWER - 1.4, Y0, 0], [X_TOWER, 1.3, 0], [X_TOWER, 7, 0], [X_TOWER, TOWER_TOP + .4, 0]]],
  ['decode', .9, [[X_TOWER, TOWER_TOP + .4, 0], [X_TOWER + .5, HEAD_Y + 1.0, 0], [X_TOWER + 2.7, TOWER_TOP - 1, 0], [X_TOWER + 3.5, 6, 0], [X_TOWER + 4, Y0, 0], [X_SAMPLE, Y0, 0]]],
  ['stream', .8, [[X_SAMPLE, Y0, 0], [X_STREAM, Y0, 0], [X_SCREEN - .8, Y0, 0], [X_SCREEN + .7, 2.0, .2]]],
  ['tool', 1.4, [[X_SCREEN + 1.4, 2.1, -.25], [X_SCREEN + 1.9, Y0, -3], [X_BENCH + 3, Y0, Z_BACK], [X_BENCH + 1.7, Y0, Z_BACK - 2.1], [X_BENCH, 1.62, Z_BACK - 2.6], [X_BENCH - 1.7, Y0, Z_BACK - 2.1], [X_BENCH - 3, Y0, Z_BACK], [X_INTAKE - 1, Y0, Z_BACK], [X_INTAKE - 4.2, Y0, -3.6], [X_INTAKE - 2.6, Y0, -.3], [X_INTAKE + .5, Y0, 0]]],
  ['cached', .6, [[X_INTAKE + .5, Y0, 0], [X_TOWER - 1.6, Y0, 0]]],
  ['answer', 1.3, [[X_TOWER, TOWER_TOP + .4, 0], [X_TOWER + .5, HEAD_Y + 1.0, 0], [X_TOWER + 2.7, TOWER_TOP - 1, 0], [X_TOWER + 3.5, 6, 0], [X_TOWER + 4, Y0, 0], [X_SAMPLE, Y0, 0], [X_STREAM, Y0, 0], [X_SCREEN - .8, Y0, 0], [X_SCREEN + .7, 2.0, .2]]],
];
const SEGS = [], SEG = {};
{
  const tot = SEG_DEF.reduce((a, s) => a + s[1], 0); let acc = 0;
  for (const [k, d, pts] of SEG_DEF) {
    const s = { k, d, j0: acc / tot }; acc += d; s.j1 = acc / tot;
    if (pts) { s.c = new THREE.CatmullRomCurve3(pts.map(p => V3(...p)), false, 'centripetal'); s.len = s.c.getLength(); s.c.arcLengthDivisions = 400; }
    SEGS.push(s); SEG[k] = s;
  }
  for (const k of ['train-up', 'serve-up']) {
    const s = SEG[k]; let uf = 1;
    for (let i = 0; i <= 300; i++) { const u = i / 300; if (s.c.getPointAt(u).y > Y0 + .25) { uf = u; break; } }
    s.floorEnd = uf;
  }
}
const segAtJ = J => { for (const s of SEGS) if (J <= s.j1 + 1e-9) return s; return SEGS[SEGS.length - 1]; };
const jOf = (k, u) => SEG[k].j0 + (SEG[k].j1 - SEG[k].j0) * u;
const uIn = (s, J) => clamp((J - s.j0) / (s.j1 - s.j0));
const uAtY = (k, y) => { const s = SEG[k]; for (let i = 0; i <= 400; i++) { const u = i / 400; if (s.c.getPointAt(u).y >= y) return u; } return 1; };
scene.fog = new THREE.Fog(HEX.hall, 80, 400);
const camera = new THREE.PerspectiveCamera(30, 1, .3, 900);

const lam = c => new THREE.MeshLambertMaterial({ color: c });
const bas = c => new THREE.MeshBasicMaterial({ color: c });
const M = { ink: lam(HEX.ink2), graphite: lam(HEX.graphite), steel: lam(HEX.steel), steelL: lam(HEX.steelL), plinth: lam(HEX.plinth),
  train: lam(HEX.train), serve: lam(HEX.serve), tool: lam(HEX.tool), white: lam(0xffffff), slab: lam(HEX.slab) };
const BOX = new THREE.BoxGeometry(1, 1, 1);
const dummy = new THREE.Object3D();
function box(w, h, d, mat, x, y, z, parent = scene) { const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m; }
function edgesBox(w, h, d, color = HEX.ink, parent = scene) {
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color })); parent.add(l); return l; }
function texCanvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (renderer) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.userData = { c, g, draw }; return t; }
const SHADOW = texCanvas(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(18,20,23,.62)'); r.addColorStop(.55, 'rgba(18,20,23,.22)'); r.addColorStop(1, 'rgba(18,20,23,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
const HALO = texCanvas(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,74,28,.55)'); r.addColorStop(.35, 'rgba(255,74,28,.2)'); r.addColorStop(1, 'rgba(255,74,28,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
function shadow(x, z, sx, sz, op = .55, parent = scene) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: SHADOW, transparent: true, depthWrite: false, opacity: op }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .015, z); m.scale.set(sx, sz, 1); m.renderOrder = 1; parent.add(m); return m; }
function tube(curve, r, mat, seg = 48) { return new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 8, false), mat); }

/* floor */
{ const f = new THREE.Mesh(new THREE.PlaneGeometry(1400, 700), bas(HEX.hall)); f.rotation.x = -Math.PI / 2; f.position.set(50, 0, 0); scene.add(f); }

/* ---------------- floor track: state by line pattern ---------------- */
const Track = (() => {
  const SEGL = .5, mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mk = (x0, x1, z) => { const n = Math.ceil((x1 - x0) / SEGL); const a = new THREE.InstancedMesh(BOX, mat, n), b = new THREE.InstancedMesh(BOX, mat, n);
    a.instanceMatrix.setUsage(THREE.DynamicDrawUsage); b.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(a, b); return { x0, n, z, a, b }; };
  const main = mk(-3, X_SCREEN - .4, 0), back = mk(X_INTAKE - 1.2, X_SCREEN + 1.4, Z_BACK);
  const ink = new THREE.Color(HEX.ink), steel = new THREE.Color(colors.grid), brass = new THREE.Color(colors.cache);
  function put(m, i, x, z, len, w, col) { dummy.position.set(x, .02, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(Math.max(len, 1e-4), .012, Math.max(w, 1e-4)); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, col); }
  function fill(L, stateOf) {
    for (let i = 0; i < L.n; i++) {
      const x = L.x0 + (i + .5) * SEGL, st = stateOf(x, i);
      if (st === 'solid') { put(L.a, i, x, L.z, SEGL * 1.002, .1, ink); put(L.b, i, x, L.z, 0, 0, ink); }
      else if (st === 'double') { put(L.a, i, x, L.z - .13, SEGL * 1.002, .06, brass); put(L.b, i, x, L.z + .13, SEGL * 1.002, .06, brass); }
      else if (st === 'gap') { put(L.a, i, x, L.z, 0, 0, ink); put(L.b, i, x, L.z, 0, 0, ink); }
      else { put(L.a, i, x, L.z, i % 2 ? 0 : SEGL * .55, .07, steel); put(L.b, i, x, L.z, 0, 0, ink); }
    }
    for (const m of [L.a, L.b]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
  // corner connectors (static, thin)
  const conn = (pts, r = .03, col = colors.grid) => { const c = new THREE.CatmullRomCurve3(pts.map(p => V3(...p)), false, 'centripetal'); const m = tube(c, r, new THREE.MeshBasicMaterial({ color: col }), 30); m.position.y = .02 - Y0; scene.add(m); };
  conn([[X_SCREEN + 1.4, Y0, -.6], [X_SCREEN + 1.9, Y0, -3], [X_SCREEN + .6, Y0, Z_BACK]]);
  conn([[X_INTAKE - 1.2, Y0, Z_BACK], [X_INTAKE - 4.2, Y0, -3.6], [X_INTAKE - 2.6, Y0, -.3], [X_INTAKE - 1, Y0, 0]]);
  conn([[X_BENCH + 3, Y0, Z_BACK], [X_BENCH + 1.7, Y0, Z_BACK - 2.1], [X_BENCH, Y0, Z_BACK - 2.7], [X_BENCH - 1.7, Y0, Z_BACK - 2.1], [X_BENCH - 3, Y0, Z_BACK]], .06, HEX.tool);   // detour through the tool bench
  return { update(S) {
    fill(main, (x) => { if (!beamCacheBust && S.cache && x >= S.cache[0] && x <= S.cache[1]) return 'double'; return x <= S.mainX ? 'solid' : 'dash'; });
    fill(back, (x) => x >= S.backX ? 'solid' : 'dash');
  } };
})();

/* ---------------- token bead ---------------- */
const TOKW = .66;
const bead = new THREE.Group(); scene.add(bead);
{ const core = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: HEX.token, depthTest: false, fog: false })); core.scale.set(TOKW, .34, .34); core.renderOrder = 20; bead.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, depthTest: false, depthWrite: false, transparent: true, fog: false })); halo.scale.set(3.2, 3.2, 1); halo.renderOrder = 19; bead.add(halo); bead.userData.halo = halo; }

/* ---------------- token trains (tiles riding with the token) ---------------- */
const pieceW = s => .2 + .075 * s.length;
function makeTrain(ahead, behind, color = HEX.ink2) {
  const list = [...ahead.map((p, i) => ({ p, side: 1, k: i })), ...behind.map((p, i) => ({ p, side: -1, k: i }))];
  const mesh = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh);
  const cols = list.map(it => new THREE.Color(it.p.color || color));
  list.forEach((it, i) => mesh.setColorAt(i, cols[i]));
  // cumulative offsets along the path (world units) from bead centre
  let a = TOKW / 2, b = TOKW / 2; const GAP = .14;
  for (const it of list.filter(x => x.side === 1)) { const w = pieceW(it.p.t); it.off = a + GAP + w / 2; a += GAP + w; it.w = w; }
  for (const it of list.filter(x => x.side === -1)) { const w = pieceW(it.p.t); it.off = -(b + GAP + w / 2); b += GAP + w; it.w = w; }
  const tan = new THREE.Vector3();
  return { mesh, list, place(seg, u, vis, opts = {}) {
    const len = seg.len, fe = opts.floorEnd ?? 1;
    list.forEach((it, i) => {
      let uu = u + it.off / len, s = vis;
      if (uu < 0 || uu > 1) s = 0;
      if (opts.climb === false && uu > fe) s *= clamp(1 - (uu - fe) * len / 1.2);   // queue into tower base
      if (it.p.hideAfterX !== undefined) { const px = seg.c.getPointAt(clamp(uu)).x; if (px > it.p.hideAfterX) s = 0; }
      if (it.p.hideBeforeX !== undefined) { const px = seg.c.getPointAt(clamp(uu)).x; if (px < it.p.hideBeforeX) s = 0; }
      uu = clamp(uu, 0, opts.climb === false ? fe : 1);
      const p = seg.c.getPointAt(uu); seg.c.getTangentAt(uu, tan);
      dummy.position.copy(p); dummy.rotation.set(0, Math.atan2(-tan.z, tan.x), 0);
      dummy.scale.set(it.w * s, .32 * s, .32 * s); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.visible = vis > .01;
  }, hide() { mesh.visible = false; } };
}
const T = t => ({ t });
const trainCorpus = makeTrain([' in', ' is', ' Tower', ' Eiffel', ' the', ' famous', ' the'].map(T), [',', ' a', ' city', ' on', ' the', ' Seine'].map(T));
const trainPrompt = makeTrain([' in', ' weather', ' the', '’s', 'What', 'user:', '<system prompt>', '<tools>'].map(T), [' right', ' now', '?'].map(T));
const trainResend = makeTrain([' in', ' weather', ' the', '’s', 'What', 'user:', '<system prompt>', '<tools>'].map(T),
  [' right', ' now', '?', 'tool_use', { t: 'tool_result {18 °C}', color: HEX.tool, hideBeforeX: 0 }].map(p => typeof p === 'string' ? T(p) : p));
const trainAnswer = makeTrain([' in', ' clear', ' and', ' °C', ' 18', '’s', 'It'].map(T), ['.'].map(T));

/* ---------------- station 1: corpus ---------------- */
const Corpus = (() => {
  const g = new THREE.Group(); scene.add(g);
  const rails = RAIL_Z.map(z => { const c = new THREE.CatmullRomCurve3(railPts(z).map(p => V3(...p)), false, 'centripetal'); const m = tube(c, .055, M.steel, 40); g.add(m); return c; });
  RAIL_Z.forEach(z => { box(.5, .5, .5, M.train, -15.2, 5.4, z, g); });
  const funnel = new THREE.Mesh(new THREE.TorusGeometry(.72, .11, 12, 40), M.train); funnel.position.set(-3, Y0, 0); funnel.rotation.y = Math.PI / 2; g.add(funnel);
  // gate
  box(.16, 2.3, .16, M.train, X_GATE, 1.15, -1.05, g); box(.16, 2.3, .16, M.train, X_GATE, 1.15, 1.05, g); box(.18, .18, 2.3, M.train, X_GATE, 2.3, 0, g);
  const comb = new THREE.InstancedMesh(BOX, M.steel, 7); for (let i = 0; i < 7; i++) { dummy.position.set(X_GATE, 1.25, -.78 + i * .26); dummy.rotation.set(0, 0, 0); dummy.scale.set(.035, 1.5, .035); dummy.updateMatrix(); comb.setMatrixAt(i, dummy.matrix); } g.add(comb);
  box(1.9, .16, 1.2, M.steelL, X_GATE + .9, .08, 2.35, g); shadow(X_GATE + .9, 2.35, 2.6, 1.8, .35, g); shadow(X_GATE, 0, 1.4, 3.2, .4, g);
  box(14.8, .06, .9, M.plinth, X_GATE + 2.4, .03, 0, g);
  // particles
  const N = 56, P = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial({ color: 0xffffff }), N); P.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(P);
  const keepC = new THREE.Color(HEX.ink2), dropC = new THREE.Color(colors.hardwarePale);
  const parts = Array.from({ length: N }, (_, i) => ({ r: i % 5, ph: (i * .6180339) % 1, drop: (i * 7) % 10 < 3 }));
  const main = new THREE.CatmullRomCurve3([V3(-3, Y0, 0), V3(X_GATE, Y0, 0)]); const tail = new THREE.CatmullRomCurve3([V3(X_GATE, Y0, 0), V3(X_TOK - .6, Y0, 0)]);
  const tmp = new THREE.Vector3();
  return { g, rails, update(S) {
    const t = S.anim * .07, vis = S.v.corpus;
    parts.forEach((p, i) => {
      const s = frac(t + p.ph); let sc = .2 * vis;
      if (s < .45) tmp.copy(rails[p.r].getPointAt(s / .45));
      else if (s < .72) tmp.copy(main.getPointAt((s - .45) / .27));
      else if (!p.drop) { const u = (s - .72) / .28; tmp.copy(tail.getPointAt(u)); sc *= clamp((1 - u) * 6); }
      else { const u = (s - .72) / .28; tmp.set(X_GATE + .2 + u * .8, lerp(Y0, .22, ease(clamp(u * 1.6))), lerp(0, 2.35, ease(clamp(u * 1.3)))); sc *= clamp((1 - u) * 5); }
      dummy.position.copy(tmp); dummy.rotation.set(s * 6, s * 9, 0); dummy.scale.setScalar(sc); dummy.updateMatrix(); P.setMatrixAt(i, dummy.matrix);
      P.setColorAt(i, p.drop && s > .66 ? dropC : keepC);
    });
    P.instanceMatrix.needsUpdate = true; P.instanceColor.needsUpdate = true;
  } };
})();

/* ---------------- station 2: tokenizer ---------------- */
const Tokenizer = (() => {
  const g = new THREE.Group(); scene.add(g);
  box(.2, 1.9, .2, M.train, X_TOK, .95, -.68, g); box(.2, 1.9, .2, M.train, X_TOK, .95, .68, g); box(.36, .26, 1.58, M.train, X_TOK, 1.9, 0, g);
  const blade = box(.05, .62, 1.06, M.steel, X_TOK, 1.3, 0, g);
  const text = '…the Eiffel Tower is in Paris, a city on the Seine. The Louvre is in Paris too, and so is the tower …   ';
  const tex = texCanvas(2048, 96, (c, w, h) => { c.fillStyle = theme.css.ground; c.fillRect(0, 0, w, h); c.fillStyle = theme.css.ink; c.font = '500 54px "Martian Mono", monospace'; c.textBaseline = 'middle'; c.fillText(text, 8, h / 2 + 2); });
  tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(.42, 1);
  const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(7, .5), new THREE.MeshBasicMaterial({ map: tex })); ribbon.rotation.x = -Math.PI / 2; ribbon.position.set(X_TOK - 3.6, .3, 0); g.add(ribbon);
  box(7.2, .26, .62, M.steelL, X_TOK - 3.6, .14, 0, g);
  shadow(X_TOK, 0, 2.2, 2.6, .45, g);
  // vision plate
  const vis = new THREE.Group(); g.add(vis);
  const vtex = texCanvas(256, 256, (c) => { const gr = c.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, theme.css['hardware-body']); gr.addColorStop(1, theme.css.muted); c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
    c.fillStyle = theme.css.ground; c.beginPath(); c.moveTo(128, 40); c.lineTo(150, 210); c.lineTo(106, 210); c.closePath(); c.fill(); c.strokeStyle = theme.css.ground; c.lineWidth = 3; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64, 256); c.stroke(); c.beginPath(); c.moveTo(0, i * 64); c.lineTo(256, i * 64); c.stroke(); } });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: vtex })); plate.rotation.x = -Math.PI / 2; plate.position.set(X_TOK - 2.6, .4, -3.3); vis.add(plate);
  box(1.86, .14, 1.86, M.steelL, X_TOK - 2.6, .3, -3.3, vis);
  const patches = new THREE.InstancedMesh(BOX, M.graphite, 16); patches.instanceMatrix.setUsage(THREE.DynamicDrawUsage); vis.add(patches);
  return { g, update(S) {
    const a = S.anim;
    tex.offset.x = (a * .045) % 1;
    const chop = frac(a * 2.1); blade.position.y = 1.3 - (chop < .18 ? Math.sin(chop / .18 * Math.PI) * .5 : 0) * S.v.chop;
    vis.visible = S.v.vision > .01; vis.scale.setScalar(Math.max(.001, S.v.vision));
    vis.position.set((X_TOK - 2.6) * (1 - vis.scale.x), 0, -3.3 * (1 - vis.scale.x));
    if (vis.visible) {
      for (let i = 0; i < 16; i++) {
        const cx = (i % 4) - 1.5, cz = Math.floor(i / 4) - 1.5, s = frac(a * .22 + i / 16 * .6);
        const p0 = V3(X_TOK - 2.6 + cx * .42, .52, -3.3 + cz * .42), p1 = V3(X_TOK + 1.3 + (i % 8) * .44, Y0, -.95 - Math.floor(i / 8) * .44);
        const u = ease(clamp((s - .15) / .7)); dummy.position.lerpVectors(p0, p1, u); dummy.position.y += Math.sin(u * Math.PI) * .9;
        dummy.rotation.set(0, 0, 0); const sc = s < .9 ? 1 : (1 - s) * 10; dummy.scale.set(.36 * sc, .07 + u * .2, .36 * sc); dummy.updateMatrix(); patches.setMatrixAt(i, dummy.matrix);
      }
      patches.instanceMatrix.needsUpdate = true;
    }
  } };
})();

/* ---------------- the tower ---------------- */
const Tower = (() => {
  const g = new THREE.Group(); scene.add(g);
  const base = box(4.5, .62, 4.5, lam(colors.hardwarePlinth), 0, .31, 0, g);
  const row = box(4.1, .07, .16, M.ink, 0, .5, .9, g);
  // cutaway: three quadrants per layer; the front-right quarter is open so the rod and the token stay visible
  const QUAD = [[1.3, 1.3, -1, -1], [2.0, 1.3, .65, -1], [1.3, 2.0, -1, .65]], NQ = QUAD.length;
  const plates = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial({ color: 0xffffff }), NPL * NQ); g.add(plates);
  for (let i = 0; i < NPL; i++) QUAD.forEach(([sx, sz, px, pz], q) => { dummy.position.set(px, PLATE0 + i * PSTEP, pz); dummy.rotation.set(0, 0, 0); dummy.scale.set(sx, .13, sz); dummy.updateMatrix(); plates.setMatrixAt(i * NQ + q, dummy.matrix); plates.setColorAt(i * NQ + q, new THREE.Color(HEX.graphite)); });
  // residual stream: four twisted mHC strands (DeepSeek-V4 hc_mult = 4) bundled into the steel rod, with binding collars
  const ROD0 = .4, ROD1 = TOWER_TOP + .1, TURN = 4.6, NSTR = 4, NCOL = 7;
  for (let k = 0; k < NSTR; k++) { const pts = []; for (let j = 0; j <= 96; j++) { const y = ROD0 + (ROD1 - ROD0) * j / 96, a = k * Math.PI / 2 + (y - ROD0) / TURN * Math.PI * 2; pts.push(V3(Math.cos(a) * .092, y, Math.sin(a) * .092)); } g.add(tube(new THREE.CatmullRomCurve3(pts), .036, k % 2 ? M.steelL : M.steel, 192)); }
  const collars = new THREE.InstancedMesh(new THREE.TorusGeometry(.15, .018, 6, 24), M.steel, NCOL); g.add(collars);
  for (let i = 0; i < NCOL; i++) { dummy.position.set(0, ROD0 + .3 + i * (ROD1 - ROD0 - .6) / (NCOL - 1), 0); dummy.rotation.set(Math.PI / 2, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); collars.setMatrixAt(i, dummy.matrix); }
  const crownRing = new THREE.Mesh(new THREE.TorusGeometry(.5, .06, 8, 32), M.steel); crownRing.rotation.x = Math.PI / 2; crownRing.position.y = TOWER_TOP + .08; g.add(crownRing);
  // LM head bars
  const NB = 25, bars = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial({ color: 0xffffff }), NB); bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(bars);
  const barH = Array.from({ length: NB }, (_, i) => .12 + .55 * Math.exp(-Math.pow((i - 12) / 5, 2)) * (.6 + .4 * Math.sin(i * 2.7) ** 2));
  barH[12] = 1.9; barH[9] = .85; barH[15] = .7; const cur = barH.map(() => .1);
  const NM = 13, mtp = new THREE.InstancedMesh(BOX, M.steel, NM); mtp.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(mtp);
  const mtpH = Array.from({ length: NM }, (_, i) => .1 + .45 * Math.exp(-Math.pow((i - 6) / 3, 2)) * (.5 + .5 * Math.cos(i * 1.9) ** 2));
  // gradient rings
  const rings = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.TorusGeometry(2.05, .075, 8, 56), M.train); r.rotation.x = Math.PI / 2; g.add(r); return r; });
  const shad = shadow(0, 0, 8, 8, .6, g);
  const pale = new THREE.Color(colors.hardwareDeck), graph = new THREE.Color(HEX.graphite), flashC = new THREE.Color(colors.hardwarePale), gradC = new THREE.Color(HEX.train), c = new THREE.Color();
  const tokC = new THREE.Color(HEX.token), inkC = new THREE.Color(HEX.ink2);
  return { g, update(S) {
    g.position.x = S.tower.x;
    const a = S.anim, tr = S.tower.trained;
    // gradient rings
    const gv = S.v.grad;
    rings.forEach((r, k) => { const s = frac(a * .42 + k / 3); r.position.y = lerp(TOWER_TOP + .2, PLATE0, s); r.visible = gv > .02; r.scale.setScalar(Math.max(.001, gv) * (1 + .03 * Math.sin(s * 9))); });
    const by = S.bead.visible && Math.abs(S.bead.pos.x - S.tower.x) < .6 ? S.bead.pos.y : -99;
    for (let i = 0; i < NPL; i++) {
      const y = PLATE0 + i * PSTEP;
      c.copy(pale).lerp(graph, tr);
      const fl = S.v.flicker * (1 - tr * .5) * .5 * (.5 + .5 * Math.sin(a * 6.3 + i * 1.73) * Math.sin(a * 2.1 + i * .61));
      if (fl > 0) c.lerp(pale, fl * .55);
      const fv = Math.exp(-Math.pow((by - y) / .55, 2)) * .85; if (fv > .01) c.lerp(flashC, fv);
      if (gv > .02) { let rv = 0; rings.forEach(r => rv = Math.max(rv, Math.exp(-Math.pow((r.position.y - y) / .3, 2)))); c.lerp(gradC, rv * .55 * gv); }
      if (S.v.layers > .02) { const sweep = frac(a * .35) * (NPL + 10) - 5; c.lerp(flashC, Math.exp(-Math.pow((sweep - i) / 1.6, 2)) * .6 * S.v.layers); }
      for (let q = 0; q < NQ; q++) plates.setColorAt(i * NQ + q, c);
    }
    plates.instanceColor.needsUpdate = true;
    // logits
    const lv = Math.max(S.v.logits, S.headHot);
    for (let i = 0; i < NB; i++) {
      const tgt = lerp(.1, barH[i] * (1 + .12 * Math.sin(a * 3 + i)), lv); cur[i] = damp(cur[i], tgt, 5, S.dt);
      dummy.position.set(-1.62 + i * .135, TOWER_TOP + .22 + cur[i] / 2, .2); dummy.rotation.set(0, 0, 0); dummy.scale.set(.09, cur[i], .09); dummy.updateMatrix(); bars.setMatrixAt(i, dummy.matrix);
      bars.setColorAt(i, i === 12 && S.winnerHot > .5 ? tokC : inkC);
    }
    bars.instanceMatrix.needsUpdate = true; bars.instanceColor.needsUpdate = true;
    for (let i = 0; i < NM; i++) { const h = lerp(.08, mtpH[i], Math.max(.25, lv * .9)); dummy.position.set(-.8 + i * .135, TOWER_TOP + .22 + h / 2, -1.05); dummy.scale.set(.08, h, .08); dummy.updateMatrix(); mtp.setMatrixAt(i, dummy.matrix); }
    mtp.instanceMatrix.needsUpdate = true;
    // embedding lookup: one row slides out of the base table toward the viewer, then the token rides it in
    row.position.y = .5 + S.v.embed * .06 * Math.sin(a * 2); row.position.z = .9 + S.v.embed * 2.5; row.scale.y = 1 + S.v.embed * 1.4; row.scale.z = 1 + S.v.embed * .7;
  } };
})();

/* training floor: cluster + context bracket */
const Cluster = (() => {
  const g = new THREE.Group(); scene.add(g);
  const n = 24, racks = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
  for (let i = 0; i < n; i++) { dummy.position.set(X_TRAIN - 3.6 + (i % 8) * 1.03, .75, -6.4 - Math.floor(i / 8) * 1.15); dummy.rotation.set(0, 0, 0); dummy.scale.set(.82, 1.5, .78); dummy.updateMatrix(); racks.setMatrixAt(i, dummy.matrix); racks.setColorAt(i, new THREE.Color(HEX.graphite)); }
  g.add(racks); shadow(X_TRAIN, -7.5, 11, 5, .45, g); box(9.6, .06, 4.1, M.plinth, X_TRAIN, .03, -7.55, g);
  box(7, .06, 7, M.plinth, X_TRAIN, .03, 0, g); box(7, .06, 7, M.plinth, X_TOWER, .03, 0, g);
  const lit = new THREE.Color(colors.hardwareBody), dark = new THREE.Color(HEX.graphite);
  const br = new THREE.Group(); scene.add(br);
  const tabL = box(.08, .9, .55, M.train, 0, .45, 0, br), tabR = box(.08, .9, .55, M.train, 0, .45, 0, br), bar = box(1, .07, .07, M.train, 0, .9, 0, br);
  return { update(S) {
    const a = S.anim, on = S.v.cluster;
    for (let i = 0; i < n; i++) racks.setColorAt(i, on > .05 && Math.sin(a * 5.1 + i * 2.3) * Math.sin(a * 1.7 + i) > .35 ? lit : dark);
    racks.instanceColor.needsUpdate = true;
    br.visible = S.v.ctx > .01; const L = lerp(1.2, 9.6, S.ctx), xr = X_TRAIN - 3.6;
    tabR.position.x = xr; tabL.position.x = xr - L; bar.scale.x = L; bar.position.x = xr - L / 2; br.scale.y = Math.max(.001, S.v.ctx);
  }, bracketLeft: () => V3(X_TRAIN - 3.6 - lerp(1.2, 9.6, State.ctx), 1.05, 0) };
})();

/* ---------------- stations 4–5: post-training, release ---------------- */
const Post = (() => {
  const g = new THREE.Group(); scene.add(g);
  const gx = X_POST + 7.2;
  box(.18, 5.7, .18, M.train, gx, 2.85, -4.1, g); box(.18, 5.7, .18, M.train, gx, 2.85, 4.1, g); box(.26, .26, 8.6, M.train, gx, 5.7, 0, g);
  shadow(gx, 0, 2, 9.5, .35, g);
  const Z = Array.from({ length: 8 }, (_, i) => -3.5 + i);
  const WIN = [1, 0, 1, 1, 0, 0, 1, 0];
  const arcs = Z.map((z, i) => {
    const c = new THREE.QuadraticBezierCurve3(V3(X_POST + .9, HEAD_Y + .3, z * .08), V3(X_POST + 4.6, HEAD_Y + 3.0, z * .75), V3(gx - .1, 5.95, z));
    let m;
    if (WIN[i]) m = tube(c, .045, M.ink, 40);
    else { const geo = new THREE.TubeGeometry(c, 40, .035, 6, false); m = new THREE.Mesh(geo, M.steel); }
    if (!WIN[i]) {
      // Alternating tube segments share an index buffer and one draw.
      const geo = m.geometry;
      const index = geo.index.array;
      const stride = index.length / 40;
      const visible = [];
      for (let s = 0; s < 40; s += 4) {
        visible.push(...index.slice(s * stride, (s + 2) * stride));
      }
      geo.setIndex(visible);
    }
    m.userData.total = m.geometry.index.count;
    g.add(m);
    return m;
  });
  const marks = Z.map((z, i) => { const o = new THREE.Group(); o.position.set(gx, 6.1, z); g.add(o); if (WIN[i]) box(.3, .3, .3, M.ink, 0, 0, 0, o); else edgesBox(.3, .3, .3, HEX.ink, o); return o; });
  // reference model + tether
  const ghost = new THREE.Group(); g.add(ghost); ghost.position.set(X_POST - 6, 0, -3.6);
  const ge = edgesBox(3.3, TOWER_TOP - .7, 3.3, HEX.ink2, ghost); ge.position.y = (TOWER_TOP + .7) / 2;
  const tg = new THREE.BufferGeometry().setFromPoints([V3(X_POST - 6, TOWER_TOP, -3.6), V3(X_POST - 3.5, TOWER_TOP + 1.6, -1.8), V3(X_POST - 1.6, TOWER_TOP + .2, 0)]);
  const tether = new THREE.Line(tg, new THREE.LineDashedMaterial({ color: HEX.ink, dashSize: .3, gapSize: .2 })); tether.computeLineDistances(); g.add(tether);
  // constitution
  const ctex = texCanvas(256, 340, (c, w, h) => { c.fillStyle = theme.css.ground; c.fillRect(0, 0, w, h); c.fillStyle = theme.css.ink; c.font = '700 26px "Roboto Flex", sans-serif'; c.fillText('Constitution', 22, 46);
    c.fillStyle = theme.css['hardware-body']; for (let i = 0; i < 12; i++) c.fillRect(22, 74 + i * 20, 160 + ((i * 53) % 50), 6); c.strokeStyle = theme.css.ink; c.lineWidth = 3; c.strokeRect(1.5, 1.5, w - 3, h - 3); });
  const cons = new THREE.Group(); g.add(cons); cons.position.set(X_POST + 3.8, 0, -5.6);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2), new THREE.MeshBasicMaterial({ map: ctex, side: THREE.DoubleSide })); sheet.position.set(0, 1.85, 0); sheet.rotation.y = -.35; cons.add(sheet);
  box(.08, .9, .08, M.steel, 0, .45, 0, cons); shadow(0, 0, 1.6, 1.2, .35, cons);
  const cline = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(X_POST + 4.5, 2.6, -5.5), V3(gx, 5.6, -4.1)]), new THREE.LineDashedMaterial({ color: HEX.ink, dashSize: .25, gapSize: .18 })); cline.computeLineDistances(); g.add(cline);
  // SFT demo tiles
  const demo = new THREE.InstancedMesh(BOX, M.steelL, 8); demo.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(demo);
  return { update(S) {
    const a = S.anim, rl = S.v.rl;
    arcs.forEach((m, i) => { m.visible = rl > .01; const grow = clamp((frac(a * .28) * 1.6 - i * .05)); const n = Math.floor(m.userData.total * Math.min(1, grow * 1.25) * rl / 3) * 3;
      m.geometry.setDrawRange(0, n); });
    marks.forEach((o, i) => { const on = rl * sstep(.55, .7, frac(a * .28)); o.visible = on > .02; o.scale.setScalar(Math.max(.001, on)); });
    ghost.visible = S.v.ghost > .01; tether.visible = ghost.visible; ghost.scale.y = Math.max(.001, S.v.ghost);
    cons.visible = S.v.cons > .01; cline.visible = cons.visible; cons.scale.setScalar(Math.max(.001, S.v.cons));
    demo.visible = S.v.sft > .01;
    if (demo.visible) { for (let i = 0; i < 8; i++) { const s = frac(a * .25 + i / 8); dummy.position.set(lerp(S.tower.x - 9, S.tower.x - 1.6, s), Y0, 0); dummy.rotation.set(0, 0, 0); const sc = S.v.sft * clamp((1 - s) * 8) * clamp(s * 8); dummy.scale.set(.6 * sc, .32 * sc, .32 * sc); dummy.updateMatrix(); demo.setMatrixAt(i, dummy.matrix); } demo.instanceMatrix.needsUpdate = true; }
  } };
})();

const Gate = (() => {
  const g = new THREE.Group(); scene.add(g);
  box(.44, 15.8, .44, M.train, X_REL, 7.9, -2.8, g); box(.44, 15.8, .44, M.train, X_REL, 7.9, 2.8, g); box(.62, .62, 6.2, M.train, X_REL, 15.8, 0, g);
  shadow(X_REL, -2.8, 1.6, 1.6, .5, g); shadow(X_REL, 2.8, 1.6, 1.6, .5, g); box(1.6, .06, 7.2, M.plinth, X_REL, .03, 0, g);
  const scan = box(.32, .32, 5.4, M.ink, X_REL, 3, 0, g);
  const lamps = Array.from({ length: 6 }, (_, i) => { const o = new THREE.Group(); o.position.set(X_REL + .42, 15.8, -2.2 + i * .88); g.add(o); edgesBox(.08, .62, .62, HEX.ink, o); const f = box(.08, .62, .62, M.ink, 0, 0, 0, o); return f; });
  return { update(S) {
    const s = S.v.scan, a = S.anim;
    scan.visible = s > .02; scan.position.y = lerp(1, 14.8, .5 + .5 * Math.sin(a * 1.4));
    lamps.forEach((f, i) => { const on = Math.max(S.lampsOn - i, 0) >= 1 ? 1 : clamp(S.lampsOn - i); f.scale.setScalar(Math.max(.001, on)); });
  } };
})();

/* ---------------- serving floor ---------------- */
const Serve = (() => {
  const g = new THREE.Group(); scene.add(g);
  const intake = new THREE.Mesh(new THREE.TorusGeometry(.74, .11, 12, 40), M.serve); intake.position.set(X_INTAKE, Y0, 0); intake.rotation.y = Math.PI / 2; g.add(intake);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(.6, .045, 8, 40), M.steel); hoop.position.set(X_INTAKE + 1.4, Y0, 0); hoop.rotation.y = Math.PI / 2; g.add(hoop);
  box(4.4, .06, 2.2, M.plinth, X_INTAKE + .6, .03, 0, g); shadow(X_INTAKE, 0, 2.4, 2.4, .35, g);
  // sampler arch
  box(.15, 1.8, .15, M.serve, X_SAMPLE, .9, -.66, g); box(.15, 1.8, .15, M.serve, X_SAMPLE, .9, .66, g); box(.24, .24, 1.5, M.serve, X_SAMPLE, 1.8, 0, g); shadow(X_SAMPLE, 0, 1.2, 2.2, .35, g);
  const outHoop = new THREE.Mesh(new THREE.TorusGeometry(.64, .085, 10, 40), M.serve); outHoop.position.set(X_STREAM, Y0, 0); outHoop.rotation.y = Math.PI / 2; g.add(outHoop);
  // thinking lane barrier
  const barrier = box(.1, 1, 1, M.ink, X_STREAM - 2.6, .5, -1.8, g);
  const laneM = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: colors.grid })); laneM.scale.set(X_STREAM - 2.6 - (X_TOWER + 3.2), .012, .05); laneM.position.set((X_STREAM - 2.6 + X_TOWER + 3.2) / 2, .02, -1.8); g.add(laneM);
  // KV rack
  const NKV = 30, kv = new THREE.InstancedMesh(BOX, M.serve, NKV); kv.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(kv);
  box(NKV * .14 + .4, .08, 1.5, M.plinth, X_TOWER + 2.3 + NKV * .07, .04, 2.7, g);
  const kvCur = new Float32Array(NKV);
  // batch rows
  const batch = new THREE.InstancedMesh(BOX, lam(colors.hardwareFrame), 12); batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(batch);
  // thinking tiles (hollow)
  const thinking = Array.from({ length: 11 }, () => { const e = edgesBox(.62, .32, .32, HEX.ink, g); e.visible = false; return e; });
  const draft = edgesBox(.66, .34, .34, HEX.token, g); draft.visible = false;
  // screen
  const scr = new THREE.Group(); g.add(scr); scr.position.set(X_SCREEN + 2.7, 0, 0);
  box(5.5, 3.7, .24, lam(HEX.graphite), 0, 2.25, 0, scr); box(.5, .45, .9, lam(HEX.graphite), 0, .22, 0, scr); shadow(0, 0, 6.5, 2.5, .5, scr);
  const stex = texCanvas(1100, 700, () => {});
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(5.12, 3.3), new THREE.MeshBasicMaterial({ map: stex })); surf.position.set(0, 2.25, .125); scr.add(surf);
  // bench
  const bench = new THREE.Group(); g.add(bench); bench.position.set(X_BENCH, 0, Z_BACK - 2.6);
  box(2.6, 1.3, 1.8, M.tool, 0, .65, 0, bench); box(1.0, .5, 1.86, lam(colors.tool), 0, .78, 0, bench); shadow(0, 0, 3.6, 2.8, .45, bench);
  // compaction block
  const compact = box(2.8, .34, .34, M.ink, X_INTAKE + 3.2, Y0, 0, g); compact.visible = false;
  let screenKey = '';
  function drawScreen(state) {
    const key = JSON.stringify(state); if (key === screenKey) return; screenKey = key;
    const c = stex.userData.g, w = 1100, h = 700;
    c.fillStyle = theme.css.plate; c.fillRect(0, 0, w, h);
    c.fillStyle = theme.css.inset; c.fillRect(0, 0, w, 64); c.fillStyle = theme.css.ink; c.font = '600 28px "Roboto Flex", sans-serif'; c.fillText('your app', 32, 42);
    c.fillStyle = theme.css.muted; c.font = '500 22px "Martian Mono", monospace'; c.fillText('POST /v1/messages', w - 300, 42);
    // user bubble
    c.fillStyle = theme.css.ink; c.fillRect(w - 600, 104, 568, 72); c.fillStyle = theme.css.plate; c.font = '500 27px "Roboto Flex", sans-serif'; c.fillText('What’s the weather in Paris right now?', w - 578, 150);
    let y = 236; c.font = '500 25px "Martian Mono", monospace';
    const line = (txt, col = theme.css.ink, font) => { c.fillStyle = col; if (font) c.font = font; c.fillText(txt, 32, y); y += 46; };
    if (state.status) line(state.status, theme.css.muted);
    if (state.call) { c.strokeStyle = theme.css.ink; c.lineWidth = 2; c.strokeRect(24, y - 34, w - 48, 98); line('tool_use  get_weather', theme.css.ink, '600 25px "Martian Mono", monospace'); line(state.call, theme.css.ink, '500 25px "Martian Mono", monospace'); y += 14; }
    if (state.result) { c.fillStyle = theme.css.inset; c.fillRect(24, y - 34, w - 48, 56); line(state.result, theme.css.tool); y += 10; }
    if (state.answer !== undefined) { c.font = '500 36px "Roboto Flex", sans-serif'; c.fillStyle = theme.css.ink; c.fillText(state.answer, 32, y + 12); y += 70; }
    if (state.stop) { c.font = '500 22px "Martian Mono", monospace'; c.fillStyle = theme.css.muted; c.fillText(state.stop, 32, h - 34); }
    stex.needsUpdate = true;
  }
  const lanes = [1.55, -1.55];
  return { g, drawScreen, resetScreen() { screenKey = ''; }, update(S) {
    const a = S.anim;
    // KV rack
    for (let i = 0; i < NKV; i++) { kvCur[i] = damp(kvCur[i], i < S.kv ? 1 : 0, 99, S.dt); const s = kvCur[i];
      dummy.position.set(X_TOWER + 2.4 + i * .14, .08 + .8 * s, 2.7); dummy.rotation.set(0, 0, 0); dummy.scale.set(.075, Math.max(.001, 1.6 * s), 1.25); dummy.updateMatrix(); kv.setMatrixAt(i, dummy.matrix); }
    kv.instanceMatrix.needsUpdate = true;
    // batch
    batch.visible = S.v.batch > .01;
    // batch: two other users' prompts ride as contiguous rows beside ours and merge into the same forward pass
    if (batch.visible) for (let i = 0; i < 12; i++) { const L = i % 2, j = Math.floor(i / 2), s = frac(a * .16 + L * .37); const head = lerp(X_INTAKE + 4.2, X_TOWER - 1.7, s); const x = head - j * .66;
      const z = lanes[L] * (1 - sstep(.8, 1, s)); const fade = clamp((x - X_INTAKE - 1.2) * 2) * clamp((X_TOWER - 1.6 - x) * 3);
      dummy.position.set(x, Y0, z); dummy.rotation.set(0, 0, 0); const sc = S.v.batch * fade; dummy.scale.set(.56 * sc + 1e-4, .3 * sc + 1e-4, .3 * sc + 1e-4); dummy.updateMatrix(); batch.setMatrixAt(i, dummy.matrix); }
    if (batch.visible) batch.instanceMatrix.needsUpdate = true;
    // thinking tiles
    const tv = S.v.thinking;
    thinking.forEach((e, i) => { const s = frac(a * .2 + i / 11); const x = lerp(X_TOWER + 3.6, X_STREAM - 3.1, Math.min(1, s * 1.15)); e.visible = tv > .02 && s < .96 && i < S.effort;
      e.position.set(x, Y0 + Math.max(0, (.12 - s) * 30) * .4, -1.8); e.scale.setScalar(Math.max(.001, tv * clamp(s * 12))); });
    barrier.visible = laneM.visible = tv > .02 || S.v.lane > .02;
    // draft
    draft.visible = S.v.draft > .02 && S.bead.visible && S.bead.pos.y < 1.2 && S.bead.pos.x > X_TOWER + 3;
    if (draft.visible) { draft.position.set(S.bead.pos.x + .95, Y0, 0); draft.scale.setScalar(.6 + .4 * frac(a * 1.8)); }
    compact.visible = S.v.compact > .02; compact.scale.x = Math.max(.001, S.v.compact);
    drawScreen(S.screen);
  } };
})();

/* ---------------- callouts: attention + MoE ---------------- */
const Callouts = (() => {
  const g = new THREE.Group(); scene.add(g);
  const AX = X_TOWER - 13.5, AY = 7.4, AZ = 4.4, SP = .72;
  const att = new THREE.Group(); g.add(att);
  const keys = new THREE.InstancedMesh(BOX, M.ink, 12); att.add(keys);
  for (let i = 0; i < 12; i++) { dummy.position.set(AX + i * SP, AY, AZ); dummy.rotation.set(0, 0, 0); dummy.scale.set(.56, .3, .3); dummy.updateMatrix(); keys.setMatrixAt(i, dummy.matrix); }
  const q = box(TOKW, .34, .34, new THREE.MeshBasicMaterial({ color: HEX.token }), AX + 12 * SP, AY, AZ, att);
  const future = [0, 1, 2, 3].map(i => { const e = edgesBox(.56, .3, .3, colors.hardwareFrame, att); e.position.set(AX + (13 + i) * SP + .1, AY, AZ); return e; });
  const mask = box(.06, 1.1, .9, M.train, AX + 12.55 * SP, AY + .2, AZ, att);
  const W = [.15, .1, .1, .12, .3, .1, .25, .9, .75, .2, .35, .5];
  const arcD = W.map((w, i) => { const c = new THREE.QuadraticBezierCurve3(V3(AX + 12 * SP, AY + .18, AZ), V3(AX + (i + 12) / 2 * SP, AY + 1.0 + (12 - i) * .16, AZ), V3(AX + i * SP, AY + .16, AZ)); const m = tube(c, .012 + .05 * w, bas(colors.attention), 36); att.add(m); return m; });
  const sp = new THREE.Group(); att.add(sp);
  const blocks = [0, 1].map(b => box(4 * SP - .14, .32, .32, b === 1 ? M.ink : M.steelL, AX + (b * 4 + 1.5) * SP, AY, AZ, sp));
  const arcS = [[5.5, .8], [8, .3], [9, .55], [10, .4], [11, .7]].map(([x, w]) => { const c = new THREE.QuadraticBezierCurve3(V3(AX + 12 * SP, AY + .18, AZ), V3(AX + (x + 12) / 2 * SP, AY + 1.0 + (12 - x) * .17, AZ), V3(AX + x * SP, AY + .16, AZ)); const m = tube(c, .012 + .05 * w, bas(colors.attention), 36); sp.add(m); return m; });
  const lead = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(0, 0, 0), V3(0, 0, 0)]), new THREE.LineDashedMaterial({ color: colors.hardwareFrame, dashSize: .2, gapSize: .14 })); g.add(lead);
  // MoE
  const moe = new THREE.Group(); g.add(moe);
  const MX = X_TOWER - 14, MY = 9.2, MZ = 4.4, CW = .27, COLS = 24, ROWS = 16;
  const cells = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial({ color: 0xffffff }), COLS * ROWS); moe.add(cells);
  const LIT = [41, 98, 171, 214, 287, 340];
  const pc = new THREE.Color(colors.hardwareBody), lc = new THREE.Color(HEX.token), hotC = new THREE.Color(HEX.train);
  function paintMoeBank(entries, collapsed) {
    const byId = new Map(entries.map(e => [e.id, e.weight]));
    for (let i = 0; i < COLS * ROWS; i++) {
      const cx = i % COLS, cy = Math.floor(i / COLS);
      const w = byId.get(i) || 0;
      const zScale = w ? 0.14 + 0.55 * Math.sqrt(w) : 0.08;
      dummy.position.set(MX + 1.9 + cx * CW, MY - ROWS * CW / 2 + cy * CW, MZ + (w ? zScale * 0.45 : 0));
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(CW * (w ? .94 : .8), CW * (w ? .94 : .8), zScale);
      dummy.updateMatrix();
      cells.setMatrixAt(i, dummy.matrix);
      cells.setColorAt(i, w ? (collapsed ? hotC : lc) : pc);
    }
    cells.instanceMatrix.needsUpdate = true;
    cells.instanceColor.needsUpdate = true;
  }
  paintMoeBank(LIT.map(id => ({ id, weight: 1 / LIT.length })), false);
  const shared = box(.9, .9, .12, M.ink, MX + .5, MY + 1.1, MZ, moe);
  const router = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .16, 24), M.serve); router.rotation.x = Math.PI / 2; router.position.set(MX + .5, MY - .9, MZ); moe.add(router);
  const streams = [...LIT.map(i => { const cx = i % COLS, cy = Math.floor(i / COLS); return V3(MX + 1.9 + cx * CW, MY - ROWS * CW / 2 + cy * CW, MZ + .05); }), V3(MX + .5, MY + 1.1, MZ + .07)].map((p, k) => {
    const c = new THREE.QuadraticBezierCurve3(V3(MX + .5, MY - .9, MZ + .1), V3((MX + .5 + p.x) / 2, (MY - .9 + p.y) / 2 + .5, MZ + .5), p); const m = tube(c, k === 6 ? .03 : .018 + .02 * ((k * 37) % 5) / 4, new THREE.MeshBasicMaterial({ color: HEX.token }), 30); moe.add(m); return m; });
  const lead2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(0, 0, 0), V3(0, 0, 0)]), new THREE.LineDashedMaterial({ color: colors.hardwareFrame, dashSize: .2, gapSize: .14 })); g.add(lead2);
  const setLead = (l, a, b) => { const p = l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; l.computeLineDistances(); l.geometry.computeBoundingSphere(); };
  return { anchors: { query: () => V3(AX + 12 * SP, AY + .6, AZ), mask: () => V3(AX + 12.55 * SP, AY + .95, AZ), blocks: () => V3(AX + 3.5 * SP, AY + .5, AZ), window: () => V3(AX + 10 * SP, AY + .5, AZ), indexer: () => V3(AX + 5.5 * SP, AY + 1.9, AZ),
      router: () => V3(MX + .5, MY - 1.2, MZ), shared: () => V3(MX + .5, MY + 1.7, MZ), experts: () => V3(MX + 1.9 + 12 * CW, MY + ROWS * CW / 2 + .25, MZ) },
    setRouting(k, bias) {
      if (!window.MicroLabs) return;
      paintMoeBank(MicroLabs.routeExperts(k, bias), bias < 0.05);
    },
    update(S) {
      const va = Math.max(S.v.attn, S.v.attnS), vm = S.v.moe;
      att.visible = va > .01; att.scale.set(1, Math.max(.001, va), 1); att.position.y = AY * (1 - Math.max(.001, va));
      keys.visible = S.v.attn > .01; arcD.forEach(m => m.visible = S.v.attn > .01); sp.visible = S.v.attnS > .01;
      if (S.v.attnS > .01) { for (let i = 0; i < 12; i++) { dummy.position.set(AX + i * SP, AY, AZ); dummy.rotation.set(0, 0, 0); const sc = i < 8 ? 0 : 1; dummy.scale.set(.56 * sc + 1e-4, .3, .3); dummy.updateMatrix(); keys.setMatrixAt(i, dummy.matrix); } keys.visible = true; keys.instanceMatrix.needsUpdate = true; }
      else if (S.v.attn > .01) { for (let i = 0; i < 12; i++) { dummy.position.set(AX + i * SP, AY, AZ); dummy.rotation.set(0, 0, 0); dummy.scale.set(.56, .3, .3); dummy.updateMatrix(); keys.setMatrixAt(i, dummy.matrix); } keys.instanceMatrix.needsUpdate = true; }
      lead.visible = va > .3; if (lead.visible) setLead(lead, V3(AX + 12 * SP, AY - .2, AZ), V3(S.tower.x + .2, AY, 1.7));
      moe.visible = vm > .01; moe.scale.set(1, Math.max(.001, vm), 1); moe.position.y = MY * (1 - Math.max(.001, vm));
      lead2.visible = vm > .3; if (lead2.visible) setLead(lead2, V3(MX + 1.9 + 23 * CW, MY, MZ), V3(S.tower.x + .2, MY, 1.7));
    } };
})();

/* ---------------- beats ---------------- */
const J = jOf;
const L6 = [6, 6];
const B = {
  hero: { cam: [51, 60, 152, 51, 2, -3], fov: 26, A: 1.78, ox: 0, oy: .2, loopJ: [0, 1, 24], ph: .62, tags: [], show: { corpus: 1, chop: 1, lane: 1 } },
  p1: { cam: [-1, 15, 38, 1, 1.6, -1], fov: 30, A: 1.78, loopJ: [J('feed', 0), J('tokens', 1), 7], tower: [X_TRAIN, .04], tags: ['s1', 's2'], show: { corpus: 1, chop: 1 } },
  '1a': { cam: [-10, 9, 22, -8, 2.4, -.6], loopJ: [J('feed', 0), J('feed', .6), 4.4], tower: [X_TRAIN, .04], tags: ['r0', 'r1', 'r2', 'r3', 'r4'], show: { corpus: 1 } },
  '1b': { cam: [4, 5.4, 14, 5, 1.1, .6], loopJ: [J('feed', .5), J('feed', 1), 3.4], ph: .3, tower: [X_TRAIN, .04], tags: ['gate', 'reject'], show: { corpus: 1, chop: 1 } },
  '1c': { cam: [11.5, 5, 13.5, 13.4, 1, 0], loopJ: [J('tokens', 0), J('tokens', .55), 3.8], tower: [X_TRAIN, .04], tags: ['blade', 'ribbon'], show: { corpus: 1, chop: 1 } },
  '1d': { cam: [10, 8, 13.5, 11.5, .6, -2.2], loopJ: [J('tokens', 0), J('tokens', .45), 3.8], tower: [X_TRAIN, .04], tags: ['vision'], show: { corpus: 1, chop: 1, vision: 1 } },
  p2: { cam: [27, 19, 50, 27, 6.5, -2], fov: 30, A: 1.78, loopJ: [J('train-up', 0), J('train-up', 1), 4.6], tower: [X_TRAIN, .06], tags: ['s3', 'cluster'], show: { flicker: .4 } },
  '2a': { cam: [13.5, 11, 36, 25.5, 7, 0], loopJ: [J('tokens', .6), J('train-up', 1), 4.6], ph: .8, tower: [X_TRAIN, [.06, .35]], tags: ['head'], show: { flicker: 1, logits: 1 } },
  '2b': { cam: [41, 13, 34, 27, 7, 0], loopJ: [J('train-up', .6), J('absorb', 1), 3.4], tower: [X_TRAIN, [.35, .65]], tags: ['grad'], show: { flicker: 1, grad: 1, logits: .6 } },
  '2c': { cam: [39, 10, -21, 28, 3, -5], loopJ: [J('train-up', 0), J('train-up', 1), 4.6], tower: [X_TRAIN, [.65, .85]], tags: ['cluster'], show: { flicker: 1, cluster: 1, grad: .6 } },
  '2d': { cam: [12, 6.5, 18, 18.5, 1, 0], loopJ: [J('tokens', .3), J('tokens', 1), 3.2], tower: [X_TRAIN, [.85, 1]], tags: ['ctx'], show: { ctx: 1 }, ctx: [0, 1] },
  p3: { cam: [50, 22, 60, 50, 6.5, -1], fov: 30, A: 1.78, parkJ: J('ship-post', 0), tower: [X_TRAIN, 1], tags: ['s4', 's5'] },
  '3a': { cam: [31, 12, 38, 40, 6.5, 0], parkJ: J('ship-post', .3), tower: [[X_TRAIN, X_POST], 1], tags: ['s4'], show: { sft: 1 } },
  '3b': { cam: [60, 16, 40, 51, 8.6, 0], parkJ: J('ship-post', .7), ph: .6, tower: [X_POST, 1], tags: ['verifier'], show: { rl: 1, grad: .7 } },
  '3c': { cam: [33, 11, 31, 44, 6.5, -3], parkJ: J('ship-post', .8), tower: [X_POST, 1], tags: ['ref', 'cons'], show: { ghost: 1, cons: 1 } },
  '3d': { cam: [54, 11, 43, 50, 8.6, 0], parkJ: J('ship-post', .9), ph: .6, tower: [X_POST, 1], tags: ['verifier'], show: { rl: 1 } },
  '3e': { cam: [70, 9, 39, 58, 8, 0], parkJ: J('ship-rel', .4), tower: [[X_POST, X_REL], 1], tags: ['evals'], show: { scan: 1 }, lamps: [0, 6.2] },
  '3f': { follow: 'tower', off: [8, 12, 40, 0, 7, 0], scrubJ: [J('ship-rel', .55), J('ship-rel', 1)], lamps: L6, tags: [] },
  p4: { cam: [93, 24, 60, 93, 4, -3], fov: 30, A: 1.78, parkJ: J('request', 0), tags: ['s6', 's7', 's8', 's9', 's10', 's11'], lamps: L6 },
  '4a': { cam: [104, 9, 22, 110.5, 1.6, -3.2], loopJ: [J('request', 0), J('request', .75), 5.2], ph: .4, tags: ['screen', 'backtrack'], lamps: L6 },
  '4b': { cam: [68, 6, 14, 74, 1, -.6], loopJ: [J('request', .72), J('serve-up', .2), 4], ph: .7, tags: ['intake'], lamps: L6 },
  '4c': { cam: [74, 9.5, 15, 77.5, .4, 0], loopJ: [J('serve-up', 0), J('serve-up', .45), 4], cache: [X_INTAKE + .6, X_INTAKE + 6.6], tags: ['cache'], lamps: L6 },
  '4d': { cam: [74, 10, 22, 80, 1, 0], loopJ: [J('serve-up', 0), J('serve-up', .5), 4], tags: ['others'], show: { batch: 1 }, lamps: L6 },
  p5: { cam: [102, 12, 40, 86, 7, 0], fov: 30, A: 1.78, loopJ: [J('serve-up', 0), J('serve-up', 1), 4.6], tags: ['s7', 'kv'], lamps: L6 },
  '5a': { cam: [77, 8.5, 23, 86, 1.4, 2], loopJ: [J('serve-up', .36), J('serve-up', .56), 3], tags: ['embed'], show: { embed: 1 }, lamps: L6 },
  '5b': { cam: [100, 10, 34, 86, 7, 0], loopJ: [J('serve-up', .5), J('serve-up', 1), 3.6], tags: ['rod'], lamps: L6 },
  '5c': { cam: [78.5, 9.5, 26, 78.5, 7.4, 4], parkJ: J('serve-up', uAtY('serve-up', 7.4)), tags: ['mask'], show: { attn: 1 }, lamps: L6 },
  '5d': { cam: [78.5, 9.6, 26.5, 78.5, 7.4, 4], parkJ: J('serve-up', uAtY('serve-up', 7.4)), tags: ['blocks', 'window', 'indexer'], show: { attnS: 1 }, lamps: L6 },
  '5e': { cam: [76.5, 10.5, 26, 76.5, 9.2, 4.4], parkJ: J('serve-up', uAtY('serve-up', 9.2)), tags: ['router', 'shared', 'experts'], show: { moe: 1 }, lamps: L6 },
  '5f': { cam: [103, 8, 34, 86, 6.5, 0], loopJ: [J('serve-up', .5), J('serve-up', 1), 3.4], tags: ['layers'], show: { layers: 1 }, lamps: L6 },
  '5g': { cam: [91.5, 17, 12, 86, 13.6, 0], parkJ: J('serve-up', 1), tags: ['lmhead', 'mtp'], show: { logits: 1 }, winner: 1, lamps: L6 },
  p6: { cam: [99, 20, 52, 99, 5, -2], fov: 30, A: 1.78, loopJ: [J('serve-up', 0), J('stream', 1), 7], tags: ['s7', 's8', 's9'], show: { lane: 1 }, lamps: L6 },
  '6a': { cam: [78, 11, 34, 88, 6.5, 1], loopJ: [J('serve-up', 0), J('serve-up', 1), 3.8], ph: .8, tags: ['kv'], kvFill: true, lamps: L6 },
  '6b': { cam: [100, 5.5, 14, 96, .8, -1.8], parkJ: J('decode', 0), hideBead: true, tags: ['thinking', 'notret'], show: { thinking: 1, logits: .8 }, kv: 15, kvTick: true, lamps: L6 },
  '6c': { cam: [98, 9, 26, 90, 6, 0], loopJ: [J('decode', 0), J('decode', 1), 2.6], ph: .7, tags: ['kv'], show: { draft: 1, logits: 1, lane: 1 }, kv: 15, kvTick: true, winner: 1, lamps: L6 },
  '6d': { cam: [88, 6.2, 13.5, 97.5, 1.5, -.2], loopJ: [J('decode', .6), J('stream', .3), 2.8], ph: .7, tags: ['sampler'], show: { lane: 1 }, lamps: L6 },
  '6e': { cam: [106, 5, 17, 110.5, 2, 0], loopJ: [J('stream', .2), J('stream', 1), 3], ph: .95, tags: ['outcls', 'screen'], show: { lane: 1 }, lamps: L6 },
  p7: { cam: [93, 30, 42, 93, 0, -4], fov: 30, A: 1.78, loopJ: [J('tool', 0), J('tool', 1), 6.5], ph: .3, tags: ['s10', 's11'], lamps: L6 },
  '7a': { cam: [111, 11, 5, 104, .4, -8.4], loopJ: [J('tool', 0), J('tool', .45), 4], ph: .6, tags: ['bench'], lamps: L6 },
  '7b': { cam: [88, 13, 9, 84, .5, -5], loopJ: [J('tool', .4), J('tool', 1), 4.4], ph: .4, tags: ['backtrack'], lamps: L6 },
  '7c': { cam: [74, 9.5, 15, 79, .5, 0], loopJ: [J('cached', 0), J('cached', 1), 3], cache: [X_INTAKE - 1.2, X_TOWER - 1.6], tags: ['cache'], lamps: L6 },
  '7d': { cam: [106, 5, 15, 112.5, 2.1, 0], loopJ: [J('answer', .4), J('answer', 1), 4.2], ph: .985, noTok: true, tags: ['screen'], lamps: L6 },
  '7e': { cam: [76, 6, 12, 75.5, .6, 0], parkJ: J('answer', 1), hideBead: true, tags: ['compact'], show: { compact: 1 }, lamps: L6 },
  f1: { follow: 'bead', off: [5.5, 6, 14, 0, 0, 0], scrubJ: [0, 1], A: 1.78, ox: .14, oy: .12, tags: [] },
  ledger: { cam: [51, 60, 152, 51, 2, -3], parkJ: 1, covered: true },
};

/* tag anchors */
const TAGS = {
  s1: ['1 Corpus', () => V3(-13, 6.4, -1.6)], s2: ['2 Tokenizer', () => V3(X_TOK, 2.3, 0)], s3: ['3 Pretraining', () => V3(X_TRAIN, 1.2, 3.6)],
  s4: ['4 Post-training', () => V3(X_POST + 7.2, 6.2, 4.1)], s5: ['5 Release gate', () => V3(X_REL, 16.4, 2.8)], s6: ['6 Request', () => V3(X_INTAKE, 1.6, 0)],
  s7: ['7 Model', () => V3(X_TOWER, 1.2, 3.6)], s8: ['8 Decode', () => V3(X_SAMPLE, 2.2, 0)], s9: ['9 Stream', () => V3(X_STREAM, 1.6, 0)],
  s10: ['10 Tool loop', () => V3(X_BENCH, 1.6, Z_BACK - 2.6)], s11: ['11 Reply', () => V3(X_SCREEN + 2.7, 4.4, 0)],
  r0: ['public web', () => V3(-15.2, 5.9, -3.2)], r1: ['third-party data', () => V3(-15.2, 5.9, -1.6)], r2: ['labelled examples', () => V3(-15.2, 5.9, 0)],
  r3: ['opted-in users', () => V3(-15.2, 5.9, 1.6)], r4: ['generated by Anthropic', () => V3(-15.2, 5.9, 3.2)],
  gate: ['dedupe · filter', () => V3(X_GATE, 2.45, 0)], reject: ['dropped', () => V3(X_GATE + .9, .3, 2.35)],
  blade: ['BPE cut', () => V3(X_TOK, 2.1, 0)], ribbon: ['raw text', () => V3(X_TOK - 5, .32, 0)], vision: ['image → patches', () => V3(X_TOK - 2.6, .6, -3.3)],
  cluster: ['accelerator cluster', () => V3(X_TRAIN, 1.6, -7.5)], head: ['scores for every token', () => V3(State.tower.x, HEAD_Y + 2.1, 0)],
  grad: ['gradients', () => V3(State.tower.x + 2.1, 4.4, 0)], ctx: ['ctx', () => Cluster.bracketLeft().add(V3(0, 1.1, 0))],
  verifier: ['verifier', () => V3(X_POST + 7.2, 6.6, -4.1)], ref: ['reference model', () => V3(X_POST - 6, TOWER_TOP + .4, -3.6)], cons: ['constitution', () => V3(X_POST + 3.8, 2.95, -5.6)],
  evals: ['pre-deployment evals', () => V3(X_REL + .3, 16.3, 0)],
  screen: ['your app', () => V3(X_SCREEN + 2.7, 4.2, 0)], backtrack: ['app resends conversation context', () => V3(X_INTAKE + 14, .2, Z_BACK)],
  intake: ['template · classifiers · tokenizer', () => V3(X_INTAKE + .6, 1.45, 0)],
  cache: ['cached prefix', () => V3(X_INTAKE + 3.6, 1.0, .9)], others: ['other users’ requests', () => V3(X_INTAKE + 6, .95, 1.55)],
  embed: ['one row of the embedding table', () => V3(X_TOWER - 1.4, 1.5, 3.2)], rod: ['residual stream', () => V3(X_TOWER + .05, clamp(State.bead.pos.y - 1.6, 2, 11), .05)],
  query: ['query', () => Callouts.anchors.query()], mask: ['causal mask', () => Callouts.anchors.mask()],
  blocks: ['compressed blocks', () => Callouts.anchors.blocks()], window: ['window · 128', () => Callouts.anchors.window()], indexer: ['indexer picks top-k', () => Callouts.anchors.indexer()],
  router: ['router', () => Callouts.anchors.router()], shared: ['shared expert', () => Callouts.anchors.shared()], experts: ['6 of 384 routed experts', () => Callouts.anchors.experts()],
  layers: ['61 layers', () => V3(X_TOWER - 1.65, 9, 1.65)], lmhead: ['LM head · 129,280 scores', () => V3(X_TOWER, HEAD_Y + 2.3, .2)], mtp: ['MTP draft head', () => V3(X_TOWER + .1, HEAD_Y + .9, -1.05)],
  kv: ['KV cache', () => V3(X_TOWER + 4.4, 1.8, 2.7)], thinking: ['illustrative thinking', () => V3(X_TOWER + 7.5, 1, -1.8)], notret: ['raw reasoning encrypted', () => V3(X_STREAM - 2.6, 1.1, -1.8)],
  sampler: ['sampler', () => V3(X_SAMPLE, 2.05, 0)], outcls: ['output classifiers', () => V3(X_STREAM, 1.35, 0)],
  bench: ['get_weather · your code', () => V3(X_BENCH, 1.45, Z_BACK - 2.6)], compact: ['compacted history', () => V3(X_INTAKE + 3.2, .9, 0)],
};

/* ---------------- state ---------------- */
const SHOW_KEYS = ['corpus', 'chop', 'vision', 'flicker', 'grad', 'cluster', 'ctx', 'logits', 'sft', 'rl', 'ghost', 'cons', 'scan', 'batch', 'embed', 'attn', 'attnS', 'moe', 'layers', 'thinking', 'draft', 'lane', 'compact'];
const State = { t: 0, dt: 0, anim: 0, J: 0, beatId: 'hero', prog: 0, tl: 0, v: Object.fromEntries(SHOW_KEYS.map(k => [k, 0])),
  tower: { x: X_TOWER, trained: 1 }, bead: { pos: V3(0, 0, 0), visible: true, seg: SEGS[0], u: 0 }, mainX: 0, backX: 999, cache: null, kv: 0, ctx: 0, lampsOn: 6,
  headHot: 0, winnerHot: 0, screen: {} };

function towerFromJ(Jv) {
  const sp = SEG['ship-post'], sr = SEG['ship-rel'], tu = SEG['train-up'], ab = SEG['absorb'];
  let x;
  if (Jv < sp.j0) x = X_TRAIN;
  else if (Jv < sp.j1) x = lerp(X_TRAIN, X_POST, ease(clamp(uIn(sp, Jv) / .6)));
  else if (Jv < sr.j1) { const u = uIn(sr, Jv); x = u < .35 ? lerp(X_POST, X_REL, ease(u / .35)) : u < .55 ? X_REL : lerp(X_REL, X_TOWER, ease((u - .55) / .45)); }
  else x = X_TOWER;
  const trained = Jv < tu.j0 ? .05 : Jv < ab.j1 ? lerp(.05, 1, (Jv - tu.j0) / (ab.j1 - tu.j0)) : 1;
  return { x, trained };
}
function kvFromJ(Jv) {
  const s = segAtJ(Jv), u = uIn(s, Jv);
  switch (s.k) { case 'serve-up': return Math.round(14 * u); case 'decode': case 'stream': return 15; case 'tool': return 16;
    case 'cached': return 17; case 'answer': return 17 + Math.round(5 * u); default: return Jv > SEG.answer.j1 - 1e-6 ? 22 : 0; }
}
function screenFromJ(Jv) {
  const s = segAtJ(Jv), u = uIn(s, Jv);
  const call = '{"city": "Paris"}', ans = 'It’s 18 °C and clear in Paris.';
  if (Jv < SEG.request.j0) return { status: 'waiting for input' };
  switch (s.k) {
    case 'request': return { status: 'sending request…' };
    case 'serve-up': return { status: 'prefill…' };
    case 'decode': return { status: 'thinking…' };
    case 'stream': return { call: call.slice(0, Math.max(1, Math.round(call.length * sstep(.3, .95, u)))), stop: u > .9 ? 'stop_reason: "tool_use"' : '' };
    case 'tool': return { call, result: u > .35 ? 'tool_result  {"temp_c": 18, "conditions": "clear"}' : 'running get_weather…', stop: 'stop_reason: "tool_use"' };
    case 'cached': return { call, result: 'tool_result  {"temp_c": 18, "conditions": "clear"}', status: beamCacheBust ? 'cache bust · full prompt prefill' : 'cache hit · prefill new tokens' };
    case 'answer': { const k = Math.round(ans.length * sstep(.55, .98, u)); return { call, result: 'tool_result  {"temp_c": 18, "conditions": "clear"}', answer: ans.slice(0, k), stop: u > .97 ? 'stop_reason: "end_turn"' : '' }; }
  }
  return {};
}


const openingCam = [-18, 23, 38, 11, 4.8, 0];
const openingTight = [-18, 10.5, 18, -4.2, 2.0, 0];

const SUB_BEATS = {
  '3.3': ['2b', '2c'],
  '4.2': ['3b', '3d'],
  '7.2': ['5d', '5c'],
  '7.4': ['5b', '5f'],
  '12.2': ['7c', '7b']
};

function locate(state) {
  let beatKey = state.spatialBeat;
  const rawU = clamp(state.recap ? (state.overallT ?? state.localT ?? 0) : (state.localT ?? 0));
  let u = rawU;
  if (!state.opening && !state.recap && !state.overview && state.stepId && SUB_BEATS[state.stepId] && beatKey === SUB_BEATS[state.stepId][0]) {
    const pair = SUB_BEATS[state.stepId];
    if (rawU >= 0.55) {
      beatKey = pair[1];
      u = (rawU - 0.55) / 0.45;
    } else {
      u = rawU / 0.55;
    }
  }
  const b = (state.opening || state.overview) ? B.hero : state.recap ? B.f1 : B[beatKey] || B.hero;
  const j = (state.opening || state.overview) ? J('feed', .42)
    : b.scrubJ ? lerp(b.scrubJ[0], b.scrubJ[1], b === B.f1 ? sstep(.04, .9, u) : u)
    : b.loopJ ? lerp(b.loopJ[0], b.loopJ[1], u)
    : b.parkJ ?? 0;
  return { b, u, j };
}

function update(state, aspect, viewportWidth) {
  const { b, u, j } = locate(state);
  const compact = (typeof window !== 'undefined' ? window.innerWidth < 768 : viewportWidth < 500) || aspect < .85;
  const corpusOpening = !!state.opening && compact;
  const settings = state.settings || {};
  const S = State;
  S.prog = u;
  S.anim = u * (b.loopJ?.[2] ?? 4) + .8;
  S.dt = 1;
  S.J = j;
  beamCacheBust = settings.cache === 'miss';
  const segment = segAtJ(j);
  const sk = segment.k;
  const t = uIn(segment, j);
  S.bead.seg = segment;
  S.bead.u = t;

  S.tower = towerFromJ(j);
  if (b.tower) {
    const [pos, trained] = b.tower;
    S.tower.x = Array.isArray(pos) ? lerp(...pos, ease(clamp(u / .7))) : pos;
    S.tower.trained = Array.isArray(trained) ? lerp(...trained, u) : trained;
  }

  let scale = state.opening ? 1.42 : 1;
  if (segment.c) {
    S.bead.pos.copy(segment.c.getPointAt(t));
    const tangent = segment.c.getTangentAt(t);
    bead.rotation.y = Math.abs(tangent.y) > .8 ? 0 : Math.atan2(-tangent.z, tangent.x);
  } else {
    S.bead.pos.set(S.tower.x, TOWER_TOP + .4, 0);
    if (sk === 'absorb') scale *= 1 - .85 * sstep(.2, .9, t);
  }
  if (sk === 'cached') scale *= 1 - .45 * sstep(.6, 1, t);
  if (sk === 'answer' || sk === 'stream') scale *= 1 - .65 * sstep(.9, .985, t);
  S.bead.visible = !b.hideBead && (!!segment.c || sk === 'absorb');
  bead.visible = S.bead.visible;
  bead.position.copy(S.bead.pos);
  bead.scale.setScalar(scale);

  S.mainX = ({ feed: Math.max(-4, S.bead.pos.x), tokens: S.bead.pos.x,
    'train-up': Math.min(S.bead.pos.x, X_TRAIN), absorb: X_TRAIN, 'ship-post': S.tower.x,
    'ship-rel': S.tower.x, request: X_TOWER, 'serve-up': X_TOWER,
    decode: Math.max(X_TOWER, S.bead.pos.x), stream: Math.max(X_TOWER, S.bead.pos.x),
    tool: X_SCREEN, cached: X_SCREEN, answer: X_SCREEN })[sk];
  S.backX = sk === 'request' || sk === 'tool'
    ? (S.bead.pos.z < -5.5 ? S.bead.pos.x : (t < .5 ? 999 : X_INTAKE - 1.3))
    : (['cached', 'answer'].includes(sk) ? X_INTAKE - 1.3 : 999);
  S.cache = b.cache || (['cached', 'answer'].includes(sk) && b === B.f1 ? [X_INTAKE - 1.2, X_TOWER - 1.6] : null);
  const effort = { low: 3, medium: 5, high: 7, xhigh: 9, max: 11 }[settings.effort] ?? 7;
  S.effort = effort;
  S.kv = b.kv !== undefined ? b.kv + (b.kvTick ? Math.round(effort * u) : 0)
    : b.kvFill ? Math.round(14 * clamp(uIn(SEG['serve-up'], j) / SEG['serve-up'].floorEnd)) : kvFromJ(j);
  S.ctx = b.ctx ? lerp(b.ctx[0], b.ctx[1], sstep(.1, .8, u)) : 0;
  S.lampsOn = b.lamps ? lerp(b.lamps[0], b.lamps[1], sstep(.1, .85, u))
    : clamp(uIn(SEG['ship-rel'], j) * 2) * 6;
  S.headHot = ((sk === 'train-up' || sk === 'serve-up') && t > .85) || sk === 'absorb'
    || ((sk === 'decode' || sk === 'answer') && t < .25) ? 1 : 0;
  S.winnerHot = b.winner || (sk === 'decode' && t < .2) || (sk === 'answer' && t < .15) ? 1 : 0;
  S.screen = screenFromJ(j);
  for (const key of SHOW_KEYS) S.v[key] = b.show?.[key] ?? 0;
  if (b === B.hero || b === B.f1) {
    Object.assign(S.v, { corpus: 1, chop: 1, grad: +(sk === 'absorb'), lane: 1,
      flicker: +(sk === 'train-up' || sk === 'absorb'), thinking: +(sk === 'decode'), scan: +(sk === 'ship-rel') });
  }
  if (b === B['5d'] && settings.kv === 'dense') {
    S.v.attn = 1;
    S.v.attnS = 0;
  }

  trainCorpus.hide(); trainPrompt.hide(); trainResend.hide(); trainAnswer.hide();
  if (S.bead.visible) {
    switch (sk) {
      case 'tokens': trainCorpus.place(segment, t, scale); break;
      case 'train-up': trainCorpus.place(segment, t, scale); break;
      case 'request': trainPrompt.place(segment, t, scale); break;
      case 'serve-up': trainPrompt.place(segment, t, scale); break;
      case 'tool':
      case 'cached':
        trainResend.list.at(-1).p.hideAfterX = sk === 'tool' ? X_BENCH : undefined;
        trainResend.place(segment, t, scale);
        break;
      case 'answer': trainAnswer.place(segment, t, scale); break;
    }
  }

  Track.update(S); Corpus.update(S); Tokenizer.update(S); Tower.update(S); Cluster.update(S);
  Post.update(S); Gate.update(S); Serve.update(S); Callouts.update(S);
  Tokenizer.g.visible = Tower.g.visible = Serve.g.visible = !corpusOpening;
  bead.userData.halo.material.opacity = .6;

  let shot = b.cam || B.hero.cam;
  if (state.opening) shot = compact ? openingTight : openingCam;
  const eye = V3(...shot.slice(0, 3));
  const target = V3(...shot.slice(3));
  if (b.follow) {
    const [x, y, z, tx, ty, tz] = b.off;
    if (b.follow === 'tower') {
      eye.set(S.tower.x + x, y, z);
      target.set(S.tower.x + tx, ty, tz);
    } else {
      target.copy(S.bead.visible ? S.bead.pos : V3(S.tower.x, 6.5, 0));
      eye.copy(target).add(V3(x, target.y > 3 ? 3 : y, z));
    }
  }

  const offset = eye.sub(target);
  if (state.camera === 'overhead') {
    const distance = offset.length();
    offset.setLength(distance * .48);
    offset.y = distance * .88;
  } else if (!state.opening && state.present && aspect < 0.9) {
    // Frame the tracked token together with this beat's explanatory anchors.
    // A landscape shot's fixed target can put the token beyond a portrait edge.
    const points = [];
    if (bead.visible) {
      const half = V3(TOKW * scale / 2, .34 * scale / 2, .34 * scale / 2);
      for (let corner = 0; corner < 8; corner++) points.push(S.bead.pos.clone().add(V3(
        corner & 1 ? half.x : -half.x, corner & 2 ? half.y : -half.y, corner & 4 ? half.z : -half.z)));
    }
    for (const tag of b.tags || []) if (TAGS[tag]) points.push(TAGS[tag][1]());
    if (!points.length) points.push(target.clone());
    target.copy(new THREE.Box3().setFromPoints(points).getCenter(V3(0, 0, 0)));
    const back = offset.clone().normalize();
    const right = V3(0, 1, 0).cross(back).normalize();
    const up = back.clone().cross(right);
    const tanV = Math.tan(THREE.MathUtils.degToRad(b.fov || 30) / 2);
    let distance = offset.length();
    for (const point of points) {
      const relative = point.clone().sub(target);
      distance = Math.max(distance, relative.dot(back) + Math.abs(relative.dot(right)) / (tanV * aspect * .82),
        relative.dot(back) + Math.abs(relative.dot(up)) / (tanV * .72));
    }
    offset.setLength(distance);
  } else if (!state.opening && (state.camera === 'close' || compact)) {
    offset.multiplyScalar(compact ? .79 : .69);
  }
  // Wide overview shots gain enough depth to fit the hall in nearly square plates.
  if (b.A && !state.opening && !state.recap && !compact) {
    offset.multiplyScalar(Math.max(1, Math.sqrt(b.A / aspect)));
  }
  // Fitting always starts from the same projection, including after resize or
  // leaving the corpus close-up. Do not measure through the previous fit.
  camera.zoom = 1;
  camera.fov = state.opening ? 34 : (b.fov || 30);
  camera.aspect = aspect;
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
  if (state.recap || state.present) camera.setViewOffset(1000 * aspect, 1000, 0, -85, 1000 * aspect, 1000);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  let activeCoverage;
  if (corpusOpening) {
    const extent = theme.projectedExtent(THREE, Corpus.g, camera);
    const center = extent.getCenter(new THREE.Vector2());
    const size = extent.getSize(new THREE.Vector2());
    camera.zoom = Math.min(1.3 / size.y, 1.76 / size.x);
    camera.setViewOffset(1000 * aspect, 1000, center.x * 500 * aspect * camera.zoom, -center.y * 500 * camera.zoom, 1000 * aspect, 1000);
    activeCoverage = size.y * camera.zoom / 2;
  }
  scene.fog.near = offset.length() * 1.4;
  scene.fog.far = offset.length() * 4;

  const tags = b.tags || [];
  const tag = tags[Math.min(tags.length - 1, Math.floor(u * tags.length))];
  if (tag && TAGS[tag]) {
    const [label, getAnchor] = TAGS[tag];
    return { anchor: getAnchor(), label: b === B['5d'] && settings.kv === 'dense' ? 'dense attention' : label };
  }
  return S.bead.visible ? { anchor: S.bead.pos, label: '“ Paris”', activeCoverage }
    : { anchor: V3(S.tower.x, TOWER_TOP, 0), label: 'model weights' };
}

return { scene, camera, update, setRouting: Callouts.setRouting };
}

window.ReaderSpatial = Object.freeze({ create });
})();
