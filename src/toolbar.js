(function bootstrapToolbar(global) {
  "use strict";
  var ns = global.PersistentHighlighter;

  // ─────────────────────────────────────────────────────────────────────────
  // Barra flotante al seleccionar texto + menú al hacer clic en un resaltado.
  // Vive dentro de un Shadow DOM para que el CSS de la página no la rompa.
  // ─────────────────────────────────────────────────────────────────────────

  var ICONS = {
    comment: '<svg viewBox="0 0 16 16"><path d="M3 3h10a1 1 0 011 1v6a1 1 0 01-1 1H7l-3 3v-3H3a1 1 0 01-1-1V4a1 1 0 011-1z"/></svg>',
    note:    '<svg viewBox="0 0 16 16"><path d="M3 2h10v8l-4 4H3z"/><path d="M9 14v-4h4"/></svg>',
    copy:    '<svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M3.5 10.5h-1v-8h8v1"/></svg>',
    trash:   '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9"/></svg>',
    star:    '<svg viewBox="0 0 16 16"><path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z"/></svg>',
    close:   '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>'
  };

  var CSS_TEXT = [
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:'Segoe UI Variable','Segoe UI',system-ui,-apple-system,Arial,sans-serif}",
    "svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}",
    ".bar{position:absolute;display:flex;align-items:center;gap:2px;padding:5px;border-radius:12px;background:#1d1b19;color:#f5f1ea;",
    "box-shadow:0 8px 28px rgba(0,0,0,.28),0 0 0 1px rgba(255,255,255,.06) inset;animation:in .12s ease-out;user-select:none;z-index:2}",
    ".bar[hidden],.pop[hidden]{display:none}",
    ".dot{width:22px;height:22px;margin:0 1px;border-radius:999px;border:2px solid rgba(255,255,255,.18);cursor:pointer;padding:0;transition:transform .1s}",
    ".dot:hover{transform:scale(1.18);border-color:#fff}",
    ".dot.is-active{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.35)}",
    ".sep{width:1px;height:18px;margin:0 4px;background:rgba(255,255,255,.18)}",
    ".ic{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;min-width:28px;padding:0 7px;border:0;border-radius:8px;",
    "background:transparent;color:inherit;font-size:12px;font-weight:600;cursor:pointer}",
    ".ic:hover{background:rgba(255,255,255,.12)}",
    ".pop{position:absolute;width:300px;padding:12px;border-radius:14px;background:#fffdf9;color:#1d1b19;",
    "box-shadow:0 14px 40px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.07);animation:in .12s ease-out;z-index:1}",
    ".pop .row{display:flex;align-items:center;gap:4px}",
    ".pop .dot{border-color:rgba(0,0,0,.12)}",
    ".pop .dot:hover,.pop .dot.is-active{border-color:#1d1b19;box-shadow:none}",
    ".pop .label{margin-left:auto;font-size:11px;font-weight:600;color:#7b7066;text-transform:uppercase;letter-spacing:.06em}",
    ".pop textarea{display:block;width:100%;min-height:78px;margin:10px 0 8px;padding:8px 10px;border:1px solid rgba(0,0,0,.14);border-radius:10px;",
    "background:#fff;color:#1d1b19;font-size:13px;line-height:1.45;resize:vertical;outline:none}",
    ".pop textarea:focus{border-color:#1d1b19}",
    ".pop .foot{display:flex;align-items:center;gap:2px}",
    ".pop .ic{color:#4b443d}",
    ".pop .ic:hover{background:rgba(0,0,0,.06);color:#1d1b19}",
    ".pop .ic.is-on{color:#d97706}",
    ".pop .ic.danger:hover{background:#fdecea;color:#b42318}",
    ".pop .saved{margin-left:auto;font-size:11px;color:#8a8076;min-width:52px;text-align:right}",
    ".pop .tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}",
    ".pop .tag{padding:2px 8px;border-radius:999px;background:#f1ebe3;font-size:11px;color:#5f564d}",
    "@keyframes in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}",
    "@media (prefers-color-scheme:dark){.pop{background:#24221f;color:#f3efe9;box-shadow:0 14px 40px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.08)}",
    ".pop textarea{background:#1b1917;color:#f3efe9;border-color:rgba(255,255,255,.14)}.pop textarea:focus{border-color:#f3efe9}",
    ".pop .ic{color:#cfc6bc}.pop .ic:hover{background:rgba(255,255,255,.08);color:#fff}.pop .dot:hover,.pop .dot.is-active{border-color:#fff}",
    ".pop .tag{background:#34302b;color:#d6cec4}.pop .label,.pop .saved{color:#a59a8f}}"
  ].join("");

  function SelectionUI(app) {
    this.app        = app; // { storage, renderer, notesBoard }
    this.settings   = ns.normalizeSettings({});
    this.host       = null;
    this.root       = null;
    this.bar        = null;
    this.pop        = null;
    this.popRecord  = null;
    this.saveTimer  = 0;
    this.showTimer  = 0;
  }

  SelectionUI.prototype.init = async function () {
    var self = this;
    try { this.settings = await this.app.storage.getSettings(); } catch (_e) {}

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "local" && changes[ns.SETTINGS_KEY]) {
        self.settings = ns.normalizeSettings(changes[ns.SETTINGS_KEY].newValue);
        if (!self.settings.selectionToolbar) self.hideBar();
      }
    });

    document.addEventListener("mouseup", function (e) {
      if (self._isOwnEvent(e) || e.button !== 0) return;
      clearTimeout(self.showTimer);
      self.showTimer = setTimeout(function () { self.maybeShowBar(); }, 10);
    });

    document.addEventListener("keyup", function (e) {
      if (e.key === "Escape") { self.hideBar(); self.hidePopover(); return; }
      if (e.shiftKey || e.key === "Shift") {
        clearTimeout(self.showTimer);
        self.showTimer = setTimeout(function () { self.maybeShowBar(); }, 10);
      }
    });

    document.addEventListener("mousedown", function (e) {
      if (self._isOwnEvent(e)) return;
      self.hideBar();
      if (!(e.target && e.target.closest && e.target.closest("." + ns.HIGHLIGHT_CLASS))) self.hidePopover();
    }, true);

    document.addEventListener("selectionchange", function () {
      if (!self.bar || self.bar.hidden) return;
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) self.hideBar();
    });

    // Clic en un resaltado → menú de edición
    document.addEventListener("click", function (e) {
      if (self._isOwnEvent(e) || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      var mark = e.target && e.target.closest ? e.target.closest("." + ns.HIGHLIGHT_CLASS) : null;
      if (!mark || mark.closest("a, button, [role='button'], label, summary")) return;
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed && ns.normalizeText(sel.toString())) return;
      var id = mark.getAttribute(ns.HIGHLIGHT_ATTR);
      if (id) void self.openPopover(id, mark);
    });
  };

  SelectionUI.prototype._isOwnEvent = function (e) {
    return Boolean(this.host && e.composedPath && e.composedPath().indexOf(this.host) !== -1);
  };

  SelectionUI.prototype._ensureHost = function () {
    if (this.host && this.host.isConnected) return;
    var host = document.createElement("div");
    host.setAttribute(ns.UI_ATTR, "toolbar");
    host.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;z-index:2147483646;";
    var root = host.attachShadow({ mode: "open" });
    var style = document.createElement("style");
    style.textContent = CSS_TEXT;
    root.appendChild(style);

    var bar = document.createElement("div");
    bar.className = "bar";
    bar.hidden = true;
    root.appendChild(bar);

    var pop = document.createElement("div");
    pop.className = "pop";
    pop.hidden = true;
    root.appendChild(pop);

    // Evita que pulsar la barra borre la selección de la página
    bar.addEventListener("mousedown", function (e) { e.preventDefault(); });

    document.documentElement.appendChild(host);
    this.host = host;
    this.root = root;
    this.bar  = bar;
    this.pop  = pop;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // BARRA DE SELECCIÓN
  // ══════════════════════════════════════════════════════════════════════════

  SelectionUI.prototype.maybeShowBar = function () {
    if (!this.settings.selectionToolbar) return;
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    var text = ns.normalizeText(sel.toString());
    if (!text) return;
    var range = sel.getRangeAt(0);
    var anchor = range.commonAncestorContainer;
    var el = anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement;
    if (!el || el.closest(ns.UI_SELECTOR) || el.closest("input, textarea, [contenteditable=''], [contenteditable='true']")) return;

    this.app.renderer.rememberCurrentSelection();
    this.hidePopover();
    this._renderBar();

    var rects = range.getClientRects();
    var first = rects.length ? rects[0] : range.getBoundingClientRect();
    var box   = range.getBoundingClientRect();
    if (!box.width && !box.height) return;
    this._place(this.bar, first.left + (rects.length > 1 ? 0 : first.width / 2), first.top, box.bottom, true);
  };

  SelectionUI.prototype._renderBar = function () {
    var self = this;
    this._ensureHost();
    var bar = this.bar;
    bar.innerHTML = "";
    var current = this.settings.selectedColor;

    ns.QUICK_COLORS.forEach(function (colorId) {
      var b = document.createElement("button");
      b.className = "dot" + (current === colorId ? " is-active" : "");
      b.style.background = ns.COLOR_HEX[colorId];
      b.title = ns.getColorLabel(colorId);
      b.setAttribute("aria-label", "Resaltar: " + ns.getColorLabel(colorId));
      b.addEventListener("click", function () { void self._highlight(colorId, false); });
      bar.appendChild(b);
    });

    bar.appendChild(el("span", "sep"));
    bar.appendChild(this._iconBtn("comment", "Resaltar y comentar", function () {
      var resolved = ns.resolveHighlightColor(self.settings.selectedColor, self.settings.customColor);
      void self._highlight(resolved.color, true, resolved.customColor);
    }));
    bar.appendChild(this._iconBtn("note", "Crear nota con la selección", function () { void self._noteFromSelection(); }));
    bar.appendChild(this._iconBtn("copy", "Copiar texto", function () { void self._copySelection(); }));
    bar.hidden = false;
  };

  SelectionUI.prototype._iconBtn = function (icon, title, onClick, extraClass) {
    var b = document.createElement("button");
    b.className = "ic" + (extraClass ? " " + extraClass : "");
    b.title = title;
    b.setAttribute("aria-label", title);
    b.innerHTML = ICONS[icon];
    b.addEventListener("click", onClick);
    return b;
  };

  SelectionUI.prototype._highlight = async function (color, openComment, customColor) {
    this.hideBar();
    try {
      var record = await this.app.renderer.applySelectionHighlight(color, customColor);
      if (color !== "custom" && this.settings.selectedColor !== color) {
        void this.app.storage.saveSettings({ selectedColor: color });
      }
      if (openComment && record) {
        var mark = this.app.renderer.findHighlightElement(record.id);
        if (mark) await this.openPopover(record.id, mark, true);
      }
    } catch (err) {
      console.warn("Annotate:", err && err.message);
    }
  };

  SelectionUI.prototype._noteFromSelection = async function () {
    var text = this.app.renderer.getSelectedText();
    this.hideBar();
    if (!text) return;
    await this.app.notesBoard.createNoteFromText(this.settings.noteColor, text);
  };

  SelectionUI.prototype._copySelection = async function () {
    var text = this.app.renderer.getSelectedText();
    this.hideBar();
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch (_e) {}
  };

  SelectionUI.prototype.hideBar = function () {
    clearTimeout(this.showTimer);
    if (this.bar) this.bar.hidden = true;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MENÚ DE UN RESALTADO
  // ══════════════════════════════════════════════════════════════════════════

  SelectionUI.prototype.openPopover = async function (id, mark, focusComment) {
    var self = this;
    var records = await this.app.storage.getHighlights(ns.getDocumentUrl());
    var rec = records.find(function (r) { return r.id === id; });
    if (!rec) return;

    this.hideBar();
    this._ensureHost();
    this.popRecord = rec;
    var pop = this.pop;
    pop.innerHTML = "";

    // Colores
    var row = el("div", "row");
    ns.QUICK_COLORS.forEach(function (colorId) {
      var b = document.createElement("button");
      b.className = "dot" + (!rec.customColor && rec.color === colorId ? " is-active" : "");
      b.style.background = ns.COLOR_HEX[colorId];
      b.title = ns.getColorLabel(colorId);
      b.addEventListener("click", async function () {
        await self._patch({ color: colorId, customColor: undefined, category: categoryFor(colorId) });
        row.querySelectorAll(".dot").forEach(function (d) { d.classList.remove("is-active"); });
        b.classList.add("is-active");
        label.textContent = ns.getColorLabel(colorId);
      });
      row.appendChild(b);
    });
    var label = el("span", "label");
    label.textContent = ns.getColorLabel(rec.customColor ? "custom" : rec.color);
    row.appendChild(label);
    pop.appendChild(row);

    // Comentario
    var ta = document.createElement("textarea");
    ta.placeholder = "Comentario, explicación o pregunta para repasar…";
    ta.value = rec.comment || "";
    pop.appendChild(ta);

    var saved = el("span", "saved");
    ta.addEventListener("input", function () {
      clearTimeout(self.saveTimer);
      saved.textContent = "…";
      self.saveTimer = setTimeout(async function () {
        await self._patch({ comment: ta.value.trim() });
        saved.textContent = "Guardado";
      }, 400);
    });
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); self.hidePopover(); }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); self.hidePopover(); }
    });

    // Pie
    var foot = el("div", "foot");
    var favBtn = this._iconBtn("star", rec.isFavorite ? "Quitar de favoritos" : "Marcar como favorito", async function () {
      var next = !self.popRecord.isFavorite;
      await self._patch({ isFavorite: next });
      favBtn.classList.toggle("is-on", next);
      favBtn.title = next ? "Quitar de favoritos" : "Marcar como favorito";
    }, rec.isFavorite ? "is-on" : "");
    foot.appendChild(favBtn);
    foot.appendChild(this._iconBtn("copy", "Copiar texto", async function () {
      try { await navigator.clipboard.writeText(rec.selectedText); saved.textContent = "Copiado"; } catch (_e) {}
    }));
    foot.appendChild(this._iconBtn("note", "Crear nota con este texto", async function () {
      self.hidePopover();
      await self.app.notesBoard.createNoteFromText(self.settings.noteColor, rec.selectedText);
    }));
    foot.appendChild(this._iconBtn("trash", "Eliminar resaltado", async function () {
      self.hidePopover();
      await self.app.renderer.removeHighlightById(rec.id);
    }, "danger"));
    foot.appendChild(saved);
    pop.appendChild(foot);

    if (rec.tags && rec.tags.length) {
      var tags = el("div", "tags");
      rec.tags.forEach(function (t) {
        var chip = el("span", "tag");
        chip.textContent = "#" + t;
        tags.appendChild(chip);
      });
      pop.appendChild(tags);
    }

    pop.hidden = false;
    var marks = this.app.renderer.getHighlightElements(id);
    var lastRect = (marks[marks.length - 1] || mark).getBoundingClientRect();
    var firstRect = (marks[0] || mark).getBoundingClientRect();
    this._place(pop, firstRect.left + 140, firstRect.top, lastRect.bottom, false);
    if (focusComment || !rec.comment) ta.focus({ preventScroll: true });
  };

  SelectionUI.prototype._patch = async function (patch) {
    if (!this.popRecord) return;
    var updated = await this.app.storage.patchHighlight(ns.getDocumentUrl(), this.popRecord.id, patch);
    if (updated) {
      this.popRecord = updated;
      this.app.renderer._decorate(updated);
    }
  };

  SelectionUI.prototype.hidePopover = function () {
    if (!this.pop || this.pop.hidden) return;
    var ta = this.pop.querySelector("textarea");
    // Guarda en el momento si quedaba un cambio pendiente
    if (this.saveTimer && ta && this.popRecord && ta.value.trim() !== (this.popRecord.comment || "")) {
      clearTimeout(this.saveTimer);
      void this._patch({ comment: ta.value.trim() });
    }
    this.saveTimer = 0;
    this.pop.hidden = true;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // POSICIONAMIENTO
  // ══════════════════════════════════════════════════════════════════════════

  // Coloca `node` centrado en x, encima de `top` o, si no cabe, debajo de `bottom`
  SelectionUI.prototype._place = function (node, x, top, bottom, preferAbove) {
    var w = node.offsetWidth;
    var h = node.offsetHeight;
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var vh = window.innerHeight;
    var left = Math.min(Math.max(8, x - w / 2), vw - w - 8);
    var above = top - h - 10;
    var below = bottom + 10;
    var y;
    if (preferAbove) y = above >= 8 ? above : below;
    else y = below + h <= vh - 8 ? below : Math.max(8, above);
    node.style.left = (left + window.scrollX) + "px";
    node.style.top  = (y + window.scrollY) + "px";
  };

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function categoryFor(color) {
    return (ns.COLOR_OPTIONS.find(function (o) { return o.id === color; }) || {}).category || "general";
  }

  ns.SelectionUI = SelectionUI;
})(globalThis);
