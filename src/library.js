(function bootstrapLibrary(global) {
  "use strict";
  var ns = global.PersistentHighlighter;
  var storage = new ns.HighlightStorage();

  var ICON = {
    open:  '<svg viewBox="0 0 16 16"><path d="M9 3h4v4M13 3L7.5 8.5M12 9.5V13H3V4h3.5"/></svg>',
    star:  '<svg viewBox="0 0 16 16"><path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z"/></svg>',
    edit:  '<svg viewBox="0 0 16 16"><path d="M3 3h10a1 1 0 011 1v6a1 1 0 01-1 1H7l-3 3v-3H3a1 1 0 01-1-1V4a1 1 0 011-1z"/></svg>',
    trash: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9"/></svg>',
    md:    '<svg viewBox="0 0 16 16"><path d="M8 2v8M5 7l3 3 3-3M3 13h10"/></svg>',
    copy:  '<svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M3.5 10.5h-1v-8h8v1"/></svg>'
  };

  var state = {
    highlights: [],
    notes: [],
    settings: ns.normalizeSettings({}),
    page: "",
    pageQuery: "",
    query: "",
    colors: {},
    tag: "",
    onlyFav: false,
    onlyComment: false,
    showNotes: true,
    pendingRender: false
  };

  function $(id) { return document.getElementById(id); }

  function esc(v) { return ns.escapeHtml(v == null ? "" : v); }

  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() { t.hidden = true; }, 2600);
  }

  function domainOf(url) {
    var pdf = ns.extractPdfUrl(url);
    try {
      var u = new URL(url);
      if (u.protocol === "file:") return pdf ? "PDF local" : "Archivo local";
      return u.hostname.replace(/^www\./, "") + (pdf ? " · PDF" : "");
    } catch (_e) { return url; }
  }

  function titleFromUrl(url) {
    try {
      var u = new URL(url);
      var last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
      return last || u.hostname;
    } catch (_e) { return url; }
  }

  // Enlace para abrir la página justo en el resaltado
  function openUrlFor(rec) {
    if (ns.extractPdfUrl(rec.url)) return ns.getAnnotatePdfViewerUrl(rec.url);
    return ns.buildTextFragmentUrl(rec);
  }

  function pageOpenUrl(url) {
    return ns.extractPdfUrl(url) ? ns.getAnnotatePdfViewerUrl(url) : url;
  }

  // ═══════════════════════════════════════════════════════════
  // DATOS
  // ═══════════════════════════════════════════════════════════

  async function load() {
    var results = await Promise.all([storage.getAllHighlights(), storage.getAllNotes(), storage.getSettings()]);
    state.highlights = results[0];
    state.notes = results[1];
    state.settings = results[2];
    applyTheme();
  }

  function applyTheme() {
    var dark = state.settings.darkMode ||
      (global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }

  function buildPages() {
    var pages = {};
    function get(url) {
      if (!pages[url]) pages[url] = { url: url, title: "", hl: 0, notes: 0, updatedAt: 0 };
      return pages[url];
    }
    state.highlights.forEach(function(h) {
      var p = get(h.url);
      p.hl++;
      if (h.pageTitle && !p.title) p.title = h.pageTitle;
      p.updatedAt = Math.max(p.updatedAt, new Date(h.createdAt).getTime() || 0);
    });
    state.notes.forEach(function(n) {
      var p = get(n.url);
      p.notes++;
      p.updatedAt = Math.max(p.updatedAt, new Date(n.createdAt).getTime() || 0);
    });
    return Object.keys(pages).map(function(k) {
      var p = pages[k];
      if (!p.title) p.title = titleFromUrl(p.url);
      return p;
    }).sort(function(a, b) { return b.updatedAt - a.updatedAt; });
  }

  function tokens(q) {
    return ns.normalizeText(q).toLowerCase().split(" ").filter(Boolean);
  }

  function matchesTokens(haystack, toks) {
    var h = haystack.toLowerCase();
    return toks.every(function(t) { return h.indexOf(t) !== -1; });
  }

  function colorKey(h) { return h.customColor ? "custom" : (h.color || "yellow"); }

  function filteredHighlights() {
    var toks = tokens(state.query);
    var colorsOn = Object.keys(state.colors).filter(function(k) { return state.colors[k]; });
    return state.highlights.filter(function(h) {
      if (state.page && h.url !== state.page) return false;
      if (colorsOn.length && colorsOn.indexOf(colorKey(h)) === -1) return false;
      if (state.tag && (h.tags || []).indexOf(state.tag) === -1) return false;
      if (state.onlyFav && !h.isFavorite) return false;
      if (state.onlyComment && !(h.comment && h.comment.trim())) return false;
      if (toks.length) {
        var hay = [h.selectedText, h.comment, (h.tags || []).join(" "), h.pageTitle, h.url].join(" ");
        if (!matchesTokens(hay, toks)) return false;
      }
      return true;
    });
  }

  function filteredNotes() {
    if (!state.showNotes) return [];
    // Con filtros propios de resaltados activos, las notas no aplican
    var colorsOn = Object.keys(state.colors).some(function(k) { return state.colors[k]; });
    if (colorsOn || state.tag || state.onlyFav || state.onlyComment) return [];
    var toks = tokens(state.query);
    return state.notes.filter(function(n) {
      if (state.page && n.url !== state.page) return false;
      if (toks.length && !matchesTokens([n.title, n.text, n.url].join(" "), toks)) return false;
      return Boolean((n.title || "").trim() || (n.text || "").trim());
    });
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: APUNTES
  // ═══════════════════════════════════════════════════════════

  function isEditing() {
    var a = document.activeElement;
    return Boolean(a && (a.classList.contains("hl__comment-edit") || a.classList.contains("tag-input")));
  }

  function render() {
    if (isEditing()) { state.pendingRender = true; return; }
    state.pendingRender = false;
    var pages = buildPages();
    renderStats(pages);
    renderPageList(pages);
    renderColorChips();
    renderTagOptions();
    renderResults(pages);
    renderReviewOptions(pages);
    updateDueBadge();
  }

  function renderStats(pages) {
    var due = state.highlights.filter(function(h) { return ns.isDueForReview(h); }).length;
    $("stats").innerHTML =
      stat(pages.length, "Páginas") +
      stat(state.highlights.length, "Resaltados") +
      stat(due, "Por repasar");
    function stat(n, label) {
      return '<div class="stat"><span class="stat__num">' + n + '</span><span class="stat__label">' + label + '</span></div>';
    }
  }

  function renderPageList(pages) {
    var list = $("page-list");
    var toks = tokens(state.pageQuery);
    list.innerHTML = "";

    var all = document.createElement("li");
    all.className = "page-item" + (!state.page ? " is-active" : "");
    all.innerHTML = '<span class="page-item__title">Todas las páginas</span><span class="page-item__count">' +
      (state.highlights.length + state.notes.length) + '</span>';
    all.addEventListener("click", function() { selectPage(""); });
    list.appendChild(all);

    pages.forEach(function(p) {
      if (toks.length && !matchesTokens(p.title + " " + p.url, toks)) return;
      var li = document.createElement("li");
      li.className = "page-item" + (state.page === p.url ? " is-active" : "");
      li.title = p.url;
      li.innerHTML =
        '<span class="page-item__title">' + esc(p.title) + '</span>' +
        '<span class="page-item__count">' + p.hl + (p.notes ? " · " + p.notes + "n" : "") + '</span>' +
        '<span class="page-item__domain">' + esc(domainOf(p.url)) + '</span>';
      li.addEventListener("click", function() { selectPage(p.url); });
      list.appendChild(li);
    });
  }

  function selectPage(url) {
    state.page = url;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderColorChips() {
    var box = $("color-filters");
    var counts = {};
    var scoped = state.highlights.filter(function(h) { return !state.page || h.url === state.page; });
    scoped.forEach(function(h) { var k = colorKey(h); counts[k] = (counts[k] || 0) + 1; });
    box.innerHTML = "";
    var keys = ns.COLOR_OPTIONS.map(function(o) { return o.id; }).concat(["custom"]);
    keys.forEach(function(k) {
      if (!counts[k]) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (state.colors[k] ? " is-active" : "");
      b.innerHTML = '<span class="chip__dot" style="background:' + (k === "custom" ? "conic-gradient(#f87171,#fde047,#4ade80,#60a5fa,#c084fc,#f87171)" : ns.COLOR_HEX[k]) + '"></span>' +
        esc(ns.getColorLabel(k)) + " · " + counts[k];
      b.addEventListener("click", function() {
        state.colors[k] = !state.colors[k];
        render();
      });
      box.appendChild(b);
    });
  }

  function allTags() {
    var set = {};
    state.settings.globalTags.forEach(function(t) { set[t] = true; });
    state.highlights.forEach(function(h) { (h.tags || []).forEach(function(t) { set[t] = true; }); });
    return Object.keys(set).sort(function(a, b) { return a.localeCompare(b, "es"); });
  }

  function fillSelect(select, options, current, firstLabel) {
    select.innerHTML = '<option value="">' + esc(firstLabel) + '</option>' + options.map(function(o) {
      return '<option value="' + esc(o.value) + '"' + (o.value === current ? " selected" : "") + '>' + esc(o.label) + '</option>';
    }).join("");
  }

  function renderTagOptions() {
    var tags = allTags();
    if (state.tag && tags.indexOf(state.tag) === -1) state.tag = "";
    fillSelect($("tag-filter"), tags.map(function(t) { return { value: t, label: "#" + t }; }), state.tag, "Todas las etiquetas");
  }

  function highlightQuery(text, toks) {
    if (!toks.length) return esc(text);
    var re = new RegExp("(" + toks.map(function(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")", "gi");
    return String(text).split(re).map(function(part, i) {
      return i % 2 === 1 ? '<mark class="q">' + esc(part) + "</mark>" : esc(part);
    }).join("");
  }

  function renderResults(pages) {
    var box = $("results");
    var hls = filteredHighlights();
    var notes = filteredNotes();

    if (!state.highlights.length && !state.notes.length) {
      box.innerHTML =
        '<div class="empty card"><h2>Todavía no tienes apuntes</h2>' +
        '<p>Así se empieza:</p><ol>' +
        '<li>Abre cualquier artículo, documentación o PDF.</li>' +
        '<li>Selecciona un texto y elige un color en la barra que aparece.</li>' +
        '<li>Haz clic en el resaltado para añadir un comentario o una pregunta.</li>' +
        '<li>Vuelve aquí para buscar, exportar o repasar.</li></ol></div>';
      return;
    }
    if (!hls.length && !notes.length) {
      box.innerHTML = '<div class="empty card"><h2>Sin resultados</h2><p>Prueba a quitar filtros o a buscar otras palabras.</p></div>';
      return;
    }

    var byUrl = {};
    hls.forEach(function(h) { (byUrl[h.url] = byUrl[h.url] || { hl: [], notes: [] }).hl.push(h); });
    notes.forEach(function(n) { (byUrl[n.url] = byUrl[n.url] || { hl: [], notes: [] }).notes.push(n); });

    var toks = tokens(state.query);
    box.innerHTML = "";
    pages.forEach(function(p) {
      var group = byUrl[p.url];
      if (!group) return;
      box.appendChild(renderPageCard(p, group, toks));
    });
  }

  function renderPageCard(page, group, toks) {
    var card = document.createElement("article");
    card.className = "page-card card";

    var head = document.createElement("header");
    head.className = "page-card__head";
    head.innerHTML =
      '<div class="page-card__titles">' +
        '<h2 class="page-card__title">' + highlightQuery(page.title, toks) + '</h2>' +
        '<a class="page-card__url" href="' + esc(pageOpenUrl(page.url)) + '" target="_blank" rel="noopener">' + esc(page.url) + '</a>' +
      '</div>' +
      '<div class="page-card__actions">' +
        '<button class="icon-btn" data-act="copy" title="Copiar resaltados de esta página">' + ICON.copy + '</button>' +
        '<button class="icon-btn" data-act="md" title="Exportar esta página a Markdown">' + ICON.md + '</button>' +
        '<button class="icon-btn icon-btn--danger" data-act="del" title="Borrar todo lo de esta página">' + ICON.trash + '</button>' +
      '</div>';

    head.querySelector('[data-act="md"]').addEventListener("click", function() {
      var hl = state.highlights.filter(function(h) { return h.url === page.url; });
      var nt = state.notes.filter(function(n) { return n.url === page.url; });
      ns.downloadText(ns.buildMarkdownExport(withTitles(hl), withTitles(nt), page.title), "annotate-" + ns.slugify(page.title) + ".md", "text/markdown");
    });
    head.querySelector('[data-act="copy"]').addEventListener("click", async function() {
      var text = group.hl.map(function(h) {
        return "• " + h.selectedText + (h.comment ? "\n  → " + h.comment : "");
      }).join("\n");
      try { await navigator.clipboard.writeText(text); toast("Copiado al portapapeles"); } catch (_e) {}
    });
    head.querySelector('[data-act="del"]').addEventListener("click", async function() {
      var total = page.hl + page.notes;
      if (!window.confirm("¿Borrar los " + total + " resaltados y notas de «" + page.title + "»? No se puede deshacer.")) return;
      await storage.clearHighlights(page.url);
      await storage.clearNotes(page.url);
      if (state.page === page.url) state.page = "";
      toast("Página borrada");
    });
    card.appendChild(head);

    // En orden de lectura (posición en la página)
    group.hl.sort(function(a, b) {
      var pa = Number.isFinite(a.textPos) ? a.textPos : Infinity;
      var pb = Number.isFinite(b.textPos) ? b.textPos : Infinity;
      if (pa !== pb) return pa < pb ? -1 : 1;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
    group.hl.forEach(function(h) { card.appendChild(renderHighlight(h, toks)); });

    if (group.notes.length) {
      var block = document.createElement("div");
      block.className = "notes-block";
      block.innerHTML = '<p class="eyebrow">Notas</p>';
      var grid = document.createElement("div");
      grid.className = "notes-grid";
      group.notes.forEach(function(n) {
        var c = document.createElement("div");
        c.className = "note-card note--" + (n.color === "custom" ? "yellow" : esc(n.color || "yellow"));
        if (n.color === "custom" && n.customColor) c.style.background = n.customColor;
        c.innerHTML = (n.title ? '<p class="note-card__title">' + highlightQuery(n.title, toks) + '</p>' : "") +
          '<p class="note-card__text">' + highlightQuery(n.text || "", toks) + '</p>';
        grid.appendChild(c);
      });
      block.appendChild(grid);
      card.appendChild(block);
    }
    return card;
  }

  function withTitles(items) {
    var titles = {};
    state.highlights.forEach(function(h) { if (h.pageTitle) titles[h.url] = h.pageTitle; });
    return items.map(function(i) { return Object.assign({}, i, { pageTitle: i.pageTitle || titles[i.url] || "" }); });
  }

  function renderHighlight(h, toks) {
    var row = document.createElement("div");
    row.className = "hl";
    var review = h.review;
    var reviewInfo = review && review.reviews
      ? " · repasado " + review.reviews + "×" + (ns.isDueForReview(h) ? " · toca repasar" : "")
      : "";

    row.innerHTML =
      '<span class="hl__bar" style="background:' + esc(ns.getHighlightHex(h)) + '"></span>' +
      '<div class="hl__body">' +
        '<p class="hl__text">' + highlightQuery(h.selectedText, toks) + '</p>' +
        (h.comment && h.comment.trim()
          ? '<p class="hl__comment" title="Clic para editar">' + highlightQuery(h.comment, toks) + '</p>'
          : '<p class="hl__comment hl__comment--empty" title="Clic para añadir">Añadir comentario o pregunta…</p>') +
        '<div class="hl__meta">' +
          '<span>' + esc(ns.getColorLabel(colorKey(h))) + ' · ' + esc(ns.formatDate(h.createdAt)) + esc(reviewInfo) + '</span>' +
          (h.tags || []).map(function(t) {
            return '<span class="tag">#' + esc(t) + '<button type="button" data-tag="' + esc(t) + '" title="Quitar etiqueta">×</button></span>';
          }).join("") +
          '<input class="tag-input" type="text" placeholder="+ etiqueta" maxlength="32" list="tag-suggestions" />' +
        '</div>' +
      '</div>' +
      '<div class="hl__actions">' +
        '<a class="icon-btn" href="' + esc(openUrlFor(h)) + '" target="_blank" rel="noopener" title="Abrir en la página">' + ICON.open + '</a>' +
        '<button class="icon-btn' + (h.isFavorite ? " is-on" : "") + '" data-act="fav" title="' + (h.isFavorite ? "Quitar de favoritos" : "Favorito") + '">' + ICON.star + '</button>' +
        '<button class="icon-btn icon-btn--danger" data-act="del" title="Eliminar resaltado">' + ICON.trash + '</button>' +
      '</div>';

    row.querySelector('[data-act="fav"]').addEventListener("click", function() {
      void storage.patchHighlight(h.url, h.id, { isFavorite: !h.isFavorite });
    });
    row.querySelector('[data-act="del"]').addEventListener("click", function() {
      if (!window.confirm("¿Eliminar este resaltado?\n\n«" + ns.truncate(h.selectedText, 120) + "»")) return;
      void storage.removeHighlight(h.url, h.id);
    });

    // Comentario editable en línea
    var commentEl = row.querySelector(".hl__comment");
    commentEl.addEventListener("click", function() {
      var ta = document.createElement("textarea");
      ta.className = "hl__comment-edit";
      ta.value = h.comment || "";
      ta.placeholder = "Explícalo con tus palabras o escribe una pregunta para repasar…";
      commentEl.replaceWith(ta);
      ta.focus();
      var done = false;
      function save() {
        if (done) return;
        done = true;
        var value = ta.value.trim();
        if (value !== (h.comment || "")) void storage.patchHighlight(h.url, h.id, { comment: value });
        setTimeout(function() { if (state.pendingRender || value === (h.comment || "")) render(); }, 0);
      }
      ta.addEventListener("blur", save);
      ta.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ta.blur(); }
        if (e.key === "Escape") { ta.value = h.comment || ""; ta.blur(); }
      });
    });

    // Etiquetas
    row.querySelectorAll("[data-tag]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var tag = btn.getAttribute("data-tag");
        void storage.patchHighlight(h.url, h.id, { tags: (h.tags || []).filter(function(t) { return t !== tag; }) });
      });
    });
    var tagInput = row.querySelector(".tag-input");
    tagInput.addEventListener("keydown", async function(e) {
      if (e.key !== "Enter") return;
      var tag = ns.normalizeText(tagInput.value).replace(/^#/, "");
      if (!tag) return;
      tagInput.value = "";
      if ((h.tags || []).indexOf(tag) === -1) {
        await storage.patchHighlight(h.url, h.id, { tags: (h.tags || []).concat([tag]) });
      }
      if (state.settings.globalTags.indexOf(tag) === -1) {
        await storage.saveSettings({ globalTags: state.settings.globalTags.concat([tag]) });
      }
      tagInput.blur();
    });
    tagInput.addEventListener("blur", function() {
      if (state.pendingRender) setTimeout(render, 0);
    });

    return row;
  }

  function renderTagDatalist() {
    var dl = document.getElementById("tag-suggestions");
    if (!dl) {
      dl = document.createElement("datalist");
      dl.id = "tag-suggestions";
      document.body.appendChild(dl);
    }
    dl.innerHTML = allTags().map(function(t) { return '<option value="' + esc(t) + '"></option>'; }).join("");
  }

  // ═══════════════════════════════════════════════════════════
  // REPASO
  // ═══════════════════════════════════════════════════════════

  var session = null;

  function updateDueBadge() {
    var due = state.highlights.filter(function(h) { return ns.isDueForReview(h); }).length;
    var badge = $("due-badge");
    badge.textContent = String(due);
    badge.hidden = due === 0;
  }

  function renderReviewOptions(pages) {
    var pageSel = $("rv-page"), colorSel = $("rv-color"), tagSel = $("rv-tag");
    var keepPage = pageSel.value, keepColor = colorSel.value, keepTag = tagSel.value;
    fillSelect(pageSel, pages.filter(function(p) { return p.hl; }).map(function(p) {
      return { value: p.url, label: ns.truncate(p.title, 70) + " (" + p.hl + ")" };
    }), keepPage, "Todas las páginas");
    var colors = {};
    state.highlights.forEach(function(h) { colors[colorKey(h)] = true; });
    fillSelect(colorSel, Object.keys(colors).map(function(k) { return { value: k, label: ns.getColorLabel(k) }; }), keepColor, "Todos los colores");
    fillSelect(tagSel, allTags().map(function(t) { return { value: t, label: "#" + t }; }), keepTag, "Todas las etiquetas");
    updateReviewCount();
  }

  function buildDeck() {
    var scope = $("rv-scope").value, page = $("rv-page").value, color = $("rv-color").value, tag = $("rv-tag").value;
    var now = Date.now();
    return state.highlights.filter(function(h) {
      if (page && h.url !== page) return false;
      if (color && colorKey(h) !== color) return false;
      if (tag && (h.tags || []).indexOf(tag) === -1) return false;
      if (scope === "due" && !ns.isDueForReview(h, now)) return false;
      return true;
    });
  }

  function updateReviewCount() {
    var n = buildDeck().length;
    $("rv-count").textContent = n ? n + " tarjeta" + (n === 1 ? "" : "s") + " en esta sesión." : "No hay tarjetas con esta selección.";
    $("rv-start").disabled = n === 0;
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  function startSession() {
    var deck = buildDeck();
    if (!deck.length) return;
    // Primero las tarjetas más atrasadas, luego las nuevas
    deck = shuffle(deck).sort(function(a, b) {
      var da = a.review && a.review.dueAt ? new Date(a.review.dueAt).getTime() : Infinity;
      var db = b.review && b.review.dueAt ? new Date(b.review.dueAt).getTime() : Infinity;
      return da - db;
    });
    session = { queue: deck.map(function(h) { return h.id; }), total: deck.length, done: 0, good: 0, again: 0, retries: {}, revealed: false };
    $("review-setup").hidden = true;
    $("review-done").hidden = true;
    $("review-session").hidden = false;
    showCard();
  }

  function currentCard() {
    if (!session || !session.queue.length) return null;
    var id = session.queue[0];
    return state.highlights.find(function(h) { return h.id === id; }) || null;
  }

  function showCard() {
    var card = currentCard();
    while (session && session.queue.length && !card) { session.queue.shift(); card = currentCard(); }
    if (!card) return finishSession();

    session.revealed = false;
    var pct = Math.round(100 * session.done / Math.max(1, session.total));
    $("rv-progress").style.width = pct + "%";
    $("rv-counter").textContent = (session.done + 1) + " de " + session.total + (session.queue.length > session.total - session.done ? " (+ repeticiones)" : "");
    $("rv-source").textContent = (card.pageTitle || titleFromUrl(card.url)) + " · " + ns.getColorLabel(colorKey(card));

    var front = $("rv-front");
    var prefix = ns.normalizeText(card.prefix || "");
    var suffix = ns.normalizeText(card.suffix || "");
    if (card.comment && card.comment.trim()) {
      $("rv-kind").textContent = "Pregunta";
      front.innerHTML = esc(card.comment.trim()).replace(/\n/g, "<br>");
    } else if (prefix || suffix) {
      $("rv-kind").textContent = "Completa el hueco";
      front.innerHTML =
        '<span class="ctx">' + (prefix ? "…" + esc(tail(prefix, 140)) : "") + '</span>' +
        '<span class="gap">' + esc("x".repeat(Math.min(40, card.selectedText.length))) + '</span>' +
        '<span class="ctx">' + (suffix ? esc(head(suffix, 140)) + "…" : "") + '</span>';
    } else {
      $("rv-kind").textContent = "¿Recuerdas lo que destacaste?";
      var first = card.selectedText.split(" ").slice(0, 3).join(" ");
      front.innerHTML = 'Empieza por: <strong>' + esc(first) + '…</strong>';
    }

    $("rv-answer").textContent = card.selectedText;
    $("rv-open").href = openUrlFor(card);
    $("rv-back").hidden = true;
    $("rv-show").hidden = false;
    $("rv-grade").hidden = true;
    $("rv-show").focus();
  }

  function tail(s, n) { return s.length <= n ? s : s.slice(s.length - n).replace(/^\S*\s/, ""); }
  function head(s, n) { return s.length <= n ? s : s.slice(0, n).replace(/\s\S*$/, ""); }

  function reveal() {
    if (!session || session.revealed) return;
    session.revealed = true;
    $("rv-back").hidden = false;
    $("rv-show").hidden = true;
    $("rv-grade").hidden = false;
    $("rv-good").focus();
  }

  async function grade(remembered) {
    var card = currentCard();
    if (!card || !session.revealed) return;
    session.queue.shift();
    // Si ya la fallaste en esta sesión, acertarla después solo la manda a 1 día
    var base = remembered && session.retries[card.id]
      ? Object.assign({}, card, { review: Object.assign({}, card.review, { box: 0 }) })
      : card;
    var review = ns.nextReviewState(base, remembered);
    card.review = review; // actualización local inmediata
    void storage.patchHighlight(card.url, card.id, { review: review });

    if (remembered) {
      session.good++;
      session.done++;
    } else {
      session.again++;
      // Se repite al final de la sesión (máximo 2 veces)
      session.retries[card.id] = (session.retries[card.id] || 0) + 1;
      if (session.retries[card.id] <= 2) session.queue.push(card.id);
      else session.done++;
    }
    showCard();
  }

  function finishSession() {
    var s = session;
    session = null;
    $("review-session").hidden = true;
    $("review-done").hidden = false;
    $("rv-summary").textContent = s
      ? "Has repasado " + s.total + " tarjeta" + (s.total === 1 ? "" : "s") + ": " + s.good + " acierto" + (s.good === 1 ? "" : "s") +
        " y " + s.again + " fallo" + (s.again === 1 ? "" : "s") + ". Las que aciertas volverán dentro de unos días."
      : "";
  }

  function stopSession() {
    session = null;
    $("review-session").hidden = true;
    $("review-setup").hidden = false;
    render();
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORTAR / COPIA
  // ═══════════════════════════════════════════════════════════

  function exportVisible() {
    var hls = filteredHighlights();
    var notes = filteredNotes();
    if (!hls.length && !notes.length) { toast("No hay nada que exportar con estos filtros"); return; }
    var heading = state.page
      ? (buildPages().find(function(p) { return p.url === state.page; }) || {}).title
      : "Mis apuntes";
    ns.downloadText(ns.buildMarkdownExport(withTitles(hls), withTitles(notes), heading),
      "annotate-" + ns.slugify(heading || "apuntes") + "-" + new Date().toISOString().slice(0, 10) + ".md", "text/markdown");
  }

  async function backup() {
    var data = await storage.exportAll();
    ns.downloadText(JSON.stringify(data, null, 2), "annotate-backup-" + new Date().toISOString().slice(0, 10) + ".json", "application/json");
    toast("Copia descargada");
  }

  function importFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function(e) {
      try {
        var result = await storage.importAll(JSON.parse(e.target.result));
        toast("Importados " + result.highlights + " resaltados y " + result.notes + " notas");
      } catch (err) {
        toast("No se pudo importar: " + (err && err.message ? err.message : "archivo no válido"));
      }
    };
    reader.readAsText(file);
  }

  // ═══════════════════════════════════════════════════════════
  // EVENTOS
  // ═══════════════════════════════════════════════════════════

  function setView(view) {
    document.querySelectorAll(".views__btn").forEach(function(b) {
      b.classList.toggle("is-active", b.dataset.view === view);
    });
    $("view-notes").hidden = view !== "notes";
    $("view-review").hidden = view !== "review";
    if (view === "review" && !session) {
      $("review-setup").hidden = false;
      $("review-done").hidden = true;
      updateReviewCount();
    }
  }

  function bind() {
    document.querySelectorAll(".views__btn").forEach(function(b) {
      b.addEventListener("click", function() { setView(b.dataset.view); });
    });

    var searchTimer = 0;
    $("search").addEventListener("input", function(e) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function() { state.query = e.target.value; render(); }, 120);
    });
    $("page-search").addEventListener("input", function(e) { state.pageQuery = e.target.value; render(); });
    $("tag-filter").addEventListener("change", function(e) { state.tag = e.target.value; render(); });
    $("only-fav").addEventListener("change", function(e) { state.onlyFav = e.target.checked; render(); });
    $("only-comment").addEventListener("change", function(e) { state.onlyComment = e.target.checked; render(); });
    $("show-notes").addEventListener("change", function(e) { state.showNotes = e.target.checked; render(); });

    $("btn-export-md").addEventListener("click", exportVisible);
    $("btn-backup").addEventListener("click", function() { void backup(); });
    $("input-import").addEventListener("change", function(e) { importFile(e.target.files[0]); e.target.value = ""; });

    ["rv-scope", "rv-page", "rv-color", "rv-tag"].forEach(function(id) {
      $(id).addEventListener("change", updateReviewCount);
    });
    $("rv-start").addEventListener("click", startSession);
    $("rv-show").addEventListener("click", reveal);
    $("rv-good").addEventListener("click", function() { void grade(true); });
    $("rv-again").addEventListener("click", function() { void grade(false); });
    $("rv-stop").addEventListener("click", stopSession);
    $("rv-again-session").addEventListener("click", function() {
      $("review-done").hidden = true;
      $("review-setup").hidden = false;
      render();
    });

    document.addEventListener("keydown", function(e) {
      if (!session || $("view-review").hidden) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!session.revealed) reveal();
      } else if (e.key === "1") {
        void grade(false);
      } else if (e.key === "2") {
        void grade(true);
      }
    });

    // Cerrar el menú de copia al hacer clic fuera
    document.addEventListener("click", function(e) {
      document.querySelectorAll("details.menu[open]").forEach(function(d) {
        if (!d.contains(e.target)) d.removeAttribute("open");
      });
    });

    if (global.matchMedia) {
      global.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
    }

    var reloadTimer = 0;
    chrome.storage.onChanged.addListener(function(changes, area) {
      if (area !== "local") return;
      if (!changes[ns.STORAGE_KEY] && !changes[ns.NOTES_STORAGE_KEY] && !changes[ns.SETTINGS_KEY]) return;
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(async function() {
        await load();
        renderTagDatalist();
        // Durante una sesión de repaso no se re-renderiza la vista de apuntes
        if (session) { updateDueBadge(); return; }
        render();
      }, 150);
    });
  }

  async function bootstrap() {
    var params = new URLSearchParams(location.search);
    if (params.get("page")) state.page = ns.normalizeUrl(params.get("page"));
    bind();
    await load();
    renderTagDatalist();
    render();
    if (params.get("view") === "review") setView("review");
  }

  void bootstrap().catch(function(err) {
    $("results").innerHTML = '<div class="empty card"><h2>Error al cargar</h2><p>' + esc(err && err.message) + '</p></div>';
  });
})(globalThis);
