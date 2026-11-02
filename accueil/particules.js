// Champ de particules de l'accueil. Au repos chaque point suit un processus
// d'Ornstein-Uhlenbeck. Au survol d'un lien les points dessinent ce qu'il y a derrière.
// Le panneau Contact se ferme d'un clic ailleurs ou avec Échap
(() => {
  const d = document.querySelector("details.contact");
  if (!d) return;
  document.addEventListener("click", (e) => { if (d.open && !d.contains(e.target)) d.open = false; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") d.open = false; });
})();

(() => {
  const cv = document.getElementById("champ");
  // entrées du menu (thèmes et portfolio) et projets dépliés sous un thème, chacun avec sa forme
  const entrees = [...document.querySelectorAll("[data-forme]")];
  const projets = [...document.querySelectorAll("li[data-forme-sous]")];
  const themeDe = {};
  entrees.forEach((e) => {
    themeDe[e.dataset.forme] = e;
    e.querySelectorAll("[data-forme-sous]").forEach((s) => { themeDe[s.dataset.formeSous] = e; });
  });
  const menu = document.querySelector(".menu");
  const legende = document.getElementById("legende");
  if (!cv) return;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const etroit = () => innerWidth < 860;
  const N = etroit() ? 3600 : 7000;
  const FORMES = ["repos", "irm", "abstractviz", "rapport", "classification", "slic", "quantique", "robot", "schemas", "portfolio"];
  const LEGENDES = {
    repos: "Au repos, chaque point suit un processus d'Ornstein-Uhlenbeck.",
    irm: "Une coupe de cerveau simulée, tirée du livre.",
    abstractviz: "Des groupes de tableaux, comme sur la carte d'AbstractViz.",
    portfolio: "Une page de CV.",
    rapport: "Le rapport du projet, page par page.",
    classification: "Treize classes aux effectifs très inégaux, comme dans les données du projet.",
    slic: "Des superpixels : une grille de centres qui se cale sur l'image, comme dans SLIC.",
    quantique: "Le circuit du test DCP : deux échantillons, deux QFT, une porte CNOT.",
    robot: "L'arène quadrillée, cinq robots au départ et le trajet de l'un d'eux.",
    schemas: "Euler explicite sur un oscillateur : la spirale s'éloigne du cercle exact.",
  };

  const rnd = Math.random;
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

  // état des particules
  const X = new Float32Array(N), Y = new Float32Array(N), VX = new Float32Array(N), VY = new Float32Array(N);
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  const S = new Float32Array(N), K = new Float32Array(N), BASC = new Float64Array(N);
  const OUx = new Float32Array(N), OUy = new Float32Array(N), MUx = new Float32Array(N), MUy = new Float32Array(N);
  const cible = {}, couleur = {};
  let W = 0, H = 0, dpr = 1;

  // ---------- formes (coordonnées normalisées dans [-1, 1]) ----------

  function formeRepos() {
    const t = new Float32Array(2 * N), c = new Float32Array(3 * N);
    const froid = [0.52, 0.66, 0.8], ambre = hex("#f2b62a");
    for (let i = 0; i < N; i++) {
      MUx[i] = etroit() ? rnd() : 1 - 0.97 * Math.pow(rnd(), 1.7); MUy[i] = rnd();
      OUx[i] = MUx[i]; OUy[i] = MUy[i];
      const a = rnd() < 0.04 ? ambre : froid, k = 0.35 + 0.4 * rnd();
      c.set([a[0] * k, a[1] * k, a[2] * k], 3 * i);
    }
    cible.repos = t; couleur.repos = c;
  }

  function formeAmas() {
    const t = new Float32Array(2 * N), c = new Float32Array(3 * N);
    const amas = [
      [-0.55, -0.42, 0.17, 0.11, 0.5, "#e0a43a"], [0.18, -0.6, 0.2, 0.1, -0.2, "#4c7bd9"],
      [0.62, -0.02, 0.13, 0.16, 0.3, "#d2556a"], [-0.12, 0.08, 0.16, 0.13, 1.1, "#8db06a"],
      [0.34, 0.5, 0.18, 0.11, -0.4, "#b48ad8"], [-0.6, 0.5, 0.14, 0.12, 0.2, "#5fc1be"],
    ];
    const poids = amas.map(() => 0.7 + rnd()), tot = poids.reduce((a, b) => a + b);
    for (let i = 0; i < N; i++) {
      if (rnd() < 0.05) {
        t[2 * i] = (rnd() * 2 - 1) * 0.9; t[2 * i + 1] = (rnd() * 2 - 1) * 0.85;
        c.set([0.3, 0.36, 0.42], 3 * i);
        continue;
      }
      let r = rnd() * tot, j = 0;
      while ((r -= poids[j]) > 0) j++;
      const [cx, cy, sx, sy, th, col] = amas[j];
      const a = gauss() * sx, b = gauss() * sy;
      t[2 * i] = cx + a * Math.cos(th) - b * Math.sin(th);
      t[2 * i + 1] = cy + a * Math.sin(th) + b * Math.cos(th);
      const k = 0.75 + 0.45 * rnd(), q = hex(col);
      c.set([q[0] * k, q[1] * k, q[2] * k], 3 * i);
    }
    cible.abstractviz = t; couleur.abstractviz = c;
  }

  function formeCV() {
    const t = new Float32Array(2 * N), c = new Float32Array(3 * N);
    const L = 0.6, T = 0.86;
    const segs = [];
    const ligne = (x0, y, len, ep, col, w) => segs.push({ x0, y, len, ep, col, w: w * len });
    // colonne de gauche : petits blocs, colonne de droite : texte
    for (let k = 0, y = -0.5; k < 14; k++, y += 0.085) {
      if (k === 4 || k === 9) continue;
      ligne(-0.52, y, 0.16 + 0.14 * rnd(), 0.009, [0.62, 0.72, 0.8], 1);
    }
    ligne(-0.06, -0.72, 0.46, 0.03, hex("#f2b62a"), 2.2);
    ligne(-0.06, -0.61, 0.3, 0.012, [0.75, 0.82, 0.88], 1);
    for (let k = 0, y = -0.46; y < 0.76; k++, y += 0.062) {
      if (k % 5 === 4) { y += 0.03; ligne(-0.06, y, 0.22, 0.014, [0.95, 0.85, 0.6], 1.2); continue; }
      ligne(-0.06, y, k % 5 === 3 ? 0.3 + 0.15 * rnd() : 0.52 + 0.08 * rnd(), 0.009, [0.86, 0.9, 0.94], 1);
    }
    const perim = 4 * (L + T);
    const totLignes = segs.reduce((a, s) => a + s.w, 0);
    for (let i = 0; i < N; i++) {
      let x, y, col;
      if (rnd() < 0.2) {
        let d = rnd() * perim;
        if (d < 2 * L) { x = -L + d; y = -T; } else if ((d -= 2 * L) < 2 * T) { x = L; y = -T + d; }
        else if ((d -= 2 * T) < 2 * L) { x = L - d; y = T; } else { d -= 2 * L; x = -L; y = T - d; }
        x += gauss() * 0.004; y += gauss() * 0.004;
        col = [0.45, 0.55, 0.64];
      } else {
        let r = rnd() * totLignes, j = 0;
        while ((r -= segs[j].w) > 0 && j < segs.length - 1) j++;
        const s = segs[j];
        x = s.x0 + rnd() * s.len; y = s.y + (rnd() * 2 - 1) * s.ep; col = s.col;
      }
      t[2 * i] = x; t[2 * i + 1] = y;
      const k = 0.55 + 0.35 * rnd();
      c.set([col[0] * k, col[1] * k, col[2] * k], 3 * i);
    }
    cible.portfolio = t; couleur.portfolio = c;
  }

  // trois pages en éventail : celle du dessus porte un titre et du texte
  function formeRapport() {
    const t = new Float32Array(2 * N), c = new Float32Array(3 * N);
    const menthe = hex("#8fe0c0"), L = 0.42, Hh = 0.58;
    const pages = [[-0.34, 0.06, -0.2], [0.34, 0.06, 0.2], [0, -0.02, 0]];
    for (let i = 0; i < N; i++) {
      const r = rnd();
      const k = r < 0.17 ? 0 : r < 0.34 ? 1 : 2;
      const [px, py, th] = pages[k];
      let x, y, col;
      const devant = k === 2 && rnd() < 0.72;
      if (!devant) {
        let d = rnd() * 4 * (L + Hh);
        if (d < 2 * L) { x = -L + d; y = -Hh; } else if ((d -= 2 * L) < 2 * Hh) { x = L; y = -Hh + d; }
        else if ((d -= 2 * Hh) < 2 * L) { x = L - d; y = Hh; } else { d -= 2 * L; x = -L; y = Hh - d; }
        x += gauss() * 0.004; y += gauss() * 0.004;
        col = k === 2 ? [0.6, 0.72, 0.8] : [0.42, 0.52, 0.6];
      } else if (rnd() < 0.16) {
        x = -0.3 + rnd() * 0.6; y = -0.44 + (rnd() * 2 - 1) * 0.03; col = menthe;
      } else {
        const ligne = Math.floor(rnd() * 13), y0 = -0.3 + ligne * 0.058;
        const lg = ligne % 5 === 4 ? 0.3 : 0.62;
        x = -0.31 + rnd() * lg; y = y0 + (rnd() * 2 - 1) * 0.008; col = [0.86, 0.91, 0.94];
      }
      const ct = Math.cos(th), st = Math.sin(th);
      t[2 * i] = px + x * ct - y * st; t[2 * i + 1] = py + x * st + y * ct;
      const g = 0.55 + 0.35 * rnd();
      c.set([col[0] * g, col[1] * g, col[2] * g], 3 * i);
    }
    cible.rapport = t; couleur.rapport = c;
  }

  // treize barres très inégales : le déséquilibre des classes du projet IMA205
  function formeClasses() {
    const t = new Float32Array(2 * N), c = new Float32Array(3 * N);
    const h = [1, 0.66, 0.47, 0.35, 0.27, 0.21, 0.16, 0.125, 0.1, 0.08, 0.062, 0.048, 0.036];
    const n = h.length, x0 = -0.86, larg = 1.72, ecart = 0.03, bw = (larg - ecart * (n - 1)) / n;
    const base = 0.66, hmax = 1.34, tot = h.reduce((a, b) => a + b);
    const c0 = hex("#b9a7ff"), c1 = hex("#6fd3ff");
    for (let i = 0; i < N; i++) {
      if (rnd() < 0.07) {
        t[2 * i] = x0 - 0.02 + rnd() * (larg + 0.04); t[2 * i + 1] = base + 0.03 + gauss() * 0.003;
        c.set([0.42, 0.5, 0.58], 3 * i);
        continue;
      }
      let r = rnd() * tot, k = 0;
      while ((r -= h[k]) > 0 && k < n - 1) k++;
      t[2 * i] = x0 + k * (bw + ecart) + rnd() * bw;
      t[2 * i + 1] = base - rnd() * h[k] * hmax;
      const u = k / (n - 1), g = 0.6 + 0.4 * rnd();
      c.set([(c0[0] + (c1[0] - c0[0]) * u) * g, (c0[1] + (c1[1] - c0[1]) * u) * g, (c0[2] + (c1[2] - c0[2]) * u) * g], 3 * i);
    }
    cible.classification = t; couleur.classification = c;
  }

  // Euler explicite sur x'' = -x : le cercle exact et la spirale qui s'en écarte
  function formeEuler() {
    const t = new Float32Array(2 * N), c = new Float32Array(3 * N);
    const pas = 0.26, r0 = 0.36, noeuds = [[r0, 0]];
    for (let k = 0; k < 27; k++) { const [x, v] = noeuds[k]; noeuds.push([x + pas * v, v - pas * x]); }
    const menthe = hex("#8fe0c0"), ambre = hex("#f2c25a");
    for (let i = 0; i < N; i++) {
      const r = rnd();
      let x, y, col;
      if (r < 0.26) {
        const a = rnd() * 2 * Math.PI;
        x = r0 * Math.cos(a); y = r0 * Math.sin(a); col = [0.62, 0.72, 0.8];
        x += gauss() * 0.004; y += gauss() * 0.004;
      } else if (r < 0.32) {
        const l = rnd() * 1.9 - 0.95;
        if (rnd() < 0.5) { x = l; y = 0; } else { x = 0; y = l; }
        col = [0.3, 0.38, 0.45];
      } else if (r < 0.86) {
        const k = Math.floor(rnd() * (noeuds.length - 1)), u = rnd();
        const [ax, av] = noeuds[k], [bx, bv] = noeuds[k + 1];
        x = ax + (bx - ax) * u; y = -(av + (bv - av) * u); col = menthe;
        x += gauss() * 0.003; y += gauss() * 0.003;
      } else {
        const [nx, nv] = noeuds[Math.floor(rnd() * noeuds.length)];
        x = nx + gauss() * 0.012; y = -nv + gauss() * 0.012; col = ambre;
      }
      t[2 * i] = x; t[2 * i + 1] = y;
      const g = 0.6 + 0.4 * rnd();
      c.set([col[0] * g, col[1] * g, col[2] * g], 3 * i);
    }
    cible.schemas = t; couleur.schemas = c;
  }

  // superpixels : frontières d'un découpage de Voronoï autour d'une grille de centres décalés
  function formeSuperpixels() {
    const t = new Float32Array(2 * N), c = new Float32Array(3 * N);
    const lx = 0.86, ly = 0.6, nx = 8, ny = 6, ctr = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      ctr.push([-lx + (2 * lx) * (i + 0.5 + 0.34 * (rnd() - 0.5)) / nx, -ly + (2 * ly) * (j + 0.5 + 0.34 * (rnd() - 0.5)) / ny]);
    }
    const corail = hex("#ff9e7a"), clair = [0.95, 0.86, 0.78];
    for (let i = 0; i < N; i++) {
      let x, y, col;
      if (rnd() < 0.06) {
        const k = ctr[Math.floor(rnd() * ctr.length)];
        x = k[0] + gauss() * 0.01; y = k[1] + gauss() * 0.01; col = clair;
      } else if (rnd() < 0.12) {
        const u = rnd() * 4 * (lx + ly);
        if (u < 4 * lx) { x = -lx + (u % (2 * lx)); y = u < 2 * lx ? -ly : ly; }
        else { const v = u - 4 * lx; x = v < 2 * ly ? -lx : lx; y = -ly + (v % (2 * ly)); }
        col = corail;
      } else {
        for (let essai = 0; essai < 400; essai++) {
          x = (rnd() * 2 - 1) * lx; y = (rnd() * 2 - 1) * ly;
          let d1 = 9, d2 = 9;
          for (const k of ctr) {
            const d = Math.hypot(x - k[0], y - k[1]);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
          if (d2 - d1 < 0.01) break;
        }
        col = corail;
      }
      t[2 * i] = x; t[2 * i + 1] = y;
      const g = 0.55 + 0.45 * rnd();
      c.set([col[0] * g, col[1] * g, col[2] * g], 3 * i);
    }
    cible.slic = t; couleur.slic = c;
  }

  // circuit quantique du test DCP : quatre fils, portes H et X, QFT, CNOT et mesures
  function formeCircuit() {
    const t = new Float32Array(2 * N), c = new Float32Array(3 * N);
    const ys = [-0.45, -0.15, 0.15, 0.45], x0 = -0.88, x1 = 0.88;
    const orchidee = hex("#e7a3ff"), menthe = hex("#8fe0c0"), ambre = hex("#f2c25a"), clair = [0.9, 0.93, 0.95], fil = [0.36, 0.44, 0.5];
    const boites = [[-0.68, 0, 0.09, orchidee], [-0.68, 2, 0.09, orchidee], [-0.68, 3, 0.09, ambre], [0.42, 0, 0.09, orchidee],
                    [-0.1, 1, 0.15, menthe], [-0.1, 3, 0.15, menthe], [0.72, 0, 0.08, clair], [0.72, 1, 0.08, clair], [0.72, 2, 0.08, clair], [0.72, 3, 0.08, clair]];
    const cnot = [[-0.38, 0, 1], [-0.38, 2, 3], [0.18, 0, 2]];
    for (let i = 0; i < N; i++) {
      const r = rnd();
      let x, y, col;
      if (r < 0.3) {
        x = x0 + rnd() * (x1 - x0); y = ys[Math.floor(rnd() * 4)] + gauss() * 0.003; col = fil;
      } else if (r < 0.68) {
        const [bx, l, demi, cc] = boites[Math.floor(rnd() * boites.length)];
        const hy = 0.075, u = rnd() * 4 * (demi + hy);
        if (u < 2 * demi) { x = bx - demi + u; y = ys[l] - hy; }
        else if (u < 4 * demi) { x = bx - demi + (u - 2 * demi); y = ys[l] + hy; }
        else { const v = u - 4 * demi; x = v < 2 * hy ? bx - demi : bx + demi; y = ys[l] - hy + (v % (2 * hy)); }
        if (rnd() < 0.35) { x = bx + (rnd() - 0.5) * 2 * demi * 0.9; y = ys[l] + (rnd() - 0.5) * 2 * hy * 0.9; }
        col = cc;
      } else if (r < 0.8) {
        const [cx, a, b] = cnot[Math.floor(rnd() * cnot.length)];
        x = cx + gauss() * 0.003; y = ys[a] + rnd() * (ys[b] - ys[a]); col = clair;
      } else if (r < 0.95) {
        const [cx, , b] = cnot[Math.floor(rnd() * cnot.length)], ang = rnd() * 2 * Math.PI;
        if (rnd() < 0.7) { x = cx + 0.055 * Math.cos(ang); y = ys[b] + 0.055 * Math.sin(ang); }
        else if (rnd() < 0.5) { x = cx + (rnd() - 0.5) * 0.11; y = ys[b]; } else { x = cx; y = ys[b] + (rnd() - 0.5) * 0.11; }
        col = clair;
      } else {
        const [cx, a] = cnot[Math.floor(rnd() * cnot.length)];
        x = cx + gauss() * 0.012; y = ys[a] + gauss() * 0.012; col = clair;
      }
      t[2 * i] = x; t[2 * i + 1] = y;
      const g = 0.55 + 0.45 * rnd();
      c.set([col[0] * g, col[1] * g, col[2] * g], 3 * i);
    }
    cible.quantique = t; couleur.quantique = c;
  }

  // arène du robot : grille 7 x 6, cinq robots au départ, un trajet en L et trois balises
  function formeRobot() {
    const t = new Float32Array(2 * N), c = new Float32Array(3 * N);
    const nc = 6, nl = 7, pas = 0.24, x0 = -nc * pas / 2, y0 = -nl * pas / 2;
    const lime = hex("#c6e36b"), clair = [0.92, 0.95, 0.97], fil = [0.3, 0.38, 0.44];
    const cx = (j) => x0 + (j + 0.5) * pas, cy = (i) => y0 + (i + 0.5) * pas;
    const depart = [0, 1, 2, 4, 5], balises = [[0, 5], [3, 3], [4, 1]];
    for (let i = 0; i < N; i++) {
      const r = rnd();
      let x, y, col;
      if (r < 0.34) {
        if (rnd() < 0.5) { x = x0 + Math.floor(rnd() * (nc + 1)) * pas; y = y0 + rnd() * nl * pas; }
        else { y = y0 + Math.floor(rnd() * (nl + 1)) * pas; x = x0 + rnd() * nc * pas; }
        col = fil;
      } else if (r < 0.62) {
        const u = rnd() * 9;
        if (u < 5) { x = cx(0); y = cy(6) - u * pas; } else { x = cx(0) + (u - 5) * pas; y = cy(1); }
        x += gauss() * 0.004; y += gauss() * 0.004; col = lime;
      } else if (r < 0.82) {
        const j = depart[Math.floor(rnd() * depart.length)];
        x = cx(j) + (rnd() - 0.5) * pas * 0.62; y = cy(6) + (rnd() - 0.5) * pas * 0.62; col = j === 0 ? lime : [lime[0] * 0.55, lime[1] * 0.55, lime[2] * 0.55];
      } else {
        const [bi, bj] = balises[Math.floor(rnd() * balises.length)];
        x = cx(bj) + (rnd() - 0.5) * pas * 0.5; y = cy(bi) + (rnd() - 0.5) * pas * 0.5; col = clair;
      }
      t[2 * i] = x; t[2 * i + 1] = y;
      const g = 0.55 + 0.45 * rnd();
      c.set([col[0] * g, col[1] * g, col[2] * g], 3 * i);
    }
    cible.robot = t; couleur.robot = c;
  }

  // forme tirée d'une image : les points tombent là où l'image est claire
  function formeImage(img, cle, teinte, gamma, haut) {
    const t = new Float32Array(2 * N), c = new Float32Array(3 * N);
    if (!img) {
      for (let i = 0; i < N; i++) {
        const a = rnd() * 2 * Math.PI, r = Math.sqrt(rnd());
        t[2 * i] = 0.7 * r * Math.cos(a); t[2 * i + 1] = 0.85 * r * Math.sin(a);
        c.set([0.5, 0.62, 0.75], 3 * i);
      }
    } else {
      const w = img.naturalWidth, h = img.naturalHeight, oc = document.createElement("canvas");
      oc.width = w; oc.height = h;
      const o = oc.getContext("2d");
      o.drawImage(img, 0, 0);
      const d = o.getImageData(0, 0, w, h).data, cdf = new Float64Array(w * h);
      let acc = 0;
      for (let p = 0; p < w * h; p++) { acc += Math.pow(d[4 * p + 3] / 255, gamma); cdf[p] = acc; }
      const sc = haut / h;
      for (let i = 0; i < N; i++) {
        const r = rnd() * acc;
        let lo = 0, hi = w * h - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; }
        const px = lo % w, py = (lo / w) | 0, I = d[4 * lo + 3] / 255;
        t[2 * i] = (px + rnd() - w / 2) * sc; t[2 * i + 1] = (py + rnd() - h / 2) * sc;
        const k = 0.3 + 0.8 * I;
        c.set([teinte[0] * k, teinte[1] * k, teinte[2] * k], 3 * i);
      }
    }
    cible[cle] = t; couleur[cle] = c;
  }
  const formeIRM = (img) => formeImage(img, "irm", [0.72, 0.88, 1.0], 1.6, 1.9);

  // ---------- scène ----------

  function scene() {
    if (etroit()) {
      const s = Math.min(W * 0.84, H * 0.36);
      return { cx: W / 2, cy: s / 2 + 168, s };
    }
    const s = Math.min(W * 0.4, H * 0.74);
    return { cx: W * 0.71, cy: H * 0.5, s };
  }

  let forme = "repos", precedente = "repos";
  // f : la forme à dessiner ; on allume son thème et, s'il est déplié, le projet correspondant
  function choisir(f) {
    const theme = themeDe[f];
    entrees.forEach((a) => a.classList.toggle("actif", a === theme));
    projets.forEach((p) => p.classList.toggle("actif", p.dataset.formeSous === f));
    if (f === forme) return;
    precedente = forme; forme = f;
    const now = performance.now();
    for (let i = 0; i < N; i++) BASC[i] = now + (reduce ? 0 : rnd() * 380);
    if (legende) {
      legende.style.opacity = 0;
      setTimeout(() => { legende.textContent = LEGENDES[f]; legende.style.opacity = 1; }, reduce ? 0 : 220);
    }
    if (reduce) { placer(); dessiner(); }
  }

  // position cible en pixels de la particule i pour la forme f
  function cibleXY(f, i, sc, out) {
    if (f === "repos") { out[0] = OUx[i] * W; out[1] = OUy[i] * H; return; }
    const t = cible[f];
    out[0] = sc.cx + t[2 * i] * sc.s / 2; out[1] = sc.cy + t[2 * i + 1] * sc.s / 2;
  }

  function placer() {
    const sc = scene(), o = [0, 0];
    for (let i = 0; i < N; i++) {
      cibleXY(forme, i, sc, o); X[i] = o[0]; Y[i] = o[1];
      const c = couleur[forme]; R[i] = c[3 * i]; G[i] = c[3 * i + 1]; B[i] = c[3 * i + 2];
    }
  }

  // ---------- souris ----------
  let mx = -1e4, my = -1e4;
  addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  addEventListener("pointerleave", () => { mx = my = -1e4; });
  document.addEventListener("pointerout", (e) => { if (!e.relatedTarget) mx = my = -1e4; });

  // ---------- pas de temps ----------
  function pas(now) {
    const sc = scene(), o = [0, 0], RR = 90 * 90;
    const theta = 0.012, sig = 0.0028;
    for (let i = 0; i < N; i++) {
      // processus d'Ornstein-Uhlenbeck de la position de repos
      OUx[i] += theta * (MUx[i] - OUx[i]) + sig * gauss() * (H / W);
      OUy[i] += theta * (MUy[i] - OUy[i]) + sig * gauss();
      const f = now >= BASC[i] ? forme : precedente;
      cibleXY(f, i, sc, o);
      let ax = (o[0] - X[i]) * K[i], ay = (o[1] - Y[i]) * K[i];
      const dx = X[i] - mx, dy = Y[i] - my, d2 = dx * dx + dy * dy;
      if (d2 < RR && d2 > 1) {
        const d = Math.sqrt(d2), p = (1 - d2 / RR) * 1.6;
        ax += (dx / d) * p; ay += (dy / d) * p;
      }
      VX[i] = (VX[i] + ax) * 0.84; VY[i] = (VY[i] + ay) * 0.84;
      X[i] += VX[i]; Y[i] += VY[i];
      if (f !== "repos") { X[i] += (rnd() - 0.5) * 0.35; Y[i] += (rnd() - 0.5) * 0.35; }
      const c = couleur[f];
      R[i] += (c[3 * i] - R[i]) * 0.05; G[i] += (c[3 * i + 1] - G[i]) * 0.05; B[i] += (c[3 * i + 2] - B[i]) * 0.05;
    }
  }

  // ---------- rendu WebGL (repli en 2D) ----------
  let gl = cv.getContext("webgl", { antialias: false, premultipliedAlpha: true, alpha: true });
  let ctx = null, buf, data, loc = {};
  if (gl) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, `
      attribute vec2 p; attribute vec3 c; attribute float s;
      uniform vec2 res; uniform float dpr; varying vec3 vc;
      void main() {
        vec2 q = p / res * 2.0 - 1.0;
        gl_Position = vec4(q.x, -q.y, 0.0, 1.0);
        gl_PointSize = s * dpr; vc = c;
      }`));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `
      precision mediump float; varying vec3 vc;
      void main() {
        vec2 d = (gl_PointCoord - 0.5) * 2.0;
        float r2 = dot(d, d);
        float a = exp(-r2 * 6.0) + 0.6 * exp(-r2 * 40.0);
        a *= 1.0 - smoothstep(0.8, 1.0, r2);
        gl_FragColor = vec4(vc * a * 1.35, a);
      }`));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) gl = null;
    else {
      gl.useProgram(prog);
      data = new Float32Array(N * 6);
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
      const at = (n, size, off) => { const l = gl.getAttribLocation(prog, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 24, off); };
      at("p", 2, 0); at("c", 3, 8); at("s", 1, 20);
      loc.res = gl.getUniformLocation(prog, "res"); loc.dpr = gl.getUniformLocation(prog, "dpr");
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.clearColor(0, 0, 0, 0);
    }
  }
  if (!gl) ctx = cv.getContext("2d");

  function taille() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (gl) { gl.viewport(0, 0, cv.width, cv.height); gl.uniform2f(loc.res, W, H); gl.uniform1f(loc.dpr, dpr); }
  }

  function dessiner() {
    if (gl) {
      for (let i = 0, j = 0; i < N; i++, j += 6) {
        data[j] = X[i]; data[j + 1] = Y[i]; data[j + 2] = R[i]; data[j + 3] = G[i]; data[j + 4] = B[i]; data[j + 5] = S[i];
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      gl.drawArrays(gl.POINTS, 0, N);
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < N; i += 2) {
        ctx.fillStyle = `rgb(${R[i] * 255 | 0},${G[i] * 255 | 0},${B[i] * 255 | 0})`;
        ctx.fillRect(X[i] - S[i] / 4, Y[i] - S[i] / 4, S[i] / 2, S[i] / 2);
      }
    }
  }

  // ---------- cycle automatique et survol ----------
  const CYCLE = [["repos", 5200], ["irm", 4600], ["abstractviz", 4600], ["classification", 4600], ["slic", 4600], ["quantique", 4600], ["robot", 4600], ["schemas", 4600], ["portfolio", 4600]];
  let ic = 0, minuterie = 0, survol = false;
  function suivant() {
    if (survol) return;
    ic = (ic + 1) % CYCLE.length;
    choisir(CYCLE[ic][0]);
    minuterie = setTimeout(suivant, CYCLE[ic][1]);
  }
  const relancer = (delai) => { clearTimeout(minuterie); if (!reduce) minuterie = setTimeout(suivant, delai); };
  // l'élément survolé (ou ayant le focus) décide de la forme : un thème montre sa forme principale,
  // un projet déplié la sienne
  function survoler(el) {
    const entree = el && el.closest ? el.closest("[data-forme]") : null;
    if (!entree) { if (survol) { survol = false; relancer(2600); } return; }
    const sous = el.closest("[data-forme-sous]");
    const f = sous ? sous.dataset.formeSous : entree.dataset.forme;
    survol = true; clearTimeout(minuterie);
    const k = CYCLE.findIndex((c) => c[0] === f);
    if (k >= 0) ic = k;
    choisir(f);
  }
  // un seul thème ouvert à la fois (l'attribut name des details le fait déjà dans les navigateurs récents)
  document.querySelectorAll("details.depliant").forEach((d) => d.addEventListener("toggle", () => {
    if (d.open) document.querySelectorAll("details.depliant[open]").forEach((o) => { if (o !== d) o.open = false; });
  }));
  if (menu) {
    menu.addEventListener("pointerover", (e) => survoler(e.target));
    menu.addEventListener("pointerleave", () => survoler(null));
    menu.addEventListener("focusin", (e) => survoler(e.target));
    menu.addEventListener("focusout", (e) => { if (!menu.contains(e.relatedTarget)) survoler(null); });
  }

  // ---------- démarrage ----------
  taille();
  formeRepos(); formeAmas(); formeCV(); formeRapport(); formeClasses(); formeSuperpixels(); formeCircuit(); formeRobot(); formeEuler(); formeIRM(null);
  for (let i = 0; i < N; i++) {
    S[i] = (etroit() ? 2.6 : 3.0) + Math.pow(rnd(), 3) * 5.0;
    K[i] = 0.012 + rnd() * 0.022;
    X[i] = rnd() * W; Y[i] = rnd() * H;
  }
  const img = new Image();
  img.onload = () => { formeIRM(img); if (reduce && forme === "irm") { placer(); dessiner(); } };
  img.src = "/accueil/irm-coupe.png";

  addEventListener("resize", () => { taille(); if (reduce) { placer(); dessiner(); } });

  if (reduce) { placer(); dessiner(); return; }

  relancer(CYCLE[0][1]);
  const boucle = (now) => { pas(now); dessiner(); requestAnimationFrame(boucle); };
  requestAnimationFrame(boucle);
})();
