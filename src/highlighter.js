(function bootstrapHighlighter(global) {
  "use strict";
  var ns = global.PersistentHighlighter;

  // Caracteres de contexto guardados antes/después del texto para reencontrarlo
  var CONTEXT_CHARS = 64;
  // Nodos cuyo texto nunca se resalta ni cuenta para las posiciones
  var SKIP_SELECTOR = "script, style, noscript, textarea, input, select, option, template, svg, math, " + ns.UI_SELECTOR;
  var WS_RE = /\s/;

  // ─────────────────────────────────────────────────────────────────────────
  // Modelo
  //   Cada resaltado se describe por su texto normalizado + contexto (prefijo,
  //   sufijo) + posición aproximada en el texto de la página. Para pintarlo se
  //   envuelve CADA nodo de texto afectado en su propio <mark>, así una
  //   selección que cruza párrafos no rompe la maquetación.
  // ─────────────────────────────────────────────────────────────────────────

  function HighlightRenderer(storage) {
    this.storage            = storage;
    this.mutationObserver   = null;
    this.restoreTimerId     = 0;
    this.lastSelectionRange = null;
    this.unresolvedIds      = new Set();
    this._lastScanAt        = 0;
    this._queue             = Promise.resolve();
  }

  // Serializa las operaciones que tocan el DOM (aplicar, borrar, restaurar)
  HighlightRenderer.prototype._enqueue = function (task) {
    var run = this._queue.then(task, task);
    this._queue = run.catch(function () {});
    return run;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MAPA DE TEXTO
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype.buildTextMap = function (root) {
    root = root || document.body;
    var entries = [];
    var chunks  = [];
    var pos     = 0;
    if (!root) return { text: "", entries: entries, byNode: new Map() };

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.data) return NodeFilter.FILTER_REJECT;
        var pe = node.parentElement;
        if (!pe || pe.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var byNode = new Map();
    var cur = walker.nextNode();
    while (cur) {
      var entry = { node: cur, start: pos, end: pos + cur.data.length };
      entries.push(entry);
      byNode.set(cur, entry);
      chunks.push(cur.data);
      pos = entry.end;
      cur = walker.nextNode();
    }
    return { text: chunks.join(""), entries: entries, byNode: byNode };
  };

  // Versión con espacios colapsados + tabla para volver a offsets reales
  function buildNormalized(text) {
    var out = [];
    var idx = [];
    var inSpace = true; // ignora espacios iniciales
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var code = text.charCodeAt(i);
      var isSpace = code === 32 || code === 10 || code === 9 || code === 13 || code === 12 ||
        (code > 127 && WS_RE.test(ch));
      if (isSpace) {
        if (!inSpace) { out.push(" "); idx.push(i); }
        inSpace = true;
      } else {
        out.push(ch);
        idx.push(i);
        inSpace = false;
      }
    }
    return { text: out.join(""), map: idx };
  }

  // Busca la entrada (nodo de texto) que contiene el offset global
  function findEntryIndex(entries, offset) {
    var lo = 0, hi = entries.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (entries[mid].end <= offset) lo = mid + 1;
      else if (entries[mid].start > offset) hi = mid - 1;
      else return mid;
    }
    return -1;
  }

  // Convierte un Range del DOM en offsets globales del mapa
  HighlightRenderer.prototype._rangeToOffsets = function (range, map) {
    var start = -1, end = -1;
    var se = range.startContainer.nodeType === Node.TEXT_NODE ? map.byNode.get(range.startContainer) : null;
    var ee = range.endContainer.nodeType === Node.TEXT_NODE ? map.byNode.get(range.endContainer) : null;

    if (se) start = se.start + range.startOffset;
    if (ee) end = ee.start + range.endOffset;

    if (start < 0 || end < 0) {
      for (var i = 0; i < map.entries.length; i++) {
        var e = map.entries[i];
        if (!range.intersectsNode(e.node)) continue;
        if (start < 0) start = e.start + (e.node === range.startContainer ? range.startOffset : 0);
        if (!ee) end = e.start + (e.node === range.endContainer ? range.endOffset : e.node.data.length);
      }
    }
    if (start < 0 || end <= start) return null;

    // Recorta espacios en los extremos
    while (start < end && WS_RE.test(map.text.charAt(start))) start++;
    while (end > start && WS_RE.test(map.text.charAt(end - 1))) end--;
    return end > start ? { start: start, end: end } : null;
  };

  // Intervalos ocupados por los resaltados ya pintados: { id: {start, end} }
  HighlightRenderer.prototype._collectSpans = function (map) {
    var spans = {};
    var HL = "." + ns.HIGHLIGHT_CLASS;
    for (var i = 0; i < map.entries.length; i++) {
      var e = map.entries[i];
      var mark = e.node.parentElement && e.node.parentElement.closest(HL);
      if (!mark) continue;
      var id = mark.getAttribute(ns.HIGHLIGHT_ATTR);
      if (!id) continue;
      var span = spans[id];
      if (!span) spans[id] = { start: e.start, end: e.end };
      else { span.start = Math.min(span.start, e.start); span.end = Math.max(span.end, e.end); }
    }
    return spans;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // APLICAR RESALTADO
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype.applySelectionHighlight = function (color, customColor) {
    var self = this;
    return this._enqueue(async function () {
      var range = self._currentRange();
      if (!range) throw new Error("Selecciona un texto antes de resaltar.");

      var map = self.buildTextMap();
      var off = self._rangeToOffsets(range, map);
      if (!off) throw new Error("Selecciona un texto de la página antes de resaltar.");

      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      self.lastSelectionRange = null;

      var resolvedCustom = color === "custom" ? ns.sanitizeColorHex(customColor) : undefined;
      return self._applyOffsets(map, off.start, off.end, color || ns.DEFAULT_COLOR, resolvedCustom);
    });
  };

  HighlightRenderer.prototype._applyOffsets = async function (map, s, e, color, custom) {
    var self  = this;
    var url   = ns.getDocumentUrl();
    var spans = this._collectSpans(map);
    var overlapping = Object.keys(spans).filter(function (id) {
      return spans[id].start < e && spans[id].end > s;
    });

    var records = await this.storage.getHighlights(url);
    var byId = {};
    records.forEach(function (r) { byId[r.id] = r; });

    // Caso simple: la selección coincide con un resaltado existente → solo recolorear
    if (overlapping.length === 1) {
      var only = spans[overlapping[0]];
      var rec0 = byId[overlapping[0]];
      if (rec0 && only.start === s && only.end === e) {
        var recolored = Object.assign({}, rec0, {
          color: color, customColor: custom, category: categoryFor(color), updatedAt: new Date().toISOString()
        });
        this._decorate(recolored);
        await this.storage.saveHighlight(recolored);
        return recolored;
      }
    }

    // Caso general: los resaltados solapados se recortan a la parte que queda
    // fuera de la selección; la selección se convierte en un resaltado nuevo.
    var removeIds = [];
    var upserts   = [];
    var wraps     = [];
    var inherited = null;

    overlapping.forEach(function (id) {
      var span = spans[id];
      var rec  = byId[id];
      self._unwrapId(id);
      if (!rec) return;

      var pieces = [];
      var before = trimOffsets(map.text, span.start, Math.min(span.end, s));
      var after  = trimOffsets(map.text, Math.max(span.start, e), span.end);
      if (span.start < s && before) pieces.push(before);
      if (span.end > e && after) pieces.push(after);

      if (!pieces.length) {
        removeIds.push(id);
        if (!inherited && (rec.comment || (rec.tags && rec.tags.length) || rec.isFavorite)) inherited = rec;
        return;
      }
      pieces.forEach(function (p, k) {
        var piece = Object.assign({}, rec, self._describe(map, p.start, p.end), {
          id: k === 0 ? rec.id : ns.createId(),
          updatedAt: new Date().toISOString()
        });
        upserts.push(piece);
        wraps.push({ start: p.start, end: p.end, record: piece });
      });
    });

    var newRec = this._buildRecord(map, s, e, color, custom);
    if (inherited) {
      newRec.comment    = inherited.comment || "";
      newRec.tags       = (inherited.tags || []).slice();
      newRec.isFavorite = Boolean(inherited.isFavorite);
      newRec.review     = inherited.review;
    }
    upserts.push(newRec);
    wraps.push({ start: s, end: e, record: newRec });

    // De atrás hacia delante: dividir nodos posteriores no invalida los anteriores
    wraps.sort(function (a, b) { return b.start - a.start; });
    wraps.forEach(function (w) { self._wrapOffsets(map, w.start, w.end, w.record); });
    this._discardOwnMutations();

    await this.storage.replaceHighlights(url, removeIds, upserts);
    return newRec;
  };

  function trimOffsets(text, start, end) {
    while (start < end && WS_RE.test(text.charAt(start))) start++;
    while (end > start && WS_RE.test(text.charAt(end - 1))) end--;
    return end > start ? { start: start, end: end } : null;
  }

  function categoryFor(color) {
    return (ns.COLOR_OPTIONS.find(function (o) { return o.id === color; }) || {}).category || "general";
  }

  HighlightRenderer.prototype._describe = function (map, s, e) {
    var raw = map.text.slice(s, e);
    return {
      selectedText: ns.normalizeText(raw),
      prefix:       ns.normalizeText(map.text.slice(Math.max(0, s - CONTEXT_CHARS), s)),
      suffix:       ns.normalizeText(map.text.slice(e, e + CONTEXT_CHARS)),
      textPos:      s,
      docLength:    map.text.length
    };
  };

  HighlightRenderer.prototype._buildRecord = function (map, s, e, color, custom) {
    var ts = new Date().toISOString();
    var d  = this._describe(map, s, e);
    return Object.assign(d, {
      id:          ns.createId(),
      url:         ns.getDocumentUrl(),
      pageTitle:   getPageTitle(),
      color:       color,
      customColor: custom,
      category:    categoryFor(color),
      createdAt:   ts,
      updatedAt:   ts,
      comment:     "",
      tags:        [],
      isFavorite:  false
    });
  };

  function getPageTitle() {
    var t = ns.normalizeText(document.title || "");
    if (global.__annotatePdfMode) {
      t = t.replace(/\s*·\s*Annotate PDF$/, "");
    }
    return t;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PINTAR / DESPINTAR
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype._wrapOffsets = function (map, start, end, record) {
    var segs = [];
    var i = findEntryIndex(map.entries, start);
    if (i < 0) return 0;
    for (; i < map.entries.length; i++) {
      var en = map.entries[i];
      if (en.start >= end) break;
      var a = Math.max(start, en.start) - en.start;
      var b = Math.min(end, en.end) - en.start;
      if (b > a) segs.push({ node: en.node, a: a, b: b });
    }

    var count = 0;
    for (var k = segs.length - 1; k >= 0; k--) {
      var seg  = segs[k];
      var node = seg.node;
      if (!node.parentNode || seg.b > node.data.length) continue;
      if (!node.data.slice(seg.a, seg.b).trim()) continue; // solo espacios: no se envuelve
      if (seg.b < node.data.length) node.splitText(seg.b);
      var target = seg.a > 0 ? node.splitText(seg.a) : node;
      var mark = this._makeMarkEl(record);
      target.parentNode.insertBefore(mark, target);
      mark.appendChild(target);
      count++;
    }
    if (count) this._decorate(record);
    return count;
  };

  HighlightRenderer.prototype._makeMarkEl = function (rec) {
    var m = document.createElement("mark");
    m.className = ns.HIGHLIGHT_CLASS;
    m.setAttribute(ns.HIGHLIGHT_ATTR, rec.id);
    return m;
  };

  // Aplica color, comentario y marcas de inicio/fin a todos los segmentos
  HighlightRenderer.prototype._decorate = function (rec) {
    var marks = this.getHighlightElements(rec.id);
    if (!marks.length) return;
    var colorClasses = ns.COLOR_OPTIONS.map(function (o) { return ns.HIGHLIGHT_CLASS + "--" + o.id; });
    colorClasses.push(ns.HIGHLIGHT_CLASS + "--custom");
    var hasComment = Boolean(rec.comment && rec.comment.trim());

    marks.forEach(function (m, idx) {
      m.classList.remove.apply(m.classList, colorClasses);
      m.classList.add(ns.HIGHLIGHT_CLASS + "--" + (rec.color || ns.DEFAULT_COLOR));
      m.setAttribute("data-ph-color", rec.color || ns.DEFAULT_COLOR);
      if (rec.customColor) m.style.setProperty("--ph-custom-highlight", rec.customColor);
      else m.style.removeProperty("--ph-custom-highlight");
      m.classList.toggle("ph-highlight--has-comment", hasComment && idx === marks.length - 1);
      if (hasComment) m.title = rec.comment;
      else m.removeAttribute("title");
    });
  };

  HighlightRenderer.prototype._unwrapId = function (id) {
    var marks = this.getHighlightElements(id);
    marks.forEach(function (el) {
      var p = el.parentNode;
      if (!p) return;
      while (el.firstChild) p.insertBefore(el.firstChild, el);
      p.removeChild(el);
    });
    return marks.length;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RESTAURAR
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype.restoreHighlightsForCurrentPage = function () {
    var self = this;
    return this._enqueue(async function () {
      var records = await self.storage.getHighlights(ns.getDocumentUrl());
      return self._restoreRecords(records);
    });
  };

  HighlightRenderer.prototype._restoreRecords = function (records) {
    var self = this;
    var missing = records.filter(function (r) { return r.selectedText && !self.findHighlightElement(r.id); });
    // Mantiene al día color/comentario de los que ya están pintados
    records.forEach(function (r) { if (self.findHighlightElement(r.id)) self._decorate(r); });
    if (!missing.length) return 0;

    var map = this.buildTextMap();
    if (!map.text) return 0;
    var norm = buildNormalized(map.text);

    var spans = this._collectSpans(map);
    var occupied = Object.keys(spans).map(function (id) { return spans[id]; });
    var targets = [];

    missing.forEach(function (rec) {
      var off = locate(rec, map, norm, occupied);
      if (!off) { self.unresolvedIds.add(rec.id); return; }
      self.unresolvedIds.delete(rec.id);
      occupied.push(off);
      targets.push({ start: off.start, end: off.end, record: rec });
    });

    targets.sort(function (a, b) { return b.start - a.start; });
    var count = 0;
    targets.forEach(function (t) {
      try { if (self._wrapOffsets(map, t.start, t.end, t.record)) count++; } catch (_e) {}
    });
    this._discardOwnMutations();
    return count;
  };

  function overlapsAny(list, s, e) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].start < e && list[i].end > s) return true;
    }
    return false;
  }

  function commonSuffixLength(a, b) {
    var n = 0;
    while (n < a.length && n < b.length && a.charAt(a.length - 1 - n) === b.charAt(b.length - 1 - n)) n++;
    return n;
  }

  function commonPrefixLength(a, b) {
    var n = 0;
    while (n < a.length && n < b.length && a.charAt(n) === b.charAt(n)) n++;
    return n;
  }

  // Encuentra la mejor aparición del texto del registro en la página
  function locate(rec, map, norm, occupied) {
    var needle = ns.normalizeText(rec.selectedText);
    if (!needle) return null;
    var haystack = norm.text;

    var candidates = [];
    var from = 0;
    while (candidates.length < 500) {
      var i = haystack.indexOf(needle, from);
      if (i === -1) break;
      candidates.push(i);
      from = i + 1;
    }
    // Último recurso: sin distinguir mayúsculas (p. ej. CSS text-transform)
    if (!candidates.length) {
      var lowerHay = haystack.toLowerCase();
      var lowerNeedle = needle.toLowerCase();
      from = 0;
      while (candidates.length < 500) {
        var j = lowerHay.indexOf(lowerNeedle, from);
        if (j === -1) break;
        candidates.push(j);
        from = j + 1;
      }
    }
    if (!candidates.length) return null;

    var prefix = ns.normalizeText(rec.prefix || "");
    var suffix = ns.normalizeText(rec.suffix || "");
    var hasPos = Number.isFinite(rec.textPos) && Number.isFinite(rec.docLength) && rec.docLength > 0;

    var best = null;
    var bestScore = -Infinity;
    candidates.forEach(function (ci) {
      var rawStart = norm.map[ci];
      var rawEnd   = norm.map[ci + needle.length - 1] + 1;
      if (overlapsAny(occupied, rawStart, rawEnd)) return;

      var before = haystack.slice(Math.max(0, ci - prefix.length - 1), ci).trim();
      var after  = haystack.slice(ci + needle.length, ci + needle.length + suffix.length + 1).trim();
      var score  = commonSuffixLength(before, prefix) + commonPrefixLength(after, suffix);
      if (hasPos) {
        var expected = rec.textPos / rec.docLength;
        var actual   = rawStart / Math.max(1, map.text.length);
        score -= Math.abs(expected - actual) * 40;
      }
      if (score > bestScore) { bestScore = score; best = { start: rawStart, end: rawEnd }; }
    });
    return best;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ELIMINAR / SINCRONIZAR
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype.removeHighlightById = function (id) {
    var self = this;
    return this._enqueue(async function () {
      var n = self._unwrapId(id);
      self._discardOwnMutations();
      await self.storage.removeHighlight(ns.getDocumentUrl(), id);
      return n > 0;
    });
  };

  HighlightRenderer.prototype.clearCurrentPage = function () {
    var self = this;
    return this._enqueue(async function () {
      var ids = self.getRenderedIds();
      ids.forEach(function (id) { self._unwrapId(id); });
      self._discardOwnMutations();
      await self.storage.clearHighlights(ns.getDocumentUrl());
      return ids.length;
    });
  };

  // Ajusta el DOM al estado guardado (cambios hechos desde el popup, la
  // biblioteca u otra pestaña).
  HighlightRenderer.prototype.syncWithRecords = function (records) {
    var self = this;
    return this._enqueue(async function () {
      var ids = {};
      records.forEach(function (r) { ids[r.id] = true; });
      self.getRenderedIds().forEach(function (id) {
        if (!ids[id]) self._unwrapId(id);
      });
      self._restoreRecords(records);
      self._discardOwnMutations();
    });
  };

  // Quita todas las marcas del DOM sin tocar el almacenamiento (cambio de URL en SPA)
  HighlightRenderer.prototype.unrenderAll = function () {
    var self = this;
    return this._enqueue(async function () {
      self.getRenderedIds().forEach(function (id) { self._unwrapId(id); });
      self.unresolvedIds.clear();
      self._discardOwnMutations();
    });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // SELECCIÓN
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype.isUiNode = function (node) {
    var el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    return Boolean(el && el.closest(ns.UI_SELECTOR));
  };

  HighlightRenderer.prototype._liveRange = function () {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    var r = sel.getRangeAt(0);
    if (!ns.normalizeText(r.toString())) return null;
    if (this.isUiNode(r.commonAncestorContainer)) return null;
    return r.cloneRange();
  };

  HighlightRenderer.prototype._currentRange = function () {
    return this._liveRange() || (this.lastSelectionRange ? this.lastSelectionRange.cloneRange() : null);
  };

  HighlightRenderer.prototype.rememberCurrentSelection = function () {
    var r = this._liveRange();
    if (r) this.lastSelectionRange = r;
  };

  HighlightRenderer.prototype.getSelectedText = function () {
    var r = this._currentRange();
    return r ? ns.normalizeText(r.toString()) : "";
  };

  // ══════════════════════════════════════════════════════════════════════════
  // OBSERVER (contenido dinámico)
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype.observeDynamicContent = function () {
    if (this.mutationObserver || !document.body) return;
    var self = this;
    this.mutationObserver = new MutationObserver(function (mutations) {
      var relevant = mutations.some(function (m) {
        if (self.isUiNode(m.target)) return false;
        if (m.type === "characterData") return !self.isInsideHighlight(m.target);
        return Array.prototype.some.call(m.addedNodes, function (n) {
          return !self.isInsideHighlight(n) && !self.isUiNode(n);
        }) || Array.prototype.some.call(m.removedNodes, function (n) {
          return n.nodeType === Node.ELEMENT_NODE &&
            (n.matches("." + ns.HIGHLIGHT_CLASS) || n.querySelector("." + ns.HIGHLIGHT_CLASS));
        });
      });
      if (!relevant) return;
      clearTimeout(self.restoreTimerId);
      // Si lo único pendiente son resaltados que ya no se encontraron, en webs que
      // cambian sin parar (chats, feeds) no se reescanea más de una vez cada 4 s.
      var delay = ns.DYNAMIC_RESTORE_DELAY_MS;
      if (self.unresolvedIds.size && Date.now() - self._lastScanAt < 4000) delay = 4000;
      self.restoreTimerId = setTimeout(function () {
        self._lastScanAt = Date.now();
        void self.restoreHighlightsForCurrentPage().catch(function () {});
      }, delay);
    });
    this.mutationObserver.observe(document.body, {
      childList: true, characterData: true, subtree: true
    });
  };

  HighlightRenderer.prototype._discardOwnMutations = function () {
    if (this.mutationObserver) this.mutationObserver.takeRecords();
  };

  // ══════════════════════════════════════════════════════════════════════════
  // CONSULTAS
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype.getHighlightElements = function (id) {
    return Array.from(document.querySelectorAll("[" + ns.HIGHLIGHT_ATTR + '="' + CSS.escape(id) + '"]'));
  };

  HighlightRenderer.prototype.findHighlightElement = function (id) {
    return document.querySelector("[" + ns.HIGHLIGHT_ATTR + '="' + CSS.escape(id) + '"]');
  };

  HighlightRenderer.prototype.getRenderedIds = function () {
    var seen = {};
    Array.from(document.querySelectorAll("." + ns.HIGHLIGHT_CLASS)).forEach(function (m) {
      var id = m.getAttribute(ns.HIGHLIGHT_ATTR);
      if (id) seen[id] = true;
    });
    return Object.keys(seen);
  };

  HighlightRenderer.prototype.findHighlightElementForNode = function (node) {
    if (!node) return null;
    var el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return el ? el.closest("." + ns.HIGHLIGHT_CLASS) : null;
  };

  HighlightRenderer.prototype.isInsideHighlight = function (node) {
    return Boolean(this.findHighlightElementForNode(node));
  };

  HighlightRenderer.prototype.scrollToHighlight = function (id) {
    var marks = this.getHighlightElements(id);
    if (!marks.length) return false;
    marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
    marks.forEach(function (m) {
      m.classList.remove("ph-highlight--flash");
      void m.offsetWidth;
      m.classList.add("ph-highlight--flash");
    });
    setTimeout(function () {
      marks.forEach(function (m) { m.classList.remove("ph-highlight--flash"); });
    }, 1800);
    return true;
  };

  ns.HighlightRenderer = HighlightRenderer;
})(globalThis);
