(function bootstrapContent(global) {
  if (global.__annotateLoaded) return;
  global.__annotateLoaded = true;

  const ns           = global.PersistentHighlighter;
  const storage      = new ns.HighlightStorage();
  const renderer     = new ns.HighlightRenderer(storage);
  const notesBoard   = new ns.NotesBoard(storage);
  const focusOverlay = new ns.FocusOverlay(storage);
  const selectionUI  = new ns.SelectionUI({ storage, renderer, notesBoard });

  // Compartido con sidebar.js (mismo contexto de content script)
  ns.app = { storage, renderer, notesBoard, selectionUI };

  let currentUrl = ns.getDocumentUrl();

  // ── Manejador central de mensajes ─────────────────────────────────────────
  const handlers = {
    PING: async function() {
      return { url: ns.getDocumentUrl(), title: document.title };
    },
    APPLY_HIGHLIGHT: async function(msg) {
      const record = await renderer.applySelectionHighlight(msg.color, msg.customColor);
      return { record };
    },
    REMOVE_HIGHLIGHT: async function(msg) {
      await renderer.removeHighlightById(msg.highlightId);
      return { removedId: msg.highlightId };
    },
    CLEAR_HIGHLIGHTS: async function() {
      const removedCount = await renderer.clearCurrentPage();
      return { removedCount };
    },
    RESTORE_HIGHLIGHTS: async function() {
      const restored = await renderer.restoreHighlightsForCurrentPage();
      return { restored, unresolved: renderer.unresolvedIds.size };
    },
    SCROLL_TO_HIGHLIGHT: async function(msg) {
      return { found: renderer.scrollToHighlight(msg.highlightId) };
    },
    CREATE_NOTE: async function(msg) {
      const note = await notesBoard.createNote(msg.color);
      return { note };
    },
    CREATE_NOTE_FROM_SELECTION: async function(msg) {
      const text = renderer.getSelectedText();
      const note = text
        ? await notesBoard.createNoteFromText(msg.color, text)
        : await notesBoard.createNote(msg.color);
      return { note };
    },
    RESTORE_NOTES: async function() {
      const restored = await notesBoard.restoreNotesForCurrentPage();
      return { restored };
    },
    PATCH_HIGHLIGHT: async function(msg) {
      const updated = await storage.patchHighlight(ns.getDocumentUrl(), msg.highlightId, msg.patch);
      if (updated) renderer._decorate(updated);
      return { updated };
    },
    FOCUS_ACTION: async function(msg) {
      const focusState = await focusOverlay.handleAction(msg.action, msg.payload);
      return { focusState };
    }
  };

  chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {
    const handler = msg && handlers[msg.type];
    // Los mensajes que no son nuestros (p. ej. TOGGLE_SIDEBAR) los atiende otro listener
    if (!handler) return false;
    handler(msg)
      .then(function(data) { sendResponse({ ok: true, data: data }); })
      .catch(function(err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : "Error desconocido." });
      });
    return true; // respuesta asíncrona
  });

  // ── Alt+Click para eliminar resaltado ─────────────────────────────────────
  document.addEventListener("click", async function(event) {
    if (!event.altKey) return;
    const hl = event.target && typeof event.target.closest === "function"
      ? event.target.closest("." + ns.HIGHLIGHT_CLASS)
      : null;
    if (!hl) return;

    event.preventDefault();
    event.stopPropagation();

    const id = hl.getAttribute(ns.HIGHLIGHT_ATTR);
    if (!id) return;
    try {
      await renderer.removeHighlightById(id);
    } catch (err) {
      console.error("Annotate: no se pudo eliminar el resaltado", err);
    }
  }, true);

  // ── Recordar selección activa para uso desde popup/atajos ─────────────────
  document.addEventListener("mouseup", () => renderer.rememberCurrentSelection());
  document.addEventListener("keyup",   () => renderer.rememberCurrentSelection());

  // ── Mantener la página sincronizada con el almacenamiento ─────────────────
  // (cambios hechos desde el popup, la biblioteca, el panel u otra pestaña)
  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== "local") return;
    const url = ns.getDocumentUrl();

    if (changes[ns.STORAGE_KEY]) {
      const byUrl = changes[ns.STORAGE_KEY].newValue || {};
      void renderer.syncWithRecords(byUrl[url] || []).catch(function() {});
    }
    if (changes[ns.NOTES_STORAGE_KEY]) {
      const byUrl = changes[ns.NOTES_STORAGE_KEY].newValue || {};
      notesBoard.syncWithNotes(byUrl[url] || []);
    }
    if (changes[ns.SETTINGS_KEY]) {
      const settings = ns.normalizeSettings(changes[ns.SETTINGS_KEY].newValue);
      notesBoard.setHidden(settings.readingMode);
    }
  });

  // ── Webs SPA: la URL cambia sin recargar la página ────────────────────────
  function watchUrlChanges() {
    if (global.__annotatePdfMode) return;
    setInterval(function() {
      const next = ns.getDocumentUrl();
      if (next === currentUrl) return;
      currentUrl = next;
      notesBoard.reset();
      selectionUI.hidePopover();
      void renderer.unrenderAll()
        .then(function() { return renderer.restoreHighlightsForCurrentPage(); })
        .then(function() { return notesBoard.restoreNotesForCurrentPage(); })
        .catch(function() {});
    }, 1000);
  }

  // ── Bootstrap: restaurar resaltados y notas al cargar ────────────────────
  async function bootstrap() {
    try {
      const settings = await storage.getSettings();
      notesBoard.setHidden(settings.readingMode);
      await renderer.restoreHighlightsForCurrentPage();
      await notesBoard.restoreNotesForCurrentPage();
      await focusOverlay.restore();
      await selectionUI.init();
      renderer.observeDynamicContent();
      notesBoard.observeViewport();
      watchUrlChanges();
    } catch (err) {
      console.error("Annotate: error en bootstrap", err);
    }
  }

  void bootstrap();
})(globalThis);
