// ===========================================================================
// abdomen.js — coupe axiale d'abdomen simulée, à hauteur du foie, pour la
// séparation eau/graisse (méthode Dixon). Le cerveau ne contient pas de graisse
// mélangée à l'eau, l'abdomen si : foie gras, moelle osseuse, graisse pure.
// Géométrie construite ici (ellipses), sans fichier de données.
// Convention radiologique : la droite du patient est à gauche de l'image,
// l'avant (ventre) est en haut. Dépend de mri.js (MRI.fatHz).
// ===========================================================================
(function () {
  "use strict";
  const W = 220, H = 160, SS = 4;                  // pixels, sur-échantillonnage (volume partiel)
  // S : signal total W + F (densité de protons relative), ff : fraction de graisse
  const TISSUS = {
    sc:   { nom: "graisse sous-cutanée", S: 1.0, ff: 0.95 },
    mur:  { nom: "paroi musculaire", S: 0.7, ff: 0.05 },
    visc: { nom: "graisse viscérale", S: 1.0, ff: 0.9 },
    foie: { nom: "foie gras", S: 0.8, ff: 0.22 },
    rate: { nom: "rate", S: 0.85, ff: 0 },
    est:  { nom: "paroi de l'estomac", S: 0.7, ff: 0 },
    air:  { nom: "air", S: 0, ff: 0 },
    anse: { nom: "intestin", S: 0.65, ff: 0 },
    sang: { nom: "vaisseaux", S: 0.9, ff: 0 },
    os:   { nom: "moelle de la vertèbre", S: 0.85, ff: 0.4 },
    lcr:  { nom: "canal rachidien", S: 1.0, ff: 0 },
    musc: { nom: "muscles du dos", S: 0.75, ff: 0.08 },
  };
  const ell = (x, y, cx, cy, rx, ry, rot = 0) => {
    const c = Math.cos(rot), s = Math.sin(rot), dx = x - cx, dy = y - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    return u * u + v * v <= 1;
  };
  const anses = [[124, 88, 7], [139, 100, 6.5], [116, 100, 5.5], [146, 82, 5], [130, 76, 5]];
  // tissu au point (x, y) : le dernier test vrai l'emporte
  function tissu(x, y) {
    let t = null;
    if (ell(x, y, 110, 82, 100, 70)) t = "sc";
    if (ell(x, y, 110, 82, 90, 61)) t = "mur";
    if (ell(x, y, 110, 82, 86, 57)) {
      t = "visc";
      if (ell(x, y, 72, 76, 50, 46) || ell(x, y, 106, 58, 26, 16)) t = "foie";
      for (const [cx, cy, r] of anses) if (ell(x, y, cx, cy, r, r)) t = "anse";
      if (ell(x, y, 170, 94, 16, 25, -0.5)) t = "rate";
      if (ell(x, y, 152, 58, 20, 14)) t = ell(x, y, 152, 58, 17, 11) ? "air" : "est";
      if (ell(x, y, 98, 104, 6, 6) || ell(x, y, 122, 108, 5, 5)) t = "sang";   // veine cave, aorte
    }
    if (ell(x, y, 110, 126, 12, 12)) t = "os";
    if (ell(x, y, 110, 142, 4, 4)) t = "lcr";
    if (ell(x, y, 91, 141, 13, 9) || ell(x, y, 129, 141, 13, 9)) t = "musc";
    return t;
  }

  // Cartes : eau, graisse (avec volume partiel), tissu « pur » de chaque pixel
  const N = W * H, Wm = new Float32Array(N), Fm = new Float32Array(N), pur = new Array(N).fill(null);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let w = 0, f = 0, t0, seul = true;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const t = tissu(x + (i + 0.5) / SS, y + (j + 0.5) / SS);
      if (i === 0 && j === 0) t0 = t; else if (t !== t0) seul = false;
      if (!t) continue;
      w += TISSUS[t].S * (1 - TISSUS[t].ff); f += TISSUS[t].S * TISSUS[t].ff;
    }
    const k = y * W + x;
    Wm[k] = w / (SS * SS); Fm[k] = f / (SS * SS);
    if (seul) pur[k] = t0;
  }
  // Carte de champ (Hz) : léger gradient résiduel + perturbation autour de l'air de l'estomac
  const df = new Float32Array(N), masque = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, d = Math.hypot(x + 0.5 - 152, (y + 0.5 - 58) * 1.3);
    df[k] = 0.25 * (x - 110) + 200 * Math.min(1, Math.pow(19 / Math.max(d, 1), 3));
    masque[k] = Wm[k] + Fm[k] > 0.05 ? 1 : 0;
  }
  // Bruit gaussien complexe FIXE (même tirage à chaque rendu)
  let seed = 4242;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let r = Math.imul(seed ^ (seed >>> 15), 1 | seed); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const nr = new Float32Array(N), ni = new Float32Array(N);
  for (let i = 0; i < N; i++) { nr[i] = gauss(); ni[i] = gauss(); }

  const ABDO = { w: W, h: H, TISSUS, W: Wm, F: Fm, pur, df, masque, B0: 3 };
  // Image complexe à TE (ms) : S = (W + F e^{i2π Δf_graisse TE}) e^{i2π (Δf_B0 + décalage) TE} + bruit
  ABDO.simuler = function (TE, o = {}) {
    const te = TE / 1000, pg = 2 * Math.PI * MRI.fatHz(ABDO.B0) * te, cg = Math.cos(pg), sg = Math.sin(pg);
    const off = o.off || 0, sig = o.noise == null ? 0.01 : o.noise;
    const re = new Float32Array(N), im = new Float32Array(N), mag = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Wm[i] + Fm[i] * cg, b = Fm[i] * sg, p = 2 * Math.PI * (df[i] + off) * te, c = Math.cos(p), s = Math.sin(p);
      re[i] = a * c - b * s + sig * nr[i]; im[i] = a * s + b * c + sig * ni[i]; mag[i] = Math.hypot(re[i], im[i]);
    }
    return { re, im, mag };
  };
  // Moyenne d'une carte sur les pixels « purs » d'un tissu
  ABDO.moyenne = function (carte, t) {
    let s = 0, n = 0;
    for (let i = 0; i < N; i++) if (pur[i] === t) { s += carte[i]; n++; }
    return n ? s / n : NaN;
  };
  // Affichage dans un rectangle (ratio conservé), comme MRI.dessiner
  ABDO.dessiner = function (ctx, data, rect, o = {}) {
    const top = o.label ? 18 : 0, bot = o.sub ? 16 : 0;
    const r = UI.image(ctx, data, W, H, { x: rect.x, y: rect.y + top, w: rect.w, h: rect.h - top - bot }, o);
    if (o.label) UI.text(ctx, o.label, r.x + r.w / 2, rect.y + 8, { color: UI.css("--ink"), size: 12.5, weight: "600", align: "center" });
    if (o.sub) UI.text(ctx, o.sub, r.x + r.w / 2, r.y + r.h + 9, { color: UI.css("--ink2"), size: 11, align: "center" });
    return r;
  };
  window.ABDO = ABDO;
})();
