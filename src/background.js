importScripts("types.js");

(function bootstrapBackground(global) {
  const ns = global.PersistentHighlighter;

  const MENU_ROOT    = "annotate";
  const CONTENT_FILES = [
    "src/types.js", "src/storage.js", "src/highlighter.js", "src/notes.js",
    "src/focus.js", "src/toolbar.js", "src/content.js", "src/sidebar.js"
  ];
  const CONTENT_CSS = ["src/styles.css", "src/sidebar.css"];

  function createMenus() {
    chrome.contextMenus.removeAll(function() {
      chrome.contextMenus.create({
        id: MENU_ROOT,
        title: "Annotate",
        contexts: ["selection", "page"]
      });

      ns.COLOR_OPTIONS.forEach(function(color) {
        chrome.contextMenus.create({
          id: MENU_ROOT + ":hl:" + color.id,
          parentId: MENU_ROOT,
          title: "Resaltar: " + color.label,
          contexts: ["selection"]
        });
      });

      chrome.contextMenus.create({
        id: MENU_ROOT + ":hl:custom",
        parentId: MENU_ROOT,
        title: "Resaltar: último color personalizado",
        contexts: ["selection"]
      });

      chrome.contextMenus.create({ id: MENU_ROOT + ":sep1", parentId: MENU_ROOT, type: "separator", contexts: ["selection", "page"] });

      chrome.contextMenus.create({
        id: MENU_ROOT + ":note-from-selection",
        parentId: MENU_ROOT,
        title: "Crear nota con la selección",
        contexts: ["selection"]
      });

      chrome.contextMenus.create({
        id: MENU_ROOT + ":note",
        parentId: MENU_ROOT,
        title: "Nueva nota",
        contexts: ["page"]
      });

      chrome.contextMenus.create({
        id: MENU_ROOT + ":sidebar",
        parentId: MENU_ROOT,
        title: "Abrir panel lateral",
        contexts: ["page"]
      });

      chrome.contextMenus.create({ id: MENU_ROOT + ":sep2", parentId: MENU_ROOT, type: "separator", contexts: ["page"] });

      chrome.contextMenus.create({
        id: MENU_ROOT + ":clear",
        parentId: MENU_ROOT,
        title: "Limpiar resaltados de esta página",
        contexts: ["page"]
      });

      // Menú del icono de la extensión
      chrome.contextMenus.create({
        id: MENU_ROOT + ":library",
        title: "Abrir biblioteca de apuntes",
        contexts: ["action"]
      });
    });
  }

  function openLibrary() {
    return chrome.tabs.create({ url: chrome.runtime.getURL("src/library.html") });
  }

  async function maybeRedirectPdfTab(tabId, rawUrl, force) {
    const pdfUrl = ns.extractPdfUrl(rawUrl);
    if (!pdfUrl || ns.isAnnotatePdfViewerUrl(rawUrl)) return false;
    if (!force) {
      const enabled = await getSetting("openPdfInViewer", true);
      if (enabled === false) return false;
    }

    const viewerUrl = ns.getAnnotatePdfViewerUrl(pdfUrl);
    if (viewerUrl === rawUrl) return false;

    await chrome.tabs.update(tabId, { url: viewerUrl });
    return true;
  }

  // Inyecta CSS y scripts en la pestaña si no están ya cargados
  // (pestañas abiertas antes de instalar/recargar la extensión)
  async function injectIntoTab(tabId) {
    await chrome.scripting.insertCSS({ target: { tabId }, files: CONTENT_CSS });
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
  }

  async function sendToTab(tabId, message) {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.url) {
      const redirected = await maybeRedirectPdfTab(tabId, tab.url, true);
      if (redirected) {
        throw new Error("El PDF se ha abierto en el visor de Annotate. Espera a que cargue y repite la acción.");
      }
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(tabId, message);
    } catch (_e) {
      await injectIntoTab(tabId);
      response = await chrome.tabs.sendMessage(tabId, message);
    }
    if (response && response.ok === false) throw new Error(response.error || "No se pudo completar la acción.");
    return response;
  }

  // Aviso visible cuando un atajo o menú falla (p. ej. sin texto seleccionado)
  function flashError(tabId, err) {
    console.warn("Annotate:", err && err.message);
    try {
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#b42318" });
      chrome.action.setBadgeText({ tabId, text: "!" });
      chrome.action.setTitle({ tabId, title: "Annotate — " + (err && err.message ? err.message : "Error") });
      setTimeout(function() {
        chrome.action.setBadgeText({ tabId, text: "" });
        chrome.action.setTitle({ tabId, title: "Annotate — Highlights & Notes" });
      }, 4000);
    } catch (_e) {}
  }

  function getSetting(key, fallback) {
    return new Promise(function(resolve) {
      chrome.storage.local.get([ns.SETTINGS_KEY], function(items) {
        const s = items && items[ns.SETTINGS_KEY];
        resolve(s && s[key] !== undefined ? s[key] : fallback);
      });
    });
  }

  chrome.runtime.onInstalled.addListener(createMenus);
  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(createMenus);

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
    if (!changeInfo.url) return;
    maybeRedirectPdfTab(tabId, changeInfo.url, false).catch(function(error) {
      console.error("Annotate: no se pudo abrir el visor PDF propio", error);
    });
  });

  // ── Menú contextual ────────────────────────────────────────────────────────
  chrome.contextMenus.onClicked.addListener(async function(info, tab) {
    const mid = info.menuItemId;
    if (mid === MENU_ROOT + ":library") {
      await openLibrary();
      return;
    }
    if (!tab || !tab.id) return;

    try {
      if (mid === MENU_ROOT + ":clear") {
        await sendToTab(tab.id, { type: "CLEAR_HIGHLIGHTS" });
        return;
      }

      if (mid === MENU_ROOT + ":sidebar") {
        await sendToTab(tab.id, { type: "OPEN_SIDEBAR" });
        return;
      }

      if (mid === MENU_ROOT + ":note") {
        const noteColor = await getSetting("noteColor", "yellow");
        await sendToTab(tab.id, { type: "CREATE_NOTE", color: noteColor });
        return;
      }

      if (mid === MENU_ROOT + ":note-from-selection") {
        const noteColor = await getSetting("noteColor", "yellow");
        await sendToTab(tab.id, { type: "CREATE_NOTE_FROM_SELECTION", color: noteColor });
        return;
      }

      if (typeof mid === "string" && mid.startsWith(MENU_ROOT + ":hl:")) {
        const color = mid.split(":").pop();
        if (color === "custom") {
          const customColor = await getSetting("customColor", "#facc15");
          await sendToTab(tab.id, { type: "APPLY_HIGHLIGHT", color: "custom", customColor });
        } else {
          await sendToTab(tab.id, { type: "APPLY_HIGHLIGHT", color });
        }
      }
    } catch (err) {
      flashError(tab.id, err);
    }
  });

  // ── Atajos de teclado (commands) ──────────────────────────────────────────
  chrome.commands.onCommand.addListener(async function(command) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    try {
      if (command === "highlight-selection") {
        const selectedColor = await getSetting("selectedColor", "yellow");
        const customColor   = await getSetting("customColor", "#facc15");
        const resolved = ns.resolveHighlightColor(selectedColor, customColor);
        await sendToTab(tab.id, { type: "APPLY_HIGHLIGHT", color: resolved.color, customColor: resolved.customColor });
      }

      if (command === "create-note") {
        const noteColor = await getSetting("noteColor", "yellow");
        await sendToTab(tab.id, { type: "CREATE_NOTE", color: noteColor });
      }

      if (command === "highlight-from-selection") {
        const noteColor = await getSetting("noteColor", "yellow");
        await sendToTab(tab.id, { type: "CREATE_NOTE_FROM_SELECTION", color: noteColor });
      }

      if (command === "toggle-sidebar") {
        await sendToTab(tab.id, { type: "TOGGLE_SIDEBAR" });
      }
    } catch (err) {
      flashError(tab.id, err);
    }
  });

  // Peticiones desde la biblioteca
  chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {
    if (msg && msg.type === "OPEN_LIBRARY") {
      openLibrary().then(function() { sendResponse({ ok: true }); });
      return true;
    }
    return false;
  });
})(globalThis);
