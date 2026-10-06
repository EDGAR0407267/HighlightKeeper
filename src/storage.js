(function bootstrapStorage(global) {
  const ns = global.PersistentHighlighter;

  // Todas las operaciones leer-modificar-escribir pasan por esta cola.
  // Sin ella, dos guardados casi simultáneos (p. ej. autoguardado de dos notas)
  // leen el mismo estado y el segundo pisa al primero.
  let writeQueue = Promise.resolve();
  function withLock(task) {
    const run = writeQueue.then(task, task);
    writeQueue = run.catch(function() {});
    return run;
  }

  function HighlightStorage() {}

  // ═══════════════════════════════════════════════════════════
  // HIGHLIGHTS
  // ═══════════════════════════════════════════════════════════

  HighlightStorage.prototype.getHighlights = async function getHighlights(url) {
    const byUrl = await this._getRecordsByUrl();
    const key   = ns.normalizeUrl(url);
    return (byUrl[key] || []).slice().sort(_byPosition);
  };

  HighlightStorage.prototype.getAllHighlights = async function getAllHighlights() {
    const byUrl = await this._getRecordsByUrl();
    const all   = [];
    Object.values(byUrl).forEach(function(records) { all.push.apply(all, records); });
    return all.sort(_byDate);
  };

  HighlightStorage.prototype.getRecordsByUrl = function getRecordsByUrl() {
    return this._getRecordsByUrl();
  };

  HighlightStorage.prototype.saveHighlight = function saveHighlight(record) {
    return this.saveHighlights([record]);
  };

  // Guarda varios registros en una sola escritura
  HighlightStorage.prototype.saveHighlights = function saveHighlights(records) {
    const self = this;
    return withLock(async function() {
      const byUrl = await self._getRecordsByUrl();
      let lastList = [];
      records.forEach(function(record) {
        const key  = ns.normalizeUrl(record.url);
        const list = byUrl[key] || [];
        const next = Object.assign({}, record, { url: key });
        const idx  = list.findIndex(function(r) { return r.id === record.id; });
        if (idx >= 0) list[idx] = next;
        else list.push(next);
        byUrl[key] = list;
        lastList = list;
      });
      await self._writeRecordsByUrl(byUrl);
      return lastList;
    });
  };

  HighlightStorage.prototype.removeHighlight = function removeHighlight(url, id) {
    return this.replaceHighlights(url, [id], []);
  };

  // Elimina `removeIds` y guarda `upserts` de una página en una sola escritura
  HighlightStorage.prototype.replaceHighlights = function replaceHighlights(url, removeIds, upserts) {
    const self = this;
    return withLock(async function() {
      const byUrl = await self._getRecordsByUrl();
      const key   = ns.normalizeUrl(url);
      let list    = (byUrl[key] || []).filter(function(r) { return removeIds.indexOf(r.id) === -1; });
      (upserts || []).forEach(function(record) {
        const next = Object.assign({}, record, { url: key });
        const idx  = list.findIndex(function(r) { return r.id === record.id; });
        if (idx >= 0) list[idx] = next;
        else list.push(next);
      });
      if (list.length) byUrl[key] = list;
      else delete byUrl[key];
      await self._writeRecordsByUrl(byUrl);
      return list;
    });
  };

  HighlightStorage.prototype.clearHighlights = function clearHighlights(url) {
    const self = this;
    return withLock(async function() {
      const byUrl = await self._getRecordsByUrl();
      delete byUrl[ns.normalizeUrl(url)];
      await self._writeRecordsByUrl(byUrl);
    });
  };

  // Actualiza campos específicos de un resaltado (etiquetas, favorito, comentario…)
  HighlightStorage.prototype.patchHighlight = function patchHighlight(url, id, patch) {
    const self = this;
    return withLock(async function() {
      const byUrl = await self._getRecordsByUrl();
      const key   = ns.normalizeUrl(url);
      const list  = byUrl[key] || [];
      const idx   = list.findIndex(function(r) { return r.id === id; });
      if (idx < 0) return null;
      list[idx] = Object.assign({}, list[idx], patch, { updatedAt: new Date().toISOString() });
      byUrl[key] = list;
      await self._writeRecordsByUrl(byUrl);
      return list[idx];
    });
  };

  // ═══════════════════════════════════════════════════════════
  // NOTES
  // ═══════════════════════════════════════════════════════════

  HighlightStorage.prototype.getNotes = async function getNotes(url) {
    const byUrl = await this._getNotesByUrl();
    const key   = ns.normalizeUrl(url);
    return (byUrl[key] || []).slice().sort(_byDate);
  };

  HighlightStorage.prototype.getAllNotes = async function getAllNotes() {
    const byUrl = await this._getNotesByUrl();
    const all   = [];
    Object.values(byUrl).forEach(function(notes) { all.push.apply(all, notes); });
    return all.sort(_byDate);
  };

  HighlightStorage.prototype.getNotesByUrl = function getNotesByUrl() {
    return this._getNotesByUrl();
  };

  HighlightStorage.prototype.saveNote = function saveNote(note) {
    const self = this;
    return withLock(async function() {
      const byUrl = await self._getNotesByUrl();
      const key   = ns.normalizeUrl(note.url);
      const list  = byUrl[key] || [];
      const idx   = list.findIndex(function(n) { return n.id === note.id; });
      const next  = Object.assign({}, idx >= 0 ? list[idx] : {}, note, { url: key });
      if (idx >= 0) list[idx] = next;
      else list.push(next);
      byUrl[key] = list;
      await self._writeNotesByUrl(byUrl);
      return list;
    });
  };

  HighlightStorage.prototype.removeNote = function removeNote(url, id) {
    const self = this;
    return withLock(async function() {
      const byUrl = await self._getNotesByUrl();
      const key   = ns.normalizeUrl(url);
      const list  = (byUrl[key] || []).filter(function(n) { return n.id !== id; });
      if (list.length) byUrl[key] = list;
      else delete byUrl[key];
      await self._writeNotesByUrl(byUrl);
      return list;
    });
  };

  HighlightStorage.prototype.clearNotes = function clearNotes(url) {
    const self = this;
    return withLock(async function() {
      const byUrl = await self._getNotesByUrl();
      delete byUrl[ns.normalizeUrl(url)];
      await self._writeNotesByUrl(byUrl);
    });
  };

  HighlightStorage.prototype.patchNote = function patchNote(url, id, patch) {
    const self = this;
    return withLock(async function() {
      const byUrl = await self._getNotesByUrl();
      const key   = ns.normalizeUrl(url);
      const list  = byUrl[key] || [];
      const idx   = list.findIndex(function(n) { return n.id === id; });
      if (idx < 0) return null;
      list[idx] = Object.assign({}, list[idx], patch);
      byUrl[key] = list;
      await self._writeNotesByUrl(byUrl);
      return list[idx];
    });
  };

  // ═══════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════

  HighlightStorage.prototype.getSettings = async function getSettings() {
    const items = await this._get([ns.SETTINGS_KEY]);
    return normalizeSettings(items[ns.SETTINGS_KEY]);
  };

  HighlightStorage.prototype.saveSettings = function saveSettings(patch) {
    const self = this;
    return withLock(async function() {
      const current = await self.getSettings();
      const next    = Object.assign({}, current, patch);
      await self._set({ [ns.SETTINGS_KEY]: next });
      return next;
    });
  };

  function normalizeSettings(raw) {
    const s = raw || {};
    return {
      selectedColor:    s.selectedColor || ns.DEFAULT_COLOR,
      customColor:      ns.sanitizeColorHex(s.customColor),
      noteColor:        s.noteColor     || "yellow",
      darkMode:         Boolean(s.darkMode),
      readingMode:      Boolean(s.readingMode),
      selectionToolbar: s.selectionToolbar !== false,
      openPdfInViewer:  s.openPdfInViewer !== false,
      globalTags:       Array.isArray(s.globalTags) ? s.globalTags : []
    };
  }
  ns.normalizeSettings = normalizeSettings;

  HighlightStorage.prototype.getFocusState = async function getFocusState() {
    const items = await this._get([ns.FOCUS_STORAGE_KEY]);
    return ns.normalizeFocusState(items[ns.FOCUS_STORAGE_KEY]);
  };

  HighlightStorage.prototype.saveFocusState = function saveFocusState(patch, options) {
    const self = this;
    const replace = Boolean(options && options.replace);
    return withLock(async function() {
      const next = replace
        ? ns.normalizeFocusState(patch)
        : ns.mergeFocusState(await self.getFocusState(), patch || {});
      await self._set({ [ns.FOCUS_STORAGE_KEY]: next });
      return next;
    });
  };

  // ═══════════════════════════════════════════════════════════
  // EXPORT / IMPORT
  // ═══════════════════════════════════════════════════════════

  HighlightStorage.prototype.exportAll = async function exportAll() {
    const highlights = await this.getAllHighlights();
    const notes      = await this.getAllNotes();
    const settings   = await this.getSettings();
    return {
      version:    "2.0",
      exportedAt: new Date().toISOString(),
      highlights: highlights,
      notes:      notes,
      globalTags: settings.globalTags
    };
  };

  HighlightStorage.prototype.importAll = function importAll(data) {
    const self = this;
    if (!data || typeof data !== "object" ||
        (!Array.isArray(data.highlights) && !Array.isArray(data.notes))) {
      return Promise.reject(new Error("El archivo no es una copia de Annotate."));
    }
    const highlights = (Array.isArray(data.highlights) ? data.highlights : [])
      .filter(function(r) { return r && r.id && r.url && r.selectedText; });
    const notes = (Array.isArray(data.notes) ? data.notes : [])
      .filter(function(n) { return n && n.id && n.url; });

    return withLock(async function() {
      let addedHighlights = 0;
      let addedNotes = 0;

      const hlByUrl = await self._getRecordsByUrl();
      highlights.forEach(function(record) {
        const key  = ns.normalizeUrl(record.url);
        const list = hlByUrl[key] || [];
        if (!list.some(function(r) { return r.id === record.id; })) {
          list.push(Object.assign({}, record, { url: key }));
          addedHighlights++;
        }
        hlByUrl[key] = list;
      });
      await self._writeRecordsByUrl(hlByUrl);

      const notesByUrl = await self._getNotesByUrl();
      notes.forEach(function(note) {
        const key  = ns.normalizeUrl(note.url);
        const list = notesByUrl[key] || [];
        if (!list.some(function(n) { return n.id === note.id; })) {
          list.push(Object.assign({}, note, { url: key }));
          addedNotes++;
        }
        notesByUrl[key] = list;
      });
      await self._writeNotesByUrl(notesByUrl);

      if (Array.isArray(data.globalTags) && data.globalTags.length) {
        const items = await self._get([ns.SETTINGS_KEY]);
        const settings = normalizeSettings(items[ns.SETTINGS_KEY]);
        data.globalTags.forEach(function(tag) {
          if (typeof tag === "string" && settings.globalTags.indexOf(tag) === -1) settings.globalTags.push(tag);
        });
        await self._set({ [ns.SETTINGS_KEY]: settings });
      }

      return { highlights: addedHighlights, notes: addedNotes };
    });
  };

  // ═══════════════════════════════════════════════════════════
  // INTERNOS
  // ═══════════════════════════════════════════════════════════

  HighlightStorage.prototype._getRecordsByUrl = async function _getRecordsByUrl() {
    const items = await this._get([ns.STORAGE_KEY]);
    return items[ns.STORAGE_KEY] || {};
  };

  HighlightStorage.prototype._writeRecordsByUrl = async function _writeRecordsByUrl(data) {
    await this._set({ [ns.STORAGE_KEY]: data });
  };

  HighlightStorage.prototype._getNotesByUrl = async function _getNotesByUrl() {
    const items = await this._get([ns.NOTES_STORAGE_KEY]);
    return items[ns.NOTES_STORAGE_KEY] || {};
  };

  HighlightStorage.prototype._writeNotesByUrl = async function _writeNotesByUrl(data) {
    await this._set({ [ns.NOTES_STORAGE_KEY]: data });
  };

  HighlightStorage.prototype._get = function _get(keys) {
    return new Promise(function(resolve, reject) {
      // Si el contexto de la extensión fue invalidado (p.ej. tras recargarla),
      // devolvemos un objeto vacío en lugar de lanzar un error.
      try {
        if (!chrome.runtime || !chrome.runtime.id) return resolve({});
      } catch (_e) { return resolve({}); }

      chrome.storage.local.get(keys, function(items) {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "";
          if (msg.includes("Extension context invalidated")) return resolve({});
          return reject(new Error(msg));
        }
        resolve(items);
      });
    });
  };

  HighlightStorage.prototype._set = function _set(items) {
    return new Promise(function(resolve, reject) {
      try {
        if (!chrome.runtime || !chrome.runtime.id) return resolve();
      } catch (_e) { return resolve(); }

      chrome.storage.local.set(items, function() {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "";
          if (msg.includes("Extension context invalidated")) return resolve();
          return reject(new Error(msg));
        }
        resolve();
      });
    });
  };

  function _byDate(a, b) {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }

  // Orden de lectura: posición en la página; los antiguos sin posición, al final por fecha
  function _byPosition(a, b) {
    const pa = Number.isFinite(a.textPos) ? a.textPos : Infinity;
    const pb = Number.isFinite(b.textPos) ? b.textPos : Infinity;
    if (pa !== pb) return pa < pb ? -1 : 1;
    return _byDate(a, b);
  }

  ns.HighlightStorage = HighlightStorage;
})(globalThis);
