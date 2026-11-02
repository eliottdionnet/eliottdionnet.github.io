// ===========================================================================
// mri.js — la physique du livre, en un seul endroit.
// Toutes les équations ici sont celles écrites dans les chapitres (mêmes
// numéros d'équation en commentaire). Temps en ms, angles en degrés.
// Dépend de tissus.js (window.TISSUS) et, pour les images, de data/cerveau.js.
// ===========================================================================
(function () {
  "use strict";
  const MRI = {};
  const DEG = Math.PI / 180;
  MRI.T = window.TISSUS;
  MRI.ids = ["sb", "sg", "lcr", "gr", "les", "mu"];
  MRI.GAMMA_BAR = 42.577;            // MHz/T
  MRI.FAT_PPM = -3.4;                // pic principal (méthylène) de la graisse vs eau
  MRI.fatHz = (B0) => MRI.FAT_PPM * MRI.GAMMA_BAR * B0;   // Hz (≈ -434 Hz à 3 T)

  // ------------------------------------------------------------ relaxation
  // (eq-mz) Mz(t) = M0 + (Mz(0) - M0) e^{-t/T1}      (eq-mxy) Mxy(t) = Mxy(0) e^{-t/T2}
  MRI.mz = (t, T1, mz0 = 0, M0 = 1) => M0 + (mz0 - M0) * Math.exp(-t / T1);
  MRI.mxy = (t, T2, m0 = 1) => m0 * Math.exp(-t / T2);

  // ------------------------------------------------------- équations de signal
  // Écho de spin, 90° : (eq-se)  S = DP (1 - e^{-TR/T1}) e^{-TE/T2}
  MRI.se = (t, TR, TE) => t.DP * (1 - Math.exp(-TR / t.T1)) * Math.exp(-TE / t.T2);
  // Écho de gradient déphasé (spoiled GRE), régime permanent : (eq-spgr)
  //   S = DP sin(α) (1 - E1) / (1 - cos(α) E1) · e^{-TE/T2*},  E1 = e^{-TR/T1}
  MRI.spgr = (t, TR, TE, a) => {
    const E1 = Math.exp(-TR / t.T1), ar = a * DEG;
    return t.DP * Math.sin(ar) * (1 - E1) / (1 - Math.cos(ar) * E1) * Math.exp(-TE / t.T2s);
  };
  // Aimantation longitudinale en régime permanent (avant chaque impulsion)
  MRI.mzss = (T1, TR, a) => { const E1 = Math.exp(-TR / T1); return (1 - E1) / (1 - Math.cos(a * DEG) * E1); };
  // Angle d'Ernst : (eq-ernst) cos(α_E) = e^{-TR/T1}
  MRI.ernst = (TR, T1) => Math.acos(Math.exp(-TR / T1)) / DEG;
  // Inversion-récupération (lecture écho de spin), signal SIGNÉ : (eq-ir)
  //   S = DP (1 - 2 e^{-TI/T1} + e^{-TR/T1}) e^{-TE/T2}     (magnitude = |S|)
  MRI.ir = (t, TR, TE, TI) => t.DP * (1 - 2 * Math.exp(-TI / t.T1) + Math.exp(-TR / t.T1)) * Math.exp(-TE / t.T2);
  MRI.irMz = (T1, TR, TI) => 1 - 2 * Math.exp(-TI / T1) + Math.exp(-TR / T1);
  // Temps d'annulation : (eq-tinull) TI_null = T1 [ln 2 - ln(1 + e^{-TR/T1})]  (-> T1 ln2 si TR >> T1)
  MRI.tiNull = (T1, TR = Infinity) => T1 * (Math.LN2 - Math.log(1 + Math.exp(-TR / T1)));
  // TE (ou TR) qui maximise la différence de signal entre 2 tissus A et B :
  //   (eq-te-opt) TE* = ln[(DP_A/T2_A)/(DP_B/T2_B)] / (1/T2_A - 1/T2_B)
  MRI.optTE = (A, B, key = "T2") => Math.log((A.DP / A[key]) / (B.DP / B[key])) / (1 / A[key] - 1 / B[key]);
  MRI.optTR = (A, B) => Math.log((A.DP / A.T1) / (B.DP / B.T1)) / (1 / A.T1 - 1 / B.T1);

  // ------------------------------------------------------ agents de contraste
  // (eq-relaxivite) 1/T_i = 1/T_i,0 + r_i [C]   (r en L·mmol⁻¹·s⁻¹ = mM⁻¹s⁻¹, C en mM)
  MRI.AGENTS = {
    gadobutrol:  { nom: "Gadobutrol (Gd)", r1: 5.0, r2: 7.1 },
    gddtpa:      { nom: "Gd-DTPA (Gd)",    r1: 3.7, r2: 5.2 },
    ferumoxytol: { nom: "Ferumoxytol (USPIO)", r1: 9.5, r2: 65 },
  };
  MRI.withAgent = function (t, C, ag) {
    if (!C) return t;
    const k = C / 1000; // (mM · mM⁻¹s⁻¹) = s⁻¹ -> ms⁻¹
    const r2s = 1 / t.T2s - 1 / t.T2;   // part réversible (T2') inchangée
    const T2 = 1 / (1 / t.T2 + ag.r2 * k);
    return Object.assign({}, t, {
      T1: 1 / (1 / t.T1 + ag.r1 * k),
      T2: T2,
      T2s: 1 / (1 / T2 + r2s),
    });
  };

  // ------------------------------------------------ rotations (simulateur Bloch)
  // Rotation d'angle `a` (rad) autour d'un axe unitaire du plan transverse
  // faisant l'angle `phi` avec x (phi = 0 : axe x, phi = 90° : axe y).
  MRI.rotRF = function (m, a, phi) {
    const ux = Math.cos(phi), uy = Math.sin(phi);
    const c = Math.cos(a), s = Math.sin(a), [x, y, z] = m;
    const dot = ux * x + uy * y;
    // Rodrigues : v c + (u × v) s + u (u·v)(1-c)
    return [
      x * c + (uy * z) * s + ux * dot * (1 - c),
      y * c + (-ux * z) * s + uy * dot * (1 - c),
      z * c + (ux * y - uy * x) * s,
    ];
  };
  // Précession libre (référentiel tournant) d'un angle `p` rad autour de z
  MRI.rotZ = (m, p) => { const c = Math.cos(p), s = Math.sin(p); return [m[0] * c - m[1] * s, m[0] * s + m[1] * c, m[2]]; };
  // Quantiles d'une distribution d'offsets (Hz) — déterministes, pas de hasard
  MRI.quantile = function (q, width, kind = "lorentz") {
    if (kind === "lorentz") return width * Math.tan(Math.PI * (q - 0.5));                          // HWHM = width
    if (kind === "gauss") return width * Math.SQRT2 * erfinv(2 * q - 1) / Math.sqrt(2 * Math.LN2);  // HWHM = width
    return width * (2 * q - 1);                                                                     // uniforme ±width
  };
  MRI.offsets = function (n, width, kind = "lorentz") {
    const out = [];
    for (let i = 0; i < n; i++) out.push(MRI.quantile((i + 0.5) / n, width, kind));
    return out;
  };
  // Atténuation du signal d'un voxel due à la distribution d'offsets (t en ms) :
  //   lorentzienne -> exp(-2π·w·t)  (exponentielle : définit T2')
  //   gaussienne   -> exp(-(2πσt)²/2), σ = w / sqrt(2 ln 2)
  MRI.dephasing = function (t, width, kind = "lorentz") {
    const ts = t / 1000;
    if (kind === "lorentz") return Math.exp(-2 * Math.PI * width * ts);
    const sg = width / Math.sqrt(2 * Math.LN2);
    return Math.exp(-0.5 * Math.pow(2 * Math.PI * sg * ts, 2));
  };
  function erfinv(x) { // approximation de Giles, suffisante ici
    let w = -Math.log((1 - x) * (1 + x)), p;
    if (w < 5) { w -= 2.5; p = 2.81022636e-08; p = 3.43273939e-07 + p * w; p = -3.5233877e-06 + p * w; p = -4.39150654e-06 + p * w; p = 0.00021858087 + p * w; p = -0.00125372503 + p * w; p = -0.00417768164 + p * w; p = 0.246640727 + p * w; p = 1.50140941 + p * w; }
    else { w = Math.sqrt(w) - 3; p = -0.000200214257; p = 0.000100950558 + p * w; p = 0.00134934322 + p * w; p = -0.00367342844 + p * w; p = 0.00573950773 + p * w; p = -0.0076224613 + p * w; p = 0.00943887047 + p * w; p = 1.00167406 + p * w; p = 2.83297682 + p * w; }
    return p * x;
  }

  // ------------------------------------------------------------ cerveau simulé 2D
  let _F = null;
  MRI.cerveau = function () {
    if (_F) return _F;
    const src = window.CERVEAU;
    if (!src) throw new Error("data/cerveau.js non chargé");
    const n = src.w * src.h, F = { w: src.w, h: src.h, B0: src.B0, f: {} };
    for (const [k, m] of Object.entries(src.cartes)) {
      const bin = atob(m.b64), a = new Float32Array(n);
      for (let i = 0; i < n; i++) a[i] = m.lo + (bin.charCodeAt(i) / 255) * (m.hi - m.lo);
      if (MRI.ids.includes(k)) F.f[k] = a; else F[k] = a;
    }
    // La carte de champ df est codée sur 8 bits (pas de ≈ 0,6 Hz) : dans les zones où le champ
    // varie lentement, ces marches dessineraient des rayures sur les images de phase. On les lisse
    // là où le voisinage 5×5 ne s'écarte pas de plus de 2,5 pas (veines et sinus restent intacts).
    if (F.df && src.cartes.df) {
      const pas = (src.cartes.df.hi - src.cartes.df.lo) / 255, w = F.w, h = F.h, d0 = F.df, d1 = new Float32Array(n);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; let sm = 0, c = 0, ok = true;
        for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy)), xx = Math.min(w - 1, Math.max(0, x + dx)), v = d0[yy * w + xx];
          if (Math.abs(v - d0[i]) > 2.5 * pas) { ok = false; break; }
          sm += v; c++;
        }
        d1[i] = ok ? sm / c : d0[i];
      }
      F.df = d1;
    }
    // masque "tête" (pour l'affichage de la phase) + bruit gaussien FIXE
    // (même tirage à chaque rendu : l'image ne scintille pas quand on bouge un curseur)
    F.head = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (const k of MRI.ids) s += F.f[k][i]; F.head[i] = s; }
    let seed = 12345;
    const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let r = Math.imul(seed ^ (seed >>> 15), 1 | seed); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };   // mulberry32
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    F.nr = new Float32Array(n); F.ni = new Float32Array(n);
    for (let i = 0; i < n; i++) { F.nr[i] = gauss(); F.ni[i] = gauss(); }
    _F = F;
    return F;
  };

  // Simule une image complexe du cerveau simulé.
  // p = {seq: "SE"|"GRE"|"IR", TR, TE, alpha, TI, C (mM de l'agent dans la lésion),
  //      agent, noise (écart-type, M0 = 1), fatShift (bool, GRE), tissus (surcharges)}
  // Retourne {re, im, mag} (Float32Array).
  MRI.simuler = function (p) {
    const F = MRI.cerveau(), n = F.w * F.h;
    const re = new Float32Array(n), im = new Float32Array(n), mag = new Float32Array(n);
    const ag = MRI.AGENTS[p.agent || "gadobutrol"];
    const fHz = MRI.fatHz(F.B0);
    const TEs = p.TE / 1000;
    // Signal par tissu (réel), phase additionnelle éventuelle (graisse)
    const S = {}, ph = {};
    for (const k of MRI.ids) {
      let t = Object.assign({}, MRI.T[k], (p.tissus && p.tissus[k]) || {});
      if (k === "les" && p.C) t = MRI.withAgent(t, p.C, ag);
      if (p.seq === "GRE") S[k] = MRI.spgr(t, p.TR, p.TE, p.alpha);
      else if (p.seq === "IR") S[k] = MRI.ir(t, p.TR, p.TE, p.TI);
      else S[k] = MRI.se(t, p.TR, p.TE);
      ph[k] = (p.seq === "GRE" && k === "gr" && p.fatShift !== false) ? 2 * Math.PI * fHz * TEs : 0;
    }
    const sig = p.noise == null ? 0.004 : p.noise;
    const gre = p.seq === "GRE";
    for (let i = 0; i < n; i++) {
      let r = 0, q = 0;
      for (const k of MRI.ids) {
        const f = F.f[k][i];
        if (f === 0) continue;
        r += f * S[k] * Math.cos(ph[k]);
        q += f * S[k] * Math.sin(ph[k]);
      }
      if (gre) {
        // perte par gradient de champ à travers la coupe + R2' des veines + phase ΔB0
        const x = F.g[i] * TEs;
        const sinc = x < 1e-6 ? 1 : Math.abs(Math.sin(Math.PI * x) / (Math.PI * x));
        const att = sinc * Math.exp(-F.r2p[i] * TEs);
        const phi = 2 * Math.PI * F.df[i] * TEs;
        const c = Math.cos(phi), s = Math.sin(phi);
        const rr = (r * c - q * s) * att, qq = (r * s + q * c) * att;
        r = rr; q = qq;
      }
      r += sig * F.nr[i]; q += sig * F.ni[i];
      re[i] = r; im[i] = q; mag[i] = Math.hypot(r, q);
    }
    return { re, im, mag, S };
  };

  // Affichage d'une image du cerveau simulé dans un rectangle (ratio conservé)
  // o = {lo, hi, cmap, label, sub}
  MRI.dessiner = function (ctx, data, rect, o = {}) {
    const F = MRI.cerveau();
    const top = o.label ? 18 : 0, bot = o.sub ? 16 : 0;
    const r = UI.image(ctx, data, F.w, F.h, { x: rect.x, y: rect.y + top, w: rect.w, h: rect.h - top - bot }, o);
    if (o.label) UI.text(ctx, o.label, r.x + r.w / 2, rect.y + 8, { color: UI.css("--ink"), size: 12.5, weight: "600", align: "center" });
    if (o.sub) UI.text(ctx, o.sub, r.x + r.w / 2, r.y + r.h + 9, { color: UI.css("--ink2"), size: 11, align: "center" });
    return r;
  };
  MRI.fenetre = (arr, p = 0.997) => Math.max(1e-6, UI.percentile(arr, p));

  window.MRI = MRI;
})();
