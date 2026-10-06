(function bootstrapTypes(global) {
  const ns = global.PersistentHighlighter || (global.PersistentHighlighter = {});

  // ── Claves de almacenamiento ──────────────────────────────────────────────
  ns.STORAGE_KEY        = "annotate.recordsByUrl";
  ns.NOTES_STORAGE_KEY  = "annotate.notesByUrl";
  ns.SETTINGS_KEY       = "annotate.settings";
  ns.FOCUS_STORAGE_KEY  = "annotate.focusState";
  ns.HIGHLIGHT_CLASS    = "ph-highlight";
  ns.HIGHLIGHT_ATTR     = "data-ph-id";
  // Atributo que marca la UI propia (notas, panel, barras). El resaltador la ignora.
  ns.UI_ATTR            = "data-annotate-ui";
  ns.UI_SELECTOR        = "[data-annotate-ui], #ann-sidebar, #ann-fab, .ph-note-layer, .ph-focus-overlay";
  ns.DYNAMIC_RESTORE_DELAY_MS = 700;
  ns.DEFAULT_COLOR      = "yellow";
  ns.PDF_VIEWER_PATH    = "src/pdf-viewer.html";
  ns.CHROME_PDF_VIEWER_HOST = "mhjfbmdgcfjbbpaeojofohoefgiehjai";

  // ── Colores de resaltado ──────────────────────────────────────────────────
  ns.COLOR_OPTIONS = [
    { id: "yellow",  label: "Amarillo",  circle: "", category: "general"   },
    { id: "green",   label: "Idea clave",circle: "", category: "idea"      },
    { id: "blue",    label: "Info",      circle: "", category: "info"      },
    { id: "pink",    label: "Rosa",      circle: "", category: "general"   },
    { id: "orange",  label: "Repasar",   circle: "", category: "review"    },
    { id: "purple",  label: "Duda",      circle: "", category: "question"  },
    { id: "teal",    label: "Turquesa",  circle: "", category: "general"   },
    { id: "red",     label: "Importante",circle: "", category: "important" },
    { id: "gray",    label: "Gris",      circle: "", category: "general"   }
  ];

  // ── Colores extra de resaltado (sección "Más colores") ───────────────────
  ns.EXTRA_COLOR_OPTIONS = [
    // Amarillos / Dorados
    { id: "ex-lemon",      label: "Limón",        hex: "#fff176", group: "Amarillos" },
    { id: "ex-amber",      label: "Ámbar",         hex: "#fbbf24", group: "Amarillos" },
    { id: "ex-gold",       label: "Dorado",        hex: "#d97706", group: "Amarillos" },
    { id: "ex-butter",     label: "Mantequilla",   hex: "#fef08a", group: "Amarillos" },
    // Rosas / Rojos
    { id: "ex-rose",       label: "Rosa vivo",     hex: "#fb7185", group: "Rosas" },
    { id: "ex-fuchsia",    label: "Fucsia",        hex: "#e879f9", group: "Rosas" },
    { id: "ex-hotpink",    label: "Rosa fuerte",   hex: "#f43f5e", group: "Rosas" },
    { id: "ex-salmon",     label: "Salmón",        hex: "#fca5a5", group: "Rosas" },
    { id: "ex-crimson",    label: "Carmesí",       hex: "#dc2626", group: "Rosas" },
    { id: "ex-coral",      label: "Coral",         hex: "#ff6b6b", group: "Rosas" },
    // Naranjas
    { id: "ex-peach",      label: "Melocotón",     hex: "#fdba74", group: "Naranjas" },
    { id: "ex-tangerine",  label: "Mandarina",     hex: "#f97316", group: "Naranjas" },
    { id: "ex-pumpkin",    label: "Calabaza",      hex: "#ea580c", group: "Naranjas" },
    { id: "ex-apricot",    label: "Albaricoque",   hex: "#fb923c", group: "Naranjas" },
    // Verdes
    { id: "ex-lime",       label: "Lima",          hex: "#a3e635", group: "Verdes" },
    { id: "ex-mint",       label: "Menta",         hex: "#6ee7b7", group: "Verdes" },
    { id: "ex-emerald",    label: "Esmeralda",     hex: "#10b981", group: "Verdes" },
    { id: "ex-forest",     label: "Bosque",        hex: "#16a34a", group: "Verdes" },
    { id: "ex-olive",      label: "Oliva",         hex: "#84cc16", group: "Verdes" },
    { id: "ex-sage",       label: "Salvia",        hex: "#86efac", group: "Verdes" },
    { id: "ex-grass",      label: "Hierba",        hex: "#4ade80", group: "Verdes" },
    // Azules
    { id: "ex-sky",        label: "Cielo",         hex: "#38bdf8", group: "Azules" },
    { id: "ex-azure",      label: "Azul vivo",     hex: "#3b82f6", group: "Azules" },
    { id: "ex-indigo",     label: "Índigo",        hex: "#6366f1", group: "Azules" },
    { id: "ex-navy",       label: "Marino",        hex: "#1e40af", group: "Azules" },
    { id: "ex-cerulean",   label: "Cerúleo",       hex: "#0ea5e9", group: "Azules" },
    { id: "ex-cobalt",     label: "Cobalto",       hex: "#2563eb", group: "Azules" },
    { id: "ex-ice",        label: "Hielo",         hex: "#bae6fd", group: "Azules" },
    // Morados
    { id: "ex-violet",     label: "Violeta",       hex: "#8b5cf6", group: "Morados" },
    { id: "ex-lavender",   label: "Lavanda",       hex: "#c4b5fd", group: "Morados" },
    { id: "ex-plum",       label: "Ciruela",       hex: "#7c3aed", group: "Morados" },
    { id: "ex-grape",      label: "Uva",           hex: "#9333ea", group: "Morados" },
    { id: "ex-lilac",      label: "Lila",          hex: "#d8b4fe", group: "Morados" },
    // Neutros / Especiales
    { id: "ex-slate",      label: "Pizarra",       hex: "#64748b", group: "Neutros" },
    { id: "ex-stone",      label: "Piedra",        hex: "#a8a29e", group: "Neutros" },
    { id: "ex-brown",      label: "Marrón",        hex: "#92400e", group: "Neutros" },
    { id: "ex-tan",        label: "Tostado",       hex: "#d4a574", group: "Neutros" },
    { id: "ex-white",      label: "Blanco",        hex: "#f8f8f8", group: "Neutros" },
    { id: "ex-charcoal",   label: "Carbón",        hex: "#374151", group: "Neutros" },
    // Neón / Especiales
    { id: "ex-neon-green", label: "Neón verde",    hex: "#39ff14", group: "Neón" },
    { id: "ex-neon-pink",  label: "Neón rosa",     hex: "#ff10f0", group: "Neón" },
    { id: "ex-neon-blue",  label: "Neón azul",     hex: "#00d4ff", group: "Neón" },
    { id: "ex-neon-yellow",label: "Neón amarillo", hex: "#ffff00", group: "Neón" }
  ];

  // Hex de los colores base (para UI que no tiene acceso a las clases CSS)
  ns.COLOR_HEX = {
    yellow: "#fde047", green: "#4ade80", blue: "#60a5fa", pink: "#f472b6",
    orange: "#fb923c", purple: "#c084fc", teal: "#2dd4bf", red: "#f87171", gray: "#94a3b8"
  };

  // Colores que aparecen en la barra flotante de selección (los de estudio)
  ns.QUICK_COLORS = ["yellow", "green", "blue", "orange", "purple", "red"];

  ns.getColorLabel = function getColorLabel(colorId) {
    const opt = ns.COLOR_OPTIONS.find(function(o) { return o.id === colorId; });
    if (opt) return opt.label;
    return colorId === "custom" ? "Personalizado" : String(colorId || "");
  };

  ns.getHighlightHex = function getHighlightHex(record) {
    if (record && record.customColor) return record.customColor;
    return ns.COLOR_HEX[record && record.color] || ns.COLOR_HEX.yellow;
  };

  // Traduce el color guardado en ajustes (puede ser "ex-*") a { color, customColor }
  ns.resolveHighlightColor = function resolveHighlightColor(selectedColor, customColor) {
    if (selectedColor && String(selectedColor).startsWith("ex-")) {
      const extra = ns.EXTRA_COLOR_OPTIONS.find(function(o) { return o.id === selectedColor; });
      return { color: "custom", customColor: extra ? extra.hex : ns.sanitizeColorHex(customColor) };
    }
    if (selectedColor === "custom") {
      return { color: "custom", customColor: ns.sanitizeColorHex(customColor) };
    }
    return { color: selectedColor || ns.DEFAULT_COLOR, customColor: undefined };
  };

  // ── Colores de notas ──────────────────────────────────────────────────────
  ns.NOTE_COLOR_OPTIONS = [
    { id: "yellow", label: "Amarillo" },
    { id: "pink",   label: "Rosa"     },
    { id: "blue",   label: "Azul"     },
    { id: "green",  label: "Verde"    },
    { id: "orange", label: "Naranja"  },
    { id: "purple", label: "Morado"   }
  ];

  // ── Categorías de resaltado ───────────────────────────────────────────────
  ns.HIGHLIGHT_CATEGORIES = [
    { id: "general",   label: "General",    icon: "◆" },
    { id: "idea",      label: "Idea clave", icon: "💡" },
    { id: "important", label: "Importante", icon: "⚡" },
    { id: "review",    label: "Repasar",    icon: "🔁" },
    { id: "question",  label: "Duda",       icon: "❓" },
    { id: "info",      label: "Info",       icon: "ℹ️"  }
  ];

  // ── Utilidades de URL ─────────────────────────────────────────────────────
  ns.normalizeUrl = function normalizeUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.hash = "";
      return url.toString();
    } catch (_e) {
      return String(rawUrl || "").split("#")[0];
    }
  };

  ns.getDomain = function getDomain(rawUrl) {
    try { return new URL(rawUrl).hostname; } catch (_e) { return rawUrl; }
  };

  ns.isAnnotatePdfViewerUrl = function isAnnotatePdfViewerUrl(rawUrl) {
    if (!rawUrl || !global.chrome || !chrome.runtime || !chrome.runtime.getURL) return false;
    return String(rawUrl).startsWith(chrome.runtime.getURL(ns.PDF_VIEWER_PATH));
  };

  ns.isChromePdfViewerUrl = function isChromePdfViewerUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      return url.protocol === "chrome-extension:" &&
        url.host === ns.CHROME_PDF_VIEWER_HOST &&
        /\/index\.html$/i.test(url.pathname) &&
        Boolean(url.searchParams.get("src"));
    } catch (_e) {
      return false;
    }
  };

  ns.extractPdfUrl = function extractPdfUrl(rawUrl) {
    if (!rawUrl) return null;

    try {
      const url = new URL(rawUrl);
      if (ns.isAnnotatePdfViewerUrl(rawUrl) || ns.isChromePdfViewerUrl(rawUrl)) {
        const embedded = url.searchParams.get("src");
        return embedded ? ns.normalizeUrl(embedded) : null;
      }

      const normalizedHref = ns.normalizeUrl(rawUrl);
      const pathname = decodeURIComponent(url.pathname || "").toLowerCase();
      if (pathname.endsWith(".pdf") || /\.pdf(?:$|[?#])/i.test(normalizedHref)) {
        return normalizedHref;
      }
    } catch (_e) {
      if (/\.pdf(?:$|[?#])/i.test(String(rawUrl))) {
        return ns.normalizeUrl(rawUrl);
      }
    }

    return null;
  };

  ns.getDocumentUrl = function getDocumentUrl() {
    if (typeof global.__annotateDocumentUrl === "string" && global.__annotateDocumentUrl.trim()) {
      return ns.normalizeUrl(global.__annotateDocumentUrl);
    }

    return ns.extractPdfUrl(global.location && global.location.href) ||
      ns.normalizeUrl((global.location && global.location.href) || "");
  };

  ns.getAnnotatePdfViewerUrl = function getAnnotatePdfViewerUrl(rawPdfUrl) {
    const viewerUrl = chrome.runtime.getURL(ns.PDF_VIEWER_PATH);
    const url = new URL(viewerUrl);
    url.searchParams.set("src", ns.normalizeUrl(rawPdfUrl));
    return url.toString();
  };

  // ── Utilidades de texto ───────────────────────────────────────────────────
  ns.normalizeText = function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  };

  ns.escapeHtml = function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  // ── Generadores de ID ─────────────────────────────────────────────────────
  ns.createId     = () => "hl_"   + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  ns.createNoteId = () => "note_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);

  // ── Firma de resaltado ────────────────────────────────────────────────────
  ns.buildSignature = function buildSignature(selectedText, prefix, suffix, domHint) {
    return [
      ns.normalizeText(selectedText).toLowerCase(),
      ns.normalizeText(prefix).toLowerCase(),
      ns.normalizeText(suffix).toLowerCase(),
      String(domHint || "").toLowerCase()
    ].join("::");
  };

  // ── Color hexadecimal seguro ──────────────────────────────────────────────
  ns.sanitizeColorHex = function sanitizeColorHex(rawColor) {
    const v = String(rawColor || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : "#facc15";
  };

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(Math.max(numeric, min), max);
  }

  function normalizeInteger(value, min, max, fallback) {
    return Math.round(clampNumber(value, min, max, fallback));
  }

  function normalizeMs(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return fallback;
    return Math.round(numeric);
  }

  function normalizeTimestamp(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
  }

  function normalizeMode(value) {
    const mode = String(value || "");
    if (mode === "study") return "breakCycle";
    if (mode === "clock") return "stopwatch";
    return ["stopwatch", "countdown", "breakCycle"].includes(mode) ? mode : "stopwatch";
  }

  function normalizeLayout(value) {
    const layout = String(value || "");
    return ["stacked", "split", "minimal"].includes(layout) ? layout : "stacked";
  }

  function normalizePhase(value) {
    const phase = String(value || "");
    return ["focus", "break", "longBreak"].includes(phase) ? phase : "focus";
  }

  function getCountdownDefaults() {
    return {
      durationMinutes: 25,
      remainingMs: 25 * 60 * 1000,
      endsAt: null,
      isRunning: false
    };
  }

  function getCycleDefaults(kind) {
    if (kind === "breakCycle") {
      return {
        focusMinutes: 52,
        breakMinutes: 17,
        longBreakMinutes: 30,
        rounds: 4,
        currentRound: 1,
        phase: "focus",
        remainingMs: 52 * 60 * 1000,
        endsAt: null,
        isRunning: false
      };
    }

    return {
      focusMinutes: 25,
      breakMinutes: 5,
      longBreakMinutes: 15,
      rounds: 4,
      currentRound: 1,
      phase: "focus",
      remainingMs: 25 * 60 * 1000,
      endsAt: null,
      isRunning: false
    };
  }

  function normalizeCountdown(raw) {
    const defaults = getCountdownDefaults();
    const durationMinutes = normalizeInteger(raw && raw.durationMinutes, 1, 600, defaults.durationMinutes);
    const fallbackRemaining = durationMinutes * 60 * 1000;
    return {
      durationMinutes: durationMinutes,
      remainingMs: normalizeMs(raw && raw.remainingMs, fallbackRemaining),
      endsAt: normalizeTimestamp(raw && raw.endsAt),
      isRunning: Boolean(raw && raw.isRunning)
    };
  }

  function normalizeCycle(raw, kind) {
    const defaults = getCycleDefaults(kind);
    const focusMinutes = normalizeInteger(raw && raw.focusMinutes, 1, 600, defaults.focusMinutes);
    const breakMinutes = normalizeInteger(raw && raw.breakMinutes, 1, 180, defaults.breakMinutes);
    const longBreakMinutes = normalizeInteger(raw && raw.longBreakMinutes, 1, 240, defaults.longBreakMinutes);
    const rounds = normalizeInteger(raw && raw.rounds, 1, 12, defaults.rounds);
    return {
      focusMinutes: focusMinutes,
      breakMinutes: breakMinutes,
      longBreakMinutes: longBreakMinutes,
      rounds: rounds,
      currentRound: normalizeInteger(raw && raw.currentRound, 1, rounds, defaults.currentRound),
      phase: normalizePhase(raw && raw.phase),
      remainingMs: normalizeMs(raw && raw.remainingMs, focusMinutes * 60 * 1000),
      endsAt: normalizeTimestamp(raw && raw.endsAt),
      isRunning: Boolean(raw && raw.isRunning)
    };
  }

  ns.getDefaultFocusState = function getDefaultFocusState() {
    return {
      visible: false,
      mode: "stopwatch",
      layout: "stacked",
      use24Hour: true,
      showSeconds: true,
      x: 24,
      y: 24,
      countdown: getCountdownDefaults(),
      stopwatch: {
        elapsedMs: 0,
        startedAt: null,
        isRunning: false
      },
      breakCycle: getCycleDefaults("breakCycle"),
      study: getCycleDefaults("study")
    };
  };

  ns.normalizeFocusState = function normalizeFocusState(raw) {
    const defaults = ns.getDefaultFocusState();
    const source = raw || {};
    const rawMode = String(source.mode || "");
    const normalizedMode = normalizeMode(rawMode);
    const breakCycleSource = rawMode === "study"
      ? (source.study || source.breakCycle)
      : source.breakCycle;

    return {
      visible: rawMode === "clock" ? false : Boolean(source.visible),
      mode: normalizedMode,
      layout: normalizeLayout(source.layout),
      use24Hour: source.use24Hour !== false,
      showSeconds: source.showSeconds !== false,
      x: normalizeInteger(source.x, 8, 100000, defaults.x),
      y: normalizeInteger(source.y, 8, 100000, defaults.y),
      countdown: normalizeCountdown(source.countdown),
      stopwatch: {
        elapsedMs: normalizeMs(source.stopwatch && source.stopwatch.elapsedMs, 0),
        startedAt: normalizeTimestamp(source.stopwatch && source.stopwatch.startedAt),
        isRunning: Boolean(source.stopwatch && source.stopwatch.isRunning)
      },
      breakCycle: normalizeCycle(breakCycleSource, rawMode === "study" ? "study" : "breakCycle"),
      study: normalizeCycle(source.study, "study")
    };
  };

  ns.mergeFocusState = function mergeFocusState(base, patch) {
    const current = ns.normalizeFocusState(base);
    const nextPatch = patch || {};
    return ns.normalizeFocusState({
      visible: nextPatch.visible !== undefined ? nextPatch.visible : current.visible,
      mode: nextPatch.mode || current.mode,
      layout: nextPatch.layout || current.layout,
      use24Hour: nextPatch.use24Hour !== undefined ? nextPatch.use24Hour : current.use24Hour,
      showSeconds: nextPatch.showSeconds !== undefined ? nextPatch.showSeconds : current.showSeconds,
      x: nextPatch.x !== undefined ? nextPatch.x : current.x,
      y: nextPatch.y !== undefined ? nextPatch.y : current.y,
      countdown: Object.assign({}, current.countdown, nextPatch.countdown || {}),
      stopwatch: Object.assign({}, current.stopwatch, nextPatch.stopwatch || {}),
      breakCycle: Object.assign({}, current.breakCycle, nextPatch.breakCycle || {}),
      study: Object.assign({}, current.study, nextPatch.study || {})
    });
  };

  // ── Formato de fecha legible ──────────────────────────────────────────────
  ns.formatDate = function formatDate(isoString) {
    try {
      return new Date(isoString).toLocaleString("es-ES", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      });
    } catch (_e) { return isoString; }
  };

  // ── Truncar texto ─────────────────────────────────────────────────────────
  ns.truncate = function truncate(text, max) {
    const t = String(text || "");
    return t.length <= max ? t : t.slice(0, max) + "…";
  };

  // ── Enlace que abre la página y hace scroll hasta el texto (Text Fragments) ─
  ns.buildTextFragmentUrl = function buildTextFragmentUrl(record) {
    const base = ns.normalizeUrl(record.url);
    const words = ns.normalizeText(record.selectedText).split(" ");
    if (!words[0]) return base;
    const enc = function(s) { return encodeURIComponent(s).replace(/-/g, "%2D"); };
    let directive;
    if (words.length <= 8) {
      directive = enc(words.join(" "));
    } else {
      directive = enc(words.slice(0, 4).join(" ")) + "," + enc(words.slice(-4).join(" "));
    }
    return base + "#:~:text=" + directive;
  };

  // ── Exportación a Markdown (agrupada por página, en orden de lectura) ────
  ns.buildMarkdownExport = function buildMarkdownExport(highlights, notes, heading) {
    const pages = {};
    const order = [];
    function page(url, title) {
      if (!pages[url]) { pages[url] = { url: url, title: "", highlights: [], notes: [] }; order.push(url); }
      if (title && !pages[url].title) pages[url].title = title;
      return pages[url];
    }
    (highlights || []).forEach(function(h) { page(h.url, h.pageTitle).highlights.push(h); });
    (notes || []).forEach(function(n) { page(n.url, n.pageTitle).notes.push(n); });

    const byPos = function(a, b) {
      const pa = Number.isFinite(a.textPos) ? a.textPos : Infinity;
      const pb = Number.isFinite(b.textPos) ? b.textPos : Infinity;
      if (pa !== pb) return pa < pb ? -1 : 1;
      return new Date(a.createdAt) - new Date(b.createdAt);
    };
    const oneLine = function(s) { return ns.normalizeText(s); };
    const multiLine = function(s, indent) {
      return String(s || "").trim().split(/\r?\n/).join("\n" + indent);
    };

    let out = heading ? "# " + heading + "\n\n" : "";
    out += "_Exportado con Annotate el " + new Date().toLocaleString("es-ES") + "_\n\n";

    order.forEach(function(url) {
      const p = pages[url];
      out += "## " + (p.title || url) + "\n\n<" + url + ">\n\n";
      p.highlights.sort(byPos).forEach(function(h) {
        out += "- **" + ns.getColorLabel(h.color) + ":** " + oneLine(h.selectedText) + "\n";
        if (h.comment) out += "  - 💬 " + multiLine(h.comment, "    ") + "\n";
        if (h.tags && h.tags.length) out += "  - " + h.tags.map(function(t) { return "#" + t.replace(/\s+/g, "-"); }).join(" ") + "\n";
      });
      if (p.notes.length) {
        out += (p.highlights.length ? "\n" : "") + "### Notas\n\n";
        p.notes.forEach(function(n) {
          out += "#### " + (n.title || "Sin título") + "\n\n" + (String(n.text || "").trim() || "_(vacía)_") + "\n\n";
        });
      }
      out += "\n";
    });
    return out.trim() + "\n";
  };

  ns.downloadText = function downloadText(content, filename, mime) {
    const blob = new Blob([content], { type: (mime || "text/plain") + ";charset=utf-8" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
  };

  ns.slugify = function slugify(text) {
    return ns.normalizeText(text).toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "apuntes";
  };

  // ── Repaso espaciado (sistema Leitner) ───────────────────────────────────
  // Caja 0 = nueva. Cada acierto sube de caja; un fallo vuelve a la caja 1.
  ns.REVIEW_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];

  ns.isDueForReview = function isDueForReview(record, now) {
    const review = record && record.review;
    if (!review || !review.dueAt) return true;
    return new Date(review.dueAt).getTime() <= (now || Date.now());
  };

  ns.nextReviewState = function nextReviewState(record, remembered, now) {
    const current = (record && record.review) || { box: 0, reviews: 0, lapses: 0 };
    const maxBox  = ns.REVIEW_INTERVAL_DAYS.length - 1;
    const box     = remembered ? Math.min((current.box || 0) + 1, maxBox) : 1;
    const days    = remembered ? ns.REVIEW_INTERVAL_DAYS[box] : 0;
    const base    = now || Date.now();
    // Un fallo se vuelve a preguntar en 10 minutos
    const dueAt   = new Date(base + (remembered ? days * 86400000 : 10 * 60000)).toISOString();
    return {
      box: box,
      dueAt: dueAt,
      lastReviewedAt: new Date(base).toISOString(),
      reviews: (current.reviews || 0) + 1,
      lapses: (current.lapses || 0) + (remembered ? 0 : 1)
    };
  };
})(globalThis);
