// ===========================================================================
// ui.js — petits outils partagés par les figures interactives du livre.
//   - thème clair/sombre synchronisé avec le livre MyST parent
//   - contrôles (curseurs, boutons segmentés, cases à cocher)
//   - canvas HiDPI redimensionnables
//   - Plot : axes 2D (lin/log), courbes, repères, infobulle au survol
//   - View3D : vue 3D en perspective cavalière (aimantation), rotation à la souris
//   - Anim : boucle d'animation play/pause
// Aucune dépendance externe : les figures marchent hors ligne.
// ===========================================================================
(function () {
  "use strict";
  const UI = {};
  const DEG = Math.PI / 180;

  // ------------------------------------------------------------------ thème
  function parentIsDark() {
    try {
      if (window.parent && window.parent !== window) {
        const h = window.parent.document.documentElement;
        if (h.classList.contains("dark")) return true;
        if (h.classList.contains("light")) return false;
        if (h.dataset && h.dataset.theme) return h.dataset.theme === "dark";
      }
    } catch (e) { /* iframe d'une autre origine : on retombe sur la préférence OS */ }
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  const themeCbs = [];
  UI.onTheme = (cb) => themeCbs.push(cb);
  function applyTheme(notify) {
    const d = parentIsDark();
    const root = document.documentElement;
    if (root.classList.contains("dark") !== d) {
      root.classList.toggle("dark", d);
      if (notify) themeCbs.forEach((cb) => cb());
    }
  }
  applyTheme(false);
  try {
    if (window.parent && window.parent !== window) {
      new MutationObserver(() => applyTheme(true)).observe(window.parent.document.documentElement,
        { attributes: true, attributeFilter: ["class", "data-theme"] });
    }
  } catch (e) { /* rien */ }
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(() => applyTheme(true));
  }
  UI.css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  UI.tcolor = (id) => UI.css("--t-" + id);

  // ---------------------------------------------------------------- nombres
  UI.fmt = function (v, d = 2) {
    if (Number.isNaN(v)) return "—";
    if (!isFinite(v)) return v > 0 ? "∞" : "−∞";
    let s = v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
    if (/^-[0\s,]*$/.test(s)) s = s.slice(1);          // pas de « −0,00 »
    return s.replace("-", "−");                          // vrai signe moins
  };
  UI.fmtAuto = function (v) {
    const a = Math.abs(v);
    if (a >= 100) return UI.fmt(v, 0);
    if (a >= 10) return UI.fmt(v, 1);
    if (a >= 1) return UI.fmt(v, 2);
    return UI.fmt(v, 3);
  };
  UI.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  UI.DEG = DEG;

  // --------------------------------------------------------------------- DOM
  UI.$ = (sel, root = document) => root.querySelector(sel);
  UI.el = function (tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "text") e.textContent = v;
      else if (k === "style") e.style.cssText = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
  };
  function host(p) { return typeof p === "string" ? document.querySelector(p) : p; }

  // Curseur : {label, min, max, step, value, unit, fmt, log, onInput}
  UI.slider = function (parent, o) {
    const fmt = o.fmt || ((v) => UI.fmtAuto(v));
    const val = UI.el("span", { class: "val" });
    const lab = UI.el("label", {}, [UI.el("span", { html: o.label }), val]);
    const N = 1000;
    const inp = UI.el("input", { type: "range", "aria-label": o.label.replace(/<[^>]+>/g, "") });
    if (o.log) {
      inp.min = 0; inp.max = N; inp.step = 1;
    } else {
      inp.min = o.min; inp.max = o.max; inp.step = o.step || (o.max - o.min) / 200;
    }
    const toV = (x) => (o.log ? o.min * Math.pow(o.max / o.min, x / N) : +x);
    const toX = (v) => (o.log ? (N * Math.log(v / o.min)) / Math.log(o.max / o.min) : v);
    const wrap = UI.el("div", { class: "ctl" }, [lab, inp]);
    host(parent).appendChild(wrap);
    const api = {
      el: wrap, input: inp,
      get value() {
        let v = toV(+inp.value);
        if (o.log && o.round) v = o.round(v);
        return v;
      },
      set(v, silent) {
        inp.value = toX(v);
        val.textContent = fmt(api.value) + (o.unit ? " " + o.unit : "");
        if (!silent && o.onInput) o.onInput(api.value);
      },
    };
    inp.addEventListener("input", () => {
      val.textContent = fmt(api.value) + (o.unit ? " " + o.unit : "");
      if (o.onInput) o.onInput(api.value);
    });
    api.set(o.value, true);
    return api;
  };

  // Boutons segmentés : {label, options: [[valeur, texte], ...], value, onChange}
  UI.seg = function (parent, o) {
    const box = UI.el("div", { class: "seg", role: "group" });
    const btns = o.options.map(([v, t]) => {
      const b = UI.el("button", { type: "button", html: t });
      b.addEventListener("click", () => { api.set(v); });
      box.appendChild(b);
      return [v, b];
    });
    const wrap = o.label
      ? UI.el("div", { class: "ctl", style: "flex:0 0 auto;min-width:0" }, [UI.el("div", { class: "lab", html: o.label }), box])
      : box;
    host(parent).appendChild(wrap);
    const api = {
      el: wrap, value: o.value,
      set(v, silent) {
        api.value = v;
        btns.forEach(([bv, b]) => { b.classList.toggle("on", bv === v); b.setAttribute("aria-pressed", bv === v); });
        if (!silent && o.onChange) o.onChange(v);
      },
    };
    api.set(o.value, true);
    return api;
  };

  UI.check = function (parent, o) {
    const inp = UI.el("input", { type: "checkbox" });
    inp.checked = !!o.value;
    const kids = [inp];
    if (o.color) kids.push(UI.el("span", { class: "sw", style: "background:" + o.color }));
    kids.push(UI.el("span", { html: o.label }));
    const lab = UI.el("label", { class: "chk" }, kids);
    host(parent).appendChild(lab);
    inp.addEventListener("change", () => o.onChange && o.onChange(inp.checked));
    return {
      el: lab, input: inp,
      get value() { return inp.checked; },
      set(v, silent) { inp.checked = v; if (!silent && o.onChange) o.onChange(v); },
      swatch: lab.querySelector(".sw"),
    };
  };

  UI.button = function (parent, label, onClick, cls = "btn") {
    const b = UI.el("button", { type: "button", class: cls, html: label });
    b.addEventListener("click", onClick);
    host(parent).appendChild(b);
    return b;
  };

  // ------------------------------------------------------------------ canvas
  // Crée un canvas HiDPI qui remplit `container` et appelle draw(ctx, w, h).
  UI.canvas = function (container, draw) {
    const box = host(container);
    const cv = UI.el("canvas");
    box.appendChild(cv);
    const ctx = cv.getContext("2d");
    const o = { cv, ctx, box, w: 0, h: 0, draw };
    let pending = false;
    o.redraw = function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; o.drawNow(); });
    };
    o.drawNow = function () {
      const dpr = window.devicePixelRatio || 1;
      const w = box.clientWidth, h = box.clientHeight;
      if (w === 0 || h === 0) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      }
      o.w = w; o.h = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      o.draw(ctx, w, h);
    };
    new ResizeObserver(() => o.drawNow()).observe(box);
    UI.onTheme(() => o.drawNow());
    return o;
  };

  // Flèche 2D (écran)
  UI.arrow = function (ctx, x0, y0, x1, y1, color, width = 2, head = 8) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
    if (L < 1) return;
    const ux = dx / L, uy = dy / L, h = Math.min(head, L * 0.45);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * h * 0.7, y1 - uy * h * 0.7); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * h - uy * h * 0.45, y1 - uy * h + ux * h * 0.45);
    ctx.lineTo(x1 - ux * h + uy * h * 0.45, y1 - uy * h - ux * h * 0.45);
    ctx.closePath(); ctx.fill();
  };

  UI.text = function (ctx, s, x, y, o = {}) {
    ctx.font = (o.weight || "") + " " + (o.size || 12) + "px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillStyle = o.color || UI.css("--ink2");
    ctx.textAlign = o.align || "left";
    ctx.textBaseline = o.baseline || "middle";
    if (o.box) {  // fond opaque : aucune ligne ne traverse le texte
      const wd = ctx.measureText(s).width, hh = (o.size || 12) + 5;
      const x0 = ctx.textAlign === "right" ? x - wd : ctx.textAlign === "center" ? x - wd / 2 : x;
      ctx.fillStyle = UI.css("--panel"); ctx.fillRect(x0 - 3, y - hh / 2, wd + 6, hh);
      ctx.fillStyle = o.color || UI.css("--ink2");
    }
    if (o.halo) {
      ctx.lineWidth = 3; ctx.strokeStyle = UI.css("--panel"); ctx.lineJoin = "round";
      ctx.strokeText(s, x, y);
    }
    ctx.fillText(s, x, y);
  };

  // --------------------------------------------------------------- ticks
  function niceStep(span, n) {
    const raw = span / Math.max(n, 1);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  UI.ticks = function (a, b, n = 5) {
    const s = niceStep(b - a, n);
    const out = [];
    for (let v = Math.ceil(a / s - 1e-9) * s; v <= b + s * 1e-9; v += s) out.push(Math.abs(v) < s * 1e-9 ? 0 : v);
    return out;
  };
  // Formateur de graduations : juste assez de décimales pour distinguer les ticks
  UI.tickFmt = function (ticks, log) {
    if (log) return (v) => {
      const e = Math.round(Math.log10(v));
      if (e >= -2 && e <= 4) return UI.fmt(v, Math.max(0, -e));
      const sup = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
      return "10" + String(e).split("").map((ch) => sup[ch]).join("");
    };
    const st = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
    let d = 0;
    while (d < 4 && Math.abs(st * Math.pow(10, d) - Math.round(st * Math.pow(10, d))) > 1e-6) d++;
    return (v) => UI.fmt(v, d);
  };
  UI.pow10 = function (v) {
    const e = Math.round(Math.log10(v));
    const sup = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
    return e === 0 ? "1" : "10" + String(e).split("").map((ch) => sup[ch]).join("");
  };
  UI.logTicks = function (a, b) {
    const out = [];
    for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) {
      const p = Math.pow(10, e);
      if (p >= a * 0.999 && p <= b * 1.001) out.push(p);
    }
    return out;
  };

  // -------------------------------------------------------------------- Plot
  // p = new UI.Plot(canvasObj, {x:{min,max,log,label,fmt,ticks}, y:{...}, pad})
  class Plot {
    constructor(c, o) {
      this.c = c;
      this.o = Object.assign({ pad: { l: 48, r: 14, t: 10, b: 36 } }, o);
      this.hx = null;          // abscisse survolée (unités données) ou null
      this.tip = null;
    }
    set x(v) { this.o.x = v; }
    set y(v) { this.o.y = v; }
    get x() { return this.o.x; }
    get y() { return this.o.y; }
    _map(ax, v, a, b) {
      if (ax.log) return a + ((Math.log(v) - Math.log(ax.min)) / (Math.log(ax.max) - Math.log(ax.min))) * (b - a);
      return a + ((v - ax.min) / (ax.max - ax.min)) * (b - a);
    }
    _inv(ax, p, a, b) {
      const t = (p - a) / (b - a);
      if (ax.log) return Math.exp(Math.log(ax.min) + t * (Math.log(ax.max) - Math.log(ax.min)));
      return ax.min + t * (ax.max - ax.min);
    }
    X(v) { return this._map(this.o.x, v, this.L, this.R); }
    Y(v) { return this._map(this.o.y, v, this.B, this.T); }
    invX(px) { return this._inv(this.o.x, px, this.L, this.R); }
    frame(ctx, w, h) {
      const p = this.o.pad;
      this.ctx = ctx; this.L = p.l; this.R = w - p.r; this.T = p.t; this.B = h - p.b;
      const { x, y } = this.o;
      const grid = UI.css("--grid"), axis = UI.css("--axis"), muted = UI.css("--muted");
      ctx.lineWidth = 1;
      const xt = x.ticks || (x.log ? UI.logTicks(x.min, x.max) : UI.ticks(x.min, x.max, Math.max(2, Math.floor((this.R - this.L) / 70))));
      const yt = y.ticks || (y.log ? UI.logTicks(y.min, y.max) : UI.ticks(y.min, y.max, Math.max(2, Math.floor((this.B - this.T) / 45))));
      const fx = x.fmt || UI.tickFmt(xt, x.log), fy = y.fmt || UI.tickFmt(yt, y.log);
      ctx.strokeStyle = grid;
      yt.forEach((v) => { const yy = Math.round(this.Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(this.L, yy); ctx.lineTo(this.R, yy); ctx.stroke(); });
      xt.forEach((v) => { const xx = Math.round(this.X(v)) + 0.5; ctx.beginPath(); ctx.moveTo(xx, this.T); ctx.lineTo(xx, this.B); ctx.stroke(); });
      ctx.strokeStyle = axis;
      ctx.beginPath(); ctx.moveTo(this.L, Math.round(this.B) + 0.5); ctx.lineTo(this.R, Math.round(this.B) + 0.5); ctx.stroke();
      if (y.min < 0 && y.max > 0 && !y.log) {
        const y0 = Math.round(this.Y(0)) + 0.5;
        ctx.beginPath(); ctx.moveTo(this.L, y0); ctx.lineTo(this.R, y0); ctx.stroke();
      }
      yt.forEach((v) => UI.text(ctx, fy(v), this.L - 6, this.Y(v), { align: "right", color: muted, size: 11 }));
      xt.forEach((v) => UI.text(ctx, fx(v), this.X(v), this.B + 11, { align: "center", color: muted, size: 11 }));
      if (x.label) UI.text(ctx, x.label, (this.L + this.R) / 2, this.B + 27, { align: "center", color: UI.css("--ink2"), size: 12 });
      if (y.label) {
        ctx.save(); ctx.translate(12, (this.T + this.B) / 2); ctx.rotate(-Math.PI / 2);
        UI.text(ctx, y.label, 0, 0, { align: "center", color: UI.css("--ink2"), size: 12 });
        ctx.restore();
      }
      return this;
    }
    clip() {
      const c = this.ctx; c.save(); c.beginPath(); c.rect(this.L, this.T - 2, this.R - this.L, this.B - this.T + 4); c.clip();
    }
    unclip() { this.ctx.restore(); }
    line(xs, ys, s = {}) {
      const c = this.ctx; this.clip();
      c.strokeStyle = s.color || UI.css("--ink"); c.lineWidth = s.width || 2; c.lineJoin = "round"; c.lineCap = "round";
      c.globalAlpha = s.alpha == null ? 1 : s.alpha;
      c.setLineDash(s.dash || []);
      c.beginPath();
      let on = false;
      for (let i = 0; i < xs.length; i++) {
        const v = ys[i];
        if (v == null || !isFinite(v) || (this.o.y.log && v <= 0)) { on = false; continue; }
        const px = this.X(xs[i]), py = this.Y(v);
        if (!on) { c.moveTo(px, py); on = true; } else c.lineTo(px, py);
      }
      c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      this.unclip();
    }
    func(f, s = {}) {
      const n = s.n || 300, { x } = this.o, xs = [], ys = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const v = x.log ? x.min * Math.pow(x.max / x.min, t) : x.min + t * (x.max - x.min);
        xs.push(v); ys.push(f(v));
      }
      this.line(xs, ys, s);
    }
    area(xs, y0s, y1s, color, alpha = 0.15) {
      const c = this.ctx; this.clip();
      c.fillStyle = color; c.globalAlpha = alpha; c.beginPath();
      for (let i = 0; i < xs.length; i++) c.lineTo(this.X(xs[i]), this.Y(y1s[i]));
      for (let i = xs.length - 1; i >= 0; i--) c.lineTo(this.X(xs[i]), this.Y(y0s[i]));
      c.closePath(); c.fill(); c.globalAlpha = 1; this.unclip();
    }
    vline(x, s = {}) {
      const c = this.ctx, px = Math.round(this.X(x)) + 0.5;
      if (px < this.L - 1 || px > this.R + 1) return;
      c.strokeStyle = s.color || UI.css("--ink2"); c.lineWidth = s.width || 1.5; c.setLineDash(s.dash || []);
      c.beginPath(); c.moveTo(px, this.T); c.lineTo(px, this.B); c.stroke(); c.setLineDash([]);
      if (s.label) UI.text(c, s.label, px + (s.labelLeft ? -4 : 4), this.T + 8 + (s.labelDy || 0), { align: s.labelLeft ? "right" : "left", color: s.labelColor || s.color || UI.css("--ink2"), size: 11, halo: true });
    }
    hline(y, s = {}) {
      const c = this.ctx, py = Math.round(this.Y(y)) + 0.5;
      c.strokeStyle = s.color || UI.css("--ink2"); c.lineWidth = s.width || 1.5; c.setLineDash(s.dash || []);
      c.beginPath(); c.moveTo(this.L, py); c.lineTo(this.R, py); c.stroke(); c.setLineDash([]);
      if (s.label) UI.text(c, s.label, this.R - 4, py + (s.labelDy || -8), { align: "right", color: s.color || UI.css("--ink2"), size: 11, halo: true });
    }
    dot(x, y, s = {}) {
      const c = this.ctx, px = this.X(x), py = this.Y(y);
      if (!isFinite(px) || !isFinite(py)) return;
      c.fillStyle = s.color || UI.css("--ink"); c.strokeStyle = UI.css("--panel"); c.lineWidth = 2;
      c.beginPath(); c.arc(px, py, s.r || 4.5, 0, 2 * Math.PI); c.fill(); c.stroke();
      if (s.label) UI.text(c, s.label, px + (s.dx || 7), py + (s.dy || -9), { color: s.labelColor || UI.css("--ink"), size: 11.5, weight: s.bold ? "600" : "", halo: true, align: s.align || "left" });
    }
    label(x, y, str, s = {}) {
      UI.text(this.ctx, str, this.X(x) + (s.dx || 0), this.Y(y) + (s.dy || 0), Object.assign({ halo: true, size: 11.5 }, s));
    }
    // Étiquettes directes en bout de courbe, anti-chevauchement vertical simple.
    endLabels(items, xAt) {
      const c = this.ctx;
      const pts = items.map((it) => ({ it, y: this.Y(it.f(xAt)) })).filter((p) => isFinite(p.y));
      pts.sort((a, b) => a.y - b.y);
      const gap = 13, lo = this.T + 5, hi = this.B - 5;
      pts.forEach((p) => { p.y = UI.clamp(p.y, lo, hi); });
      for (let i = 1; i < pts.length; i++) if (pts[i].y - pts[i - 1].y < gap) pts[i].y = pts[i - 1].y + gap;
      for (let i = pts.length - 1; i >= 0; i--) {
        const lim = i === pts.length - 1 ? hi : pts[i + 1].y - gap;
        if (pts[i].y > lim) pts[i].y = lim;
      }
      pts.forEach((p) => UI.text(c, p.it.name, this.X(xAt) + 5, p.y, { color: p.it.color || UI.css("--ink2"), size: 11.5, weight: "600", halo: true }));
    }
    // Survol : crosshair + infobulle. getSeries() -> [{name, color, f(x)}]
    hoverable(cObj, getSeries, o = {}) {
      this.getSeries = getSeries;
      this.hoverFmt = o;
      const tip = UI.el("div", { class: "tip" });
      cObj.box.appendChild(tip);
      this.tip = tip;
      const move = (ev) => {
        const r = cObj.cv.getBoundingClientRect();
        const px = ev.clientX - r.left, py = ev.clientY - r.top;
        if (px < this.L || px > this.R || py < this.T || py > this.B) { if (this.hx != null) { this.hx = null; tip.style.display = "none"; cObj.redraw(); } return; }
        this.hx = this.invX(px); this.hpx = px; cObj.redraw();
      };
      cObj.cv.addEventListener("pointermove", move);
      cObj.cv.addEventListener("pointerleave", () => { this.hx = null; tip.style.display = "none"; cObj.redraw(); });
    }
    drawHover() {
      if (this.hx == null || !this.tip) return;
      const c = this.ctx, px = this.X(this.hx);
      c.strokeStyle = UI.css("--axis"); c.lineWidth = 1;
      c.beginPath(); c.moveTo(Math.round(px) + 0.5, this.T); c.lineTo(Math.round(px) + 0.5, this.B); c.stroke();
      const ser = this.getSeries();
      const fx = this.hoverFmt.x || ((v) => UI.fmtAuto(v));
      const fy = this.hoverFmt.y || ((v) => UI.fmtAuto(v));
      let html = `<div class="t-h">${this.hoverFmt.xName || "x"} = ${fx(this.hx)}</div>`;
      ser.forEach((s) => {
        const v = s.f(this.hx);
        if (!isFinite(v)) return;
        this.dot(this.hx, v, { color: s.color, r: 4 });
        html += `<div class="t-r"><span class="sw" style="background:${s.color}"></span>${s.name}<b>${fy(v)}</b></div>`;
      });
      this.tip.innerHTML = html;
      this.tip.style.display = "block";
      const bw = this.c.box.clientWidth, tw = this.tip.offsetWidth;
      this.tip.style.left = (px + 14 + tw > bw ? px - tw - 14 : px + 14) + "px";
      this.tip.style.top = this.T + 4 + "px";
    }
  }
  UI.Plot = Plot;

  // ------------------------------------------------------------------ View3D
  // Axes RM : z = B0 vers le haut. Rotation de la vue par glisser.
  class View3D {
    constructor(c, o = {}) {
      this.c = c; this.az = (o.az == null ? -120 : o.az) * DEG; this.el = (o.el == null ? 22 : o.el) * DEG;
      this.zoom = o.zoom || 0.36;
      let drag = null;
      c.cv.style.cursor = "grab";
      c.cv.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY, this.az, this.el]; c.cv.setPointerCapture(e.pointerId); c.cv.style.cursor = "grabbing"; });
      c.cv.addEventListener("pointermove", (e) => {
        if (!drag) return;
        this.az = drag[2] - (e.clientX - drag[0]) * 0.01;
        this.el = UI.clamp(drag[3] + (e.clientY - drag[1]) * 0.01, -10 * DEG, 89 * DEG);
        c.redraw();
      });
      const end = () => { drag = null; c.cv.style.cursor = "grab"; };
      c.cv.addEventListener("pointerup", end); c.cv.addEventListener("pointercancel", end);
    }
    begin(ctx, w, h) {
      this.ctx = ctx; this.cx = w / 2; this.cy = h * 0.56; this.s = Math.min(w, h) * this.zoom * 1.25;
      return this;
    }
    P(v) {
      const [x, y, z] = v, ca = Math.cos(this.az), sa = Math.sin(this.az);
      const u = ca * x - sa * y, yp = sa * x + ca * y;
      const up = z * Math.cos(this.el) + yp * Math.sin(this.el);
      const depth = yp * Math.cos(this.el) - z * Math.sin(this.el);
      return [this.cx + this.s * u, this.cy - this.s * up, depth];
    }
    axes(o = {}) {
      const c = this.ctx, col = UI.css("--axis"), ink = UI.css("--muted");
      // cercle unité du plan transverse
      c.strokeStyle = UI.css("--grid"); c.lineWidth = 1.2; c.setLineDash([4, 4]);
      c.beginPath();
      for (let i = 0; i <= 72; i++) { const a = (i / 72) * 2 * Math.PI, p = this.P([Math.cos(a), Math.sin(a), 0]); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }
      c.stroke(); c.setLineDash([]);
      const L = o.len || 1.25;
      [["x", [L, 0, 0]], ["y", [0, L, 0]], ["z", [0, 0, L]]].forEach(([n, v]) => {
        const a = this.P([-v[0] * 0.15, -v[1] * 0.15, -v[2] * 0.15]), b = this.P(v);
        UI.arrow(c, a[0], a[1], b[0], b[1], col, 1.3, 7);
        const W = 2 * this.cx, tx = b[0] + 18 > W ? b[0] - 14 : b[0] + 6;
        UI.text(c, n, tx, Math.max(12, b[1] - 2), { color: ink, size: 12, weight: "600" });
      });
      if (o.b0) { const b = this.P([0, 0, L]); UI.text(c, "B₀", b[0] + 16, b[1] - 2, { color: ink, size: 11 }); }
    }
    vec(v, color, width = 2.5, head = 9, alpha = 1) {
      const o = this.P([0, 0, 0]), p = this.P(v);
      this.ctx.globalAlpha = alpha; UI.arrow(this.ctx, o[0], o[1], p[0], p[1], color, width, head); this.ctx.globalAlpha = 1;
    }
    path(pts, color, width = 1.5, alpha = 1, dash) {
      const c = this.ctx; c.strokeStyle = color; c.lineWidth = width; c.globalAlpha = alpha; c.setLineDash(dash || []);
      c.beginPath(); pts.forEach((v, i) => { const p = this.P(v); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); });
      c.stroke(); c.globalAlpha = 1; c.setLineDash([]);
    }
  }
  UI.View3D = View3D;

  // -------------------------------------------------------------- animation
  UI.Anim = class {
    constructor(step) { this.step = step; this.playing = false; this._t = null; this._raf = null; }
    play() {
      if (this.playing) return; this.playing = true; this._t = null;
      const f = (ts) => {
        if (!this.playing) return;
        const dt = this._t == null ? 0 : Math.min(0.05, (ts - this._t) / 1000);
        this._t = ts;
        if (this.step(dt) === false) { this.pause(); return; }
        this._raf = requestAnimationFrame(f);
      };
      this._raf = requestAnimationFrame(f);
      if (this.onChange) this.onChange(true);
    }
    pause() { this.playing = false; if (this._raf) cancelAnimationFrame(this._raf); if (this.onChange) this.onChange(false); }
    toggle() { this.playing ? this.pause() : this.play(); }
  };
  // Bouton lecture/pause lié à une Anim
  UI.playButton = function (parent, anim) {
    const b = UI.button(parent, "▶ Lecture", () => anim.toggle(), "btn primary");
    anim.onChange = (p) => { b.innerHTML = p ? "❚❚ Pause" : "▶ Lecture"; };
    return b;
  };

  // -------------------------------------------------------------- images 2D
  // Dessine une carte (Float32Array, h×w) dans un rectangle, en conservant le ratio.
  // cmap : "gray" | "div" (bleu-gris-rouge, symétrique) | "phase" (cyclique)
  const _off = document.createElement("canvas");
  UI.image = function (ctx, data, w, h, rect, o = {}) {
    const lo = o.lo == null ? 0 : o.lo, hi = o.hi == null ? 1 : o.hi;
    _off.width = w; _off.height = h;
    const octx = _off.getContext("2d");
    const im = octx.createImageData(w, h), d = im.data;
    const cm = o.cmap || "gray";
    const h2 = (c) => { c = c.replace("#", ""); return [0, 2, 4].map((k) => parseInt(c.slice(k, k + 2), 16)); };
    const cn = h2(UI.css("--neg")), cmid = h2(UI.css("--mid")), cp = h2(UI.css("--pos"));
    for (let i = 0; i < w * h; i++) {
      let t = (data[i] - lo) / (hi - lo);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      let r, g, b;
      if (cm === "gray") { r = g = b = 255 * t; }
      else if (cm === "div") {
        const u = 2 * t - 1, e = u < 0 ? cn : cp, a = Math.abs(u);          // -1..1, gris au centre
        r = cmid[0] + (e[0] - cmid[0]) * a; g = cmid[1] + (e[1] - cmid[1]) * a; b = cmid[2] + (e[2] - cmid[2]) * a;
      } else { // phase cyclique : bleu foncé → blanc → rouge → bleu foncé
        const a = t * 4;
        const stops = [[20, 20, 90], [80, 80, 190], [250, 250, 250], [190, 40, 40], [20, 20, 90]];
        const k = Math.min(3, Math.floor(a)), f = a - k;
        r = stops[k][0] + f * (stops[k + 1][0] - stops[k][0]);
        g = stops[k][1] + f * (stops[k + 1][1] - stops[k][1]);
        b = stops[k][2] + f * (stops[k + 1][2] - stops[k][2]);
      }
      if (o.mask && o.mask[i] < 0.05) { r = g = b = 0; }
      d[4 * i] = r; d[4 * i + 1] = g; d[4 * i + 2] = b; d[4 * i + 3] = 255;
    }
    octx.putImageData(im, 0, 0);
    const s = Math.min(rect.w / w, rect.h / h);
    let dw = w * s, dh = h * s, dx = rect.x + (rect.w - dw) / 2, dy = rect.y + (rect.h - dh) / 2;
    if (o.stretch) { dw = rect.w; dh = rect.h; dx = rect.x; dy = rect.y; }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#000"; ctx.fillRect(dx, dy, dw, dh);
    ctx.drawImage(_off, dx, dy, dw, dh);
    return { x: dx, y: dy, w: dw, h: dh, s };
  };
  UI.percentile = function (arr, p) {
    const a = Float32Array.from(arr).sort();
    return a[Math.min(a.length - 1, Math.floor(p * a.length))];
  };

  window.UI = UI;
})();
