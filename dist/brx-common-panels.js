/* brx-common-panels — https://github.com/wpeasy/brx-common-panels (GPL-2.0-or-later) */
"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };

  // packages/brx-common-panels/src/index.ts
  var BRX_COMMON_READY_EVENT = "brx-common:ready";
  (function bootstrap() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (window.BRX_Common && window.BRX_Common.panels) return;
    const VERSION = "0.18.1";
    const PREVIEW_ID = "bricks-preview";
    const WRAPPER_ID = "bricks-builder-iframe-wrapper";
    const HOST_CLASS = "brx-common-host";
    const DOCK_CLASS = "brx-common-dock";
    const BAR_CLASS = "brx-common-dock__bar";
    const CHEVRON_CLASS = "brx-common-dock__chevron";
    const ROWS_CLASS = "brx-common-dock__rows";
    const ROW_CLASS = "brx-common-dock__row";
    const DIVIDER_CLASS = "brx-common-dock__divider";
    const PANEL_CLASS = "brx-common-panel";
    const PANEL_HEADER_CLASS = "brx-common-panel__header";
    const PANEL_TITLE_CLASS = "brx-common-panel__title";
    const PANEL_GRIP_CLASS = "brx-common-panel__grip";
    const PANEL_CLOSE_CLASS = "brx-common-panel__close";
    const PANEL_BODY_CLASS = "brx-common-panel__body";
    const PANEL_FOOTER_CLASS = "brx-common-panel__footer";
    const GHOST_CLASS = "brx-common-panel__ghost";
    const PLACEHOLDER_CLASS = "brx-common-dock__placeholder";
    const DRAGGING_CLASS = "brx-common-panel--dragging";
    const DOCK_DRAG_CLASS = "brx-common-dock--drag";
    const DRAG_ACTIVE_CLASS = "brx-common-drag-active";
    const STYLE_ID = "brx-common-panels-style";
    const LS_KEY = "brx-common-panels";
    const DEFAULT_HEIGHT = 300;
    const DEFAULT_MIN = 80;
    const MAX_PER_ROW = 3;
    const PANEL_MIN_WIDTH = 80;
    const PANEL_MIN_HEIGHT = 60;
    const ALL_POSITIONS = ["top", "bottom", "left", "right"];
    const SIDE = (p) => p === "left" || p === "right";
    const registry = /* @__PURE__ */ new Map();
    const docks = /* @__PURE__ */ new Map();
    const listeners = /* @__PURE__ */ new Set();
    const addListeners = /* @__PURE__ */ new Set();
    const removeListeners = /* @__PURE__ */ new Set();
    let seq = 0;
    let enabledPositions = ALL_POSITIONS.slice();
    function permittedPositions(allowed) {
      const base = allowed && allowed.length ? allowed : ALL_POSITIONS;
      return base.filter((p) => enabledPositions.includes(p));
    }
    function resolvePosition(want, allowed) {
      var _a;
      const ok = permittedPositions(allowed);
      return ok.includes(want) ? want : (_a = ok[0]) != null ? _a : want;
    }
    function getWrapper() {
      return document.getElementById(WRAPPER_ID);
    }
    function getPreview() {
      const w = getWrapper();
      return (w == null ? void 0 : w.parentElement) || document.getElementById(PREVIEW_ID);
    }
    function ensureHost() {
      const preview = getPreview();
      if (preview) preview.classList.add(HOST_CLASS);
    }
    function ensureStylesheet() {
      ensureHost();
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = [
        // Layout host: a 3x3 grid. Top/bottom docks span the full width (rows 1/3);
        // left/right docks flank the center (column 1/3 of row 2); the iframe wrapper
        // sits in the center cell. Empty side columns collapse to 0 width, so a
        // top/bottom-only layout behaves exactly like the previous flex column.
        "#" + PREVIEW_ID + ",." + HOST_CLASS + "{display:grid !important;grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:auto minmax(0,1fr) auto;}",
        // width/margin are deliberately NON-important: Bricks sets the responsive
        // canvas width as an INLINE style (e.g. 768px), which overrides width:100%;
        // on RESET (inline width removed) width:100% fills the center cell again.
        // margin-inline:auto centers an explicit responsive width. height:auto
        // !important beats Bricks' inline height; the grid cell stretch fills it.
        // max-width:100% !important caps the wrapper to the centre cell so an
        // inline responsive width (or Bricks' full-canvas inline width) can't spill
        // it over the left/right docks. width:100% (non-important) fills the cell on
        // reset; margin-inline:auto centres an explicit (smaller) responsive width.
        "#" + WRAPPER_ID + "{grid-column:2;grid-row:2;height:auto !important;min-height:0 !important;min-width:0 !important;max-width:100% !important;width:100%;margin-inline:auto;}",
        // Dock placement by edge.
        "." + DOCK_CLASS + '[data-position="top"]{grid-column:1 / -1;grid-row:1;}',
        "." + DOCK_CLASS + '[data-position="bottom"]{grid-column:1 / -1;grid-row:3;}',
        "." + DOCK_CLASS + '[data-position="left"]{grid-column:1;grid-row:2;}',
        "." + DOCK_CLASS + '[data-position="right"]{grid-column:3;grid-row:2;}',
        // Dock container — top/bottom stack bar+rows vertically (default).
        "." + DOCK_CLASS + "{position:relative;display:flex;flex-direction:column;min-height:0;min-width:0;box-sizing:border-box;}",
        "." + DOCK_CLASS + '[data-collapsed="true"]{height:auto !important;}',
        "." + DOCK_CLASS + ":empty{display:none;}",
        // ── Side docks (left/right): a vertical strip — flex ROW so the chrome bar
        //    sits on the inner (iframe-facing) edge and a single column of panels
        //    fills the height. The rows container width = the dock's resizable width. ──
        "." + DOCK_CLASS + '[data-position="left"],.' + DOCK_CLASS + '[data-position="right"]{flex-direction:row;height:100%;min-width:0;}',
        "." + DOCK_CLASS + '[data-position="left"]>.' + ROWS_CLASS + ",." + DOCK_CLASS + '[data-position="right"]>.' + ROWS_CLASS + "{flex:1 1 auto;height:100%;min-height:0;}",
        "." + DOCK_CLASS + '[data-position="left"]>.' + BAR_CLASS + ",." + DOCK_CLASS + '[data-position="right"]>.' + BAR_CLASS + "{height:auto;width:10px;cursor:ew-resize;}",
        // Single-column panels in a side dock: stack vertically, resize vertically.
        "." + DOCK_CLASS + '[data-position="left"] [data-brx-panel],.' + DOCK_CLASS + '[data-position="right"] [data-brx-panel]{flex:1 1 0;min-height:' + PANEL_MIN_HEIGHT + "px;min-width:0;overflow:hidden;}",
        // Horizontal divider variant (between vertically-stacked side-dock panels).
        "." + DIVIDER_CLASS + "--h{flex:0 0 4px !important;width:auto !important;height:4px !important;cursor:ns-resize !important;}",
        // Side-dock drop placeholder is a horizontal strip (min-height, not -width).
        "." + DOCK_CLASS + '[data-position="left"] .' + PLACEHOLDER_CLASS + ",." + DOCK_CLASS + '[data-position="right"] .' + PLACEHOLDER_CLASS + "{min-width:0;min-height:" + PANEL_MIN_HEIGHT + "px;}",
        // Rows container: vertical stack — each row holds up to MAX_PER_ROW
        // panels side by side; a 4th panel wraps to a new row beneath. The dock
        // height is content-driven (it grows taller as rows are added).
        "." + ROWS_CLASS + "{flex:0 0 auto;min-width:0;display:flex;flex-direction:column;}",
        "." + ROW_CLASS + "{flex:0 0 auto;min-height:0;min-width:0;display:flex;flex-direction:row;flex-wrap:nowrap;}",
        "." + ROW_CLASS + "+." + ROW_CLASS + "{border-top:1px solid var(--builder-border,#3a3a3a);}",
        "." + ROW_CLASS + ">[data-brx-panel]{flex:1 1 0;min-width:" + PANEL_MIN_WIDTH + "px;min-height:0;overflow:hidden;}",
        // Collapsed → hide the rows, leaving just the chrome bar.
        "." + DOCK_CLASS + '[data-collapsed="true"]>.' + ROWS_CLASS + "{display:none;}",
        // While dragging, every dock shows a drop area; an empty dock's rows get
        // a dashed drop-zone hint so a panel can be dropped into it.
        "." + DOCK_CLASS + "." + DOCK_DRAG_CLASS + " ." + ROWS_CLASS + "{min-height:46px;}",
        "." + DOCK_CLASS + "." + DOCK_DRAG_CLASS + " ." + ROWS_CLASS + ":empty{margin:4px;border:2px dashed var(--builder-color-accent,#3b82f6);background:rgba(59,130,246,.07);border-radius:3px;}",
        // Side docks need a WIDTH drop zone while dragging (an empty one is 0‑wide).
        // min-width overrides the inline width:0 of an empty dock without resizing a
        // populated one (whose extent width is already > 46).
        "." + DOCK_CLASS + '[data-position="left"].' + DOCK_DRAG_CLASS + ">." + ROWS_CLASS + ",." + DOCK_CLASS + '[data-position="right"].' + DOCK_DRAG_CLASS + ">." + ROWS_CLASS + "{min-width:46px;}",
        // Vertical divider between adjacent panels — drag to resize horizontally.
        "." + DIVIDER_CLASS + "{flex:0 0 4px;align-self:stretch;cursor:ew-resize;background:var(--builder-border,#3a3a3a);touch-action:none;}",
        "." + DIVIDER_CLASS + ":hover{background:var(--builder-color-accent,#3b82f6);}",
        // Chrome bar on the iframe-facing edge: the WHOLE bar toggles collapse
        // (click) and resizes (drag); a centered light chevron indicates state.
        "." + BAR_CLASS + "{flex:0 0 auto;display:flex;align-items:center;justify-content:center;height:10px;background:#3b3b3b;cursor:ns-resize;touch-action:none;user-select:none;}",
        "." + DOCK_CLASS + '[data-collapsed="true"]>.' + BAR_CLASS + "{cursor:pointer;}",
        "." + CHEVRON_CLASS + "{pointer-events:none;color:#cfcfcf;font:600 8px/1 system-ui,sans-serif;opacity:.85;}",
        "." + BAR_CLASS + ":hover ." + CHEVRON_CLASS + "{opacity:1;}",
        // ── Panel template (create()) — consistent header+body, Bricks builder colours, tight padding ──
        "." + PANEL_CLASS + "{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--builder-bg,#1e1e1e);color:var(--builder-color,#e0e0e0);font-family:inherit;font-size:12px;box-sizing:border-box;}",
        "." + PANEL_CLASS + " *{box-sizing:border-box;}",
        "." + PANEL_HEADER_CLASS + ",." + PANEL_FOOTER_CLASS + "{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:3px 8px;min-height:24px;background:var(--bricks-bg-dark,#18191d);color:var(--bricks-color-light,#e6e9ee);}",
        // The whole header is a drag handle → grab cursor (interactive children keep theirs).
        "." + PANEL_HEADER_CLASS + "{border-bottom:1px solid var(--builder-border,#2f3136);cursor:grab;}",
        "." + PANEL_HEADER_CLASS + " button,." + PANEL_HEADER_CLASS + " a,." + PANEL_HEADER_CLASS + " input,." + PANEL_HEADER_CLASS + " select,." + PANEL_HEADER_CLASS + " textarea{cursor:auto;}",
        "." + PANEL_FOOTER_CLASS + "{border-top:1px solid var(--builder-border,#2f3136);}",
        "." + PANEL_TITLE_CLASS + "{font-weight:600;white-space:nowrap;}",
        // Drag grip (far left of the header) — the ONLY drag handle, so it
        // never conflicts with the panel's own header controls.
        "." + PANEL_GRIP_CLASS + "{flex:0 0 auto;cursor:grab;color:inherit;opacity:.5;font:600 12px/1 system-ui,sans-serif;padding:0 2px;user-select:none;touch-action:none;}",
        "." + PANEL_GRIP_CLASS + ":hover{opacity:.9;}",
        "." + PANEL_GRIP_CLASS + ":active{cursor:grabbing;}",
        // While dragging, the original panel is temporarily removed from flow
        // so BOTH docks reflow live (source redistributes/empties, target opens
        // a slot). A placeholder shows where it will land.
        "." + DRAGGING_CLASS + "{display:none !important;}",
        // While a panel drag is in progress, kill text selection everywhere (so the
        // pointer sweeping across the page — including the preview iframe — doesn't
        // paint a blue selection) and make the iframe ignore the pointer entirely
        // (drop targeting is coordinate-based, so this costs nothing).
        "." + DRAG_ACTIVE_CLASS + ",." + DRAG_ACTIVE_CLASS + " *{user-select:none !important;-webkit-user-select:none !important;}",
        "." + DRAG_ACTIVE_CLASS + " #" + WRAPPER_ID + "{pointer-events:none !important;}",
        "." + PLACEHOLDER_CLASS + "{flex:1 1 0;min-width:" + PANEL_MIN_WIDTH + "px;align-self:stretch;box-sizing:border-box;border:2px dashed var(--builder-color-accent,#3b82f6);background:rgba(59,130,246,.10);border-radius:2px;pointer-events:none;}",
        // Ghost that follows the cursor.
        "." + GHOST_CLASS + "{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;white-space:nowrap;padding:4px 10px;border-radius:3px;font:600 12px/1 system-ui,sans-serif;background:var(--bricks-bg-dark,#18191d);color:var(--bricks-color-light,#e6e9ee);border:1px solid var(--builder-color-accent,#3b82f6);box-shadow:0 6px 18px rgba(0,0,0,.45);opacity:.92;}",
        // Close (✕) button — pushed to the top-right of the header.
        "." + PANEL_CLOSE_CLASS + "{margin-left:auto;flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;font:600 12px/1 system-ui,sans-serif;opacity:.7;}",
        "." + PANEL_CLOSE_CLASS + ":hover{opacity:1;}",
        "." + PANEL_BODY_CLASS + "{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 8px;}",
        "." + PANEL_BODY_CLASS + "--flush{padding:0;}",
        // Narrow scrollbars matching the Bricks builder UI (accent thumb on bg-3
        // track) — applied to the panel AND every descendant, so nested scroll
        // areas (grids, editors) get the same slim scrollbar.
        "." + PANEL_CLASS + ",." + PANEL_CLASS + " *{scrollbar-width:thin;scrollbar-color:var(--builder-color-accent,#3b82f6) var(--builder-bg-3,#2a2a2a);}",
        "." + PANEL_CLASS + " ::-webkit-scrollbar,." + PANEL_CLASS + "::-webkit-scrollbar{width:6px;height:6px;}",
        "." + PANEL_CLASS + " ::-webkit-scrollbar-track,." + PANEL_CLASS + "::-webkit-scrollbar-track{background-color:var(--builder-bg-3,#2a2a2a);}",
        "." + PANEL_CLASS + " ::-webkit-scrollbar-thumb,." + PANEL_CLASS + "::-webkit-scrollbar-thumb{background-color:var(--builder-color-accent,#3b82f6);border-radius:3px;}"
      ].join("");
      (document.head || document.documentElement).appendChild(style);
    }
    function loadLayout() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return {
          panels: (parsed == null ? void 0 : parsed.panels) && typeof parsed.panels === "object" ? parsed.panels : {},
          docks: (parsed == null ? void 0 : parsed.docks) && typeof parsed.docks === "object" ? parsed.docks : {}
        };
      } catch (e) {
        return { panels: {}, docks: {} };
      }
    }
    function persistPanel(id, patch) {
      try {
        const m = loadLayout();
        m.panels[id] = __spreadValues(__spreadValues({}, m.panels[id] || { position: "bottom" }), patch);
        localStorage.setItem(LS_KEY, JSON.stringify(m));
      } catch (e) {
      }
    }
    function saveDockLayout(dock) {
      rowPanels(dock).forEach((el, i) => {
        const id = el.dataset.brxId;
        if (!id) return;
        const w = el.dataset.brxWidth ? parseFloat(el.dataset.brxWidth) : void 0;
        persistPanel(id, { position: dock.position, order: i, width: w });
      });
    }
    function persistDock(position, patch) {
      try {
        const m = loadLayout();
        m.docks[position] = __spreadValues(__spreadValues({}, m.docks[position] || {}), patch);
        localStorage.setItem(LS_KEY, JSON.stringify(m));
      } catch (e) {
      }
    }
    function chevronChar(position, collapsed) {
      if (position === "left") return collapsed ? "\u25B8" : "\u25C2";
      if (position === "right") return collapsed ? "\u25C2" : "\u25B8";
      if (position === "bottom") return collapsed ? "\u25B4" : "\u25BE";
      return collapsed ? "\u25BE" : "\u25B4";
    }
    function updateChevron(state) {
      if (state.chevron) state.chevron.textContent = chevronChar(state.position, state.collapsed);
    }
    function dockForEl(el) {
      let found;
      docks.forEach((d) => {
        if (d.el.contains(el)) found = d;
      });
      return found;
    }
    function panelsIn(rowEl) {
      return Array.prototype.filter.call(rowEl.children, (c) => c.hasAttribute("data-brx-panel"));
    }
    function rowPanels(dock) {
      return Array.prototype.slice.call(dock.rowsEl.querySelectorAll("[data-brx-panel]"));
    }
    function visibleRowPanels(dock) {
      return rowPanels(dock).filter((p) => p.style.display !== "none");
    }
    function orderedVisiblePanels(dock) {
      const persisted = loadLayout().panels;
      return visibleRowPanels(dock).sort((a, b) => {
        var _a, _b, _c, _d;
        const oa = (_b = (_a = persisted[a.dataset.brxId || ""]) == null ? void 0 : _a.order) != null ? _b : Number.MAX_SAFE_INTEGER;
        const ob = (_d = (_c = persisted[b.dataset.brxId || ""]) == null ? void 0 : _c.order) != null ? _d : Number.MAX_SAFE_INTEGER;
        return oa - ob;
      });
    }
    function applyRowHeights(dock) {
      if (SIDE(dock.position)) {
        dock.rowsEl.style.width = visibleRowPanels(dock).length ? dock.height + "px" : "0px";
        return;
      }
      Array.prototype.slice.call(dock.rowsEl.querySelectorAll("." + ROW_CLASS)).forEach((r) => {
        r.style.height = dock.height + "px";
      });
    }
    function layoutDockSlots(dock, slots, equal = false) {
      const hidden = rowPanels(dock).filter((p) => p.style.display === "none");
      dock.rowsEl.textContent = "";
      if (SIDE(dock.position)) {
        const hasPanels = slots.some((s) => s.hasAttribute("data-brx-panel"));
        dock.rowsEl.style.width = hasPanels ? dock.height + "px" : "0px";
        slots.forEach((slot, i) => {
          if (slot.hasAttribute("data-brx-panel")) {
            slot.style.flex = (equal ? "1" : slot.dataset.brxWidth || "1") + " 1 0";
          }
          if (i > 0) dock.rowsEl.appendChild(createDivider(true));
          dock.rowsEl.appendChild(slot);
        });
        hidden.forEach((p) => dock.rowsEl.appendChild(p));
        return;
      }
      for (let i = 0; i < slots.length; i += MAX_PER_ROW) {
        const rowEl = document.createElement("div");
        rowEl.className = ROW_CLASS;
        rowEl.style.height = dock.height + "px";
        const group = slots.slice(i, i + MAX_PER_ROW);
        group.forEach((slot) => {
          if (slot.hasAttribute("data-brx-panel")) {
            slot.style.flex = (equal ? "1" : slot.dataset.brxWidth || "1") + " 1 0";
          }
          rowEl.appendChild(slot);
        });
        for (let j = 0; j < group.length - 1; j++) {
          rowEl.insertBefore(createDivider(), group[j + 1]);
        }
        dock.rowsEl.appendChild(rowEl);
      }
      hidden.forEach((p) => dock.rowsEl.appendChild(p));
    }
    function repackRows(dock) {
      layoutDockSlots(dock, orderedVisiblePanels(dock));
    }
    function createDivider(vertical = false) {
      const divider = document.createElement("div");
      divider.className = DIVIDER_CLASS + (vertical ? " " + DIVIDER_CLASS + "--h" : "");
      const MIN = vertical ? PANEL_MIN_HEIGHT : PANEL_MIN_WIDTH;
      const sizeOf = (el) => vertical ? el.offsetHeight : el.offsetWidth;
      const coordOf = (e) => vertical ? e.clientY : e.clientX;
      let start = 0;
      let prev = null;
      let next = null;
      let startPrev = 0;
      let startNext = 0;
      const onMove = (e) => {
        if (!prev || !next) return;
        const delta = coordOf(e) - start;
        let a = startPrev + delta;
        let b = startNext - delta;
        if (a < MIN) {
          b -= MIN - a;
          a = MIN;
        }
        if (b < MIN) {
          a -= MIN - b;
          b = MIN;
        }
        prev.style.flex = a + " 1 0";
        next.style.flex = b + " 1 0";
      };
      const onUp = (e) => {
        var _a;
        (_a = divider.releasePointerCapture) == null ? void 0 : _a.call(divider, e.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const container = divider.parentElement;
        const dock = container ? dockForEl(container) : void 0;
        if (container) panelsIn(container).forEach((p) => {
          p.dataset.brxWidth = String(sizeOf(p));
        });
        if (dock) saveDockLayout(dock);
        emitChange();
      };
      divider.addEventListener("pointerdown", (e) => {
        var _a;
        if (e.button !== 0) return;
        prev = divider.previousElementSibling;
        next = divider.nextElementSibling;
        const container = divider.parentElement;
        if (!prev || !next || !container) return;
        e.preventDefault();
        const panels = panelsIn(container);
        const sizes = panels.map(sizeOf);
        panels.forEach((p, i) => {
          p.style.flex = sizes[i] + " 1 0";
        });
        startPrev = sizes[panels.indexOf(prev)];
        startNext = sizes[panels.indexOf(next)];
        start = coordOf(e);
        (_a = divider.setPointerCapture) == null ? void 0 : _a.call(divider, e.pointerId);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
      return divider;
    }
    function resolveDropTarget(x, y, dragged) {
      var _a, _b, _c, _d;
      const permitted = permittedPositions((_a = entryForEl(dragged)) == null ? void 0 : _a.allowed);
      const fallback = dragged.getAttribute("data-brx-panel") || permitted[0] || "bottom";
      if (!permitted.length) return { position: fallback, index: 0 };
      const overDock = (p) => {
        const d = docks.get(p);
        if (!d) return false;
        const r = d.el.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      };
      let position = (_b = permitted.find(overDock)) != null ? _b : null;
      if (!position) {
        const wr = (_c = getWrapper()) == null ? void 0 : _c.getBoundingClientRect();
        if (wr) {
          const dist = {
            top: Math.abs(y - wr.top),
            bottom: Math.abs(y - wr.bottom),
            left: Math.abs(x - wr.left),
            right: Math.abs(x - wr.right)
          };
          position = (_d = permitted.slice().sort((a, b) => dist[a] - dist[b])[0]) != null ? _d : null;
        }
      }
      if (!position) return { position: fallback, index: 0 };
      const target = docks.get(position);
      if (!target) return { position, index: 0 };
      if (SIDE(position)) {
        const panels = panelsIn(target.rowsEl).filter((p) => p !== dragged);
        let idx = panels.length;
        for (let i = 0; i < panels.length; i++) {
          const pr = panels[i].getBoundingClientRect();
          if (y < pr.top + pr.height / 2) {
            idx = i;
            break;
          }
        }
        return { position, index: idx };
      }
      const rows = Array.prototype.slice.call(target.rowsEl.querySelectorAll("." + ROW_CLASS));
      let flatBefore = 0;
      for (let r = 0; r < rows.length; r++) {
        const panels = panelsIn(rows[r]).filter((p) => p !== dragged);
        const rect = rows[r].getBoundingClientRect();
        const inThisRow = y < rect.bottom || r === rows.length - 1;
        if (inThisRow) {
          let pos = panels.length;
          for (let i = 0; i < panels.length; i++) {
            const pr = panels[i].getBoundingClientRect();
            if (x < pr.left + pr.width / 2) {
              pos = i;
              break;
            }
          }
          return { position, index: flatBefore + pos };
        }
        flatBefore += panels.length;
      }
      return { position, index: flatBefore };
    }
    function movePanelTo(panel, position, index) {
      const fromPos = panel.getAttribute("data-brx-panel");
      const fromDock = fromPos ? docks.get(fromPos) : void 0;
      const toDock = docks.get(position) || ensureDock(position, {});
      const others = orderedVisiblePanels(toDock).filter((p) => p !== panel);
      toDock.rowsEl.appendChild(panel);
      panel.setAttribute("data-brx-panel", position);
      const id = panel.dataset.brxId;
      if (id) {
        const entry = registry.get(id);
        if (entry) entry.position = position;
      }
      const sameDock = !!fromDock && fromDock === toDock;
      const flat = others.slice();
      flat.splice(Math.max(0, Math.min(index, flat.length)), 0, panel);
      if (!sameDock) {
        flat.forEach((p) => {
          delete p.dataset.brxWidth;
        });
      }
      flat.forEach((p, i) => {
        if (p.dataset.brxId) persistPanel(p.dataset.brxId, { position, order: i });
      });
      layoutDockSlots(toDock, flat);
      saveDockLayout(toDock);
      if (fromDock && !sameDock) {
        rowPanels(fromDock).forEach((p) => {
          delete p.dataset.brxWidth;
        });
        repackRows(fromDock);
        saveDockLayout(fromDock);
        if (fromPos) cleanupDock(fromPos);
      }
      emitChange();
    }
    function reflowDragPreview(placeholder, dragged, target) {
      if (placeholder.parentElement) placeholder.remove();
      const origin = dragged.getAttribute("data-brx-panel");
      ALL_POSITIONS.forEach((pos) => {
        const d = docks.get(pos);
        if (!d) return;
        const slots = orderedVisiblePanels(d).filter((p) => p !== dragged);
        if (pos === target.position) {
          slots.splice(Math.max(0, Math.min(target.index, slots.length)), 0, placeholder);
        }
        const isGaining = pos === target.position && pos !== origin;
        const isLosing = pos === origin && pos !== target.position;
        layoutDockSlots(d, slots, isGaining || isLosing);
        d.el.style.display = "";
      });
    }
    function isInteractiveTarget(t) {
      var _a;
      const el = t;
      return !!((_a = el == null ? void 0 : el.closest) == null ? void 0 : _a.call(el, "button, a, input, select, textarea, label, [contenteditable], [data-brx-no-drag]"));
    }
    function wireHeaderDrag(header, panel) {
      header.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (isInteractiveTarget(e.target)) return;
        const startX = e.clientX;
        const startY = e.clientY;
        let started = false;
        let ghost = null;
        let placeholder = null;
        let target = resolveDropTarget(startX, startY, panel);
        const moveGhost = (ev) => {
          if (ghost) ghost.style.transform = "translate(" + (ev.clientX + 12) + "px," + (ev.clientY + 12) + "px)";
        };
        const begin = () => {
          var _a, _b;
          started = true;
          document.documentElement.classList.add(DRAG_ACTIVE_CLASS);
          try {
            (_a = window.getSelection()) == null ? void 0 : _a.removeAllRanges();
          } catch (e2) {
          }
          ghost = document.createElement("div");
          ghost.className = GHOST_CLASS;
          const titleEl = panel.querySelector("." + PANEL_TITLE_CLASS);
          const headEl = panel.querySelector("." + PANEL_HEADER_CLASS);
          ghost.textContent = ((titleEl == null ? void 0 : titleEl.textContent) || (headEl == null ? void 0 : headEl.textContent) || "Panel").trim().slice(0, 28) || "Panel";
          document.body.appendChild(ghost);
          panel.classList.add(DRAGGING_CLASS);
          placeholder = document.createElement("div");
          placeholder.className = PLACEHOLDER_CLASS;
          permittedPositions((_b = entryForEl(panel)) == null ? void 0 : _b.allowed).forEach((pos) => {
            const d = docks.get(pos) || ensureDock(pos, {});
            d.el.classList.add(DOCK_DRAG_CLASS);
            if (d.collapsed) d.el.removeAttribute("data-collapsed");
          });
        };
        const onMove = (ev) => {
          if (!started) {
            if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
            begin();
          }
          moveGhost(ev);
          target = resolveDropTarget(ev.clientX, ev.clientY, panel);
          reflowDragPreview(placeholder, panel, target);
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          document.documentElement.classList.remove(DRAG_ACTIVE_CLASS);
          if (!started) return;
          if (ghost == null ? void 0 : ghost.parentElement) ghost.remove();
          if (placeholder == null ? void 0 : placeholder.parentElement) placeholder.remove();
          docks.forEach((d) => {
            d.el.style.display = "";
            d.el.classList.remove(DOCK_DRAG_CLASS);
            if (d.collapsed) d.el.setAttribute("data-collapsed", "true");
          });
          panel.classList.remove(DRAGGING_CLASS);
          const dropDock = docks.get(target.position);
          if (dropDock == null ? void 0 : dropDock.collapsed) setDockCollapsed(dropDock, false);
          movePanelTo(panel, target.position, target.index);
          ALL_POSITIONS.forEach((pos) => cleanupDock(pos));
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
    }
    function createBar(state) {
      const DRAG_THRESHOLD = 3;
      const bar = document.createElement("div");
      bar.className = BAR_CLASS;
      bar.setAttribute("role", "button");
      bar.setAttribute("tabindex", "0");
      bar.setAttribute("aria-label", "Collapse / expand panel (drag to resize)");
      const chevron = document.createElement("span");
      chevron.className = CHEVRON_CLASS;
      bar.appendChild(chevron);
      state.chevron = chevron;
      updateChevron(state);
      let startCoord = 0;
      let startH = 0;
      let active = false;
      let moved = false;
      const side = SIDE(state.position);
      const coordOf = (e) => side ? e.clientX : e.clientY;
      const deltaFor = (c) => state.position === "bottom" || state.position === "right" ? startCoord - c : c - startCoord;
      const onMove = (e) => {
        if (!active || state.collapsed) return;
        const delta = deltaFor(coordOf(e));
        if (!moved && Math.abs(delta) < DRAG_THRESHOLD) return;
        moved = true;
        setDockHeight(state, startH + delta);
      };
      const onUp = (e) => {
        var _a;
        if (!active) return;
        active = false;
        (_a = bar.releasePointerCapture) == null ? void 0 : _a.call(bar, e.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (moved) {
          persistDock(state.position, { height: state.height });
          emitChange();
        } else {
          setDockCollapsed(state, !state.collapsed);
        }
      };
      bar.addEventListener("pointerdown", (e) => {
        var _a;
        if (e.button !== 0) return;
        e.preventDefault();
        active = true;
        moved = false;
        startCoord = coordOf(e);
        startH = state.height;
        (_a = bar.setPointerCapture) == null ? void 0 : _a.call(bar, e.pointerId);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
      bar.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setDockCollapsed(state, !state.collapsed);
        }
      });
      return bar;
    }
    function clampHeight(state, px) {
      const preview = getPreview();
      const extent = preview ? SIDE(state.position) ? preview.clientWidth : preview.clientHeight : 0;
      const ceiling = state.max === Infinity ? preview ? Math.round(extent * 0.85) : px : state.max;
      return Math.max(state.min, Math.min(px, ceiling));
    }
    function setDockHeight(state, px) {
      state.height = clampHeight(state, px);
      if (!state.collapsed) applyRowHeights(state);
    }
    function applyCollapsedDom(state) {
      if (state.collapsed) {
        state.el.setAttribute("data-collapsed", "true");
      } else {
        state.el.removeAttribute("data-collapsed");
        applyRowHeights(state);
      }
      updateChevron(state);
    }
    function entryForEl(el) {
      let found;
      registry.forEach((e) => {
        if (e.el === el) found = e;
      });
      return found;
    }
    function notifyDockCollapse(state, collapsed) {
      rowPanels(state).forEach((el) => {
        var _a, _b;
        try {
          (_b = (_a = entryForEl(el)) == null ? void 0 : _a.onCollapse) == null ? void 0 : _b.call(_a, collapsed);
        } catch (e) {
        }
      });
    }
    function setDockCollapsed(state, collapsed) {
      if (state.collapsed === collapsed) return;
      state.collapsed = collapsed;
      applyCollapsedDom(state);
      persistDock(state.position, { collapsed });
      notifyDockCollapse(state, collapsed);
      emitChange();
    }
    function setPanelHidden(dock, panel, hidden) {
      panel.style.display = hidden ? "none" : "";
      repackRows(dock);
      const anyVisible = visibleRowPanels(dock).length > 0;
      dock.el.style.display = anyVisible ? "" : "none";
      if (panel.dataset.brxId) persistPanel(panel.dataset.brxId, { hidden });
      emitChange();
    }
    function ensureDock(position, opts) {
      var _a, _b, _c;
      const existing = docks.get(position);
      if (existing) return existing;
      const preview = getPreview();
      const wrapper = getWrapper();
      const el = document.createElement("div");
      el.className = DOCK_CLASS;
      el.setAttribute("data-position", position);
      if (position === "top") preview.insertBefore(el, wrapper);
      else preview.insertBefore(el, wrapper.nextSibling);
      const rowsEl = document.createElement("div");
      rowsEl.className = ROWS_CLASS;
      const saved = loadLayout().docks[position] || {};
      const height = typeof saved.height === "number" ? saved.height : (_a = opts.defaultHeight) != null ? _a : DEFAULT_HEIGHT;
      const collapsed = typeof saved.collapsed === "boolean" ? saved.collapsed : !!opts.defaultCollapsed;
      const state = {
        el,
        bar: null,
        chevron: null,
        rowsEl,
        position,
        height,
        collapsed,
        min: (_b = opts.minHeight) != null ? _b : DEFAULT_MIN,
        max: (_c = opts.maxHeight) != null ? _c : Infinity,
        resizable: opts.resizable !== false
      };
      if (state.resizable) state.bar = createBar(state);
      if (position === "top" || position === "left") {
        el.appendChild(rowsEl);
        if (state.bar) el.appendChild(state.bar);
      } else {
        if (state.bar) el.appendChild(state.bar);
        el.appendChild(rowsEl);
      }
      applyCollapsedDom(state);
      docks.set(position, state);
      return state;
    }
    function cleanupDock(position) {
      const state = docks.get(position);
      if (!state) return;
      if (rowPanels(state).length > 0) return;
      if (registry.size > 0) return;
      docks.forEach((d) => d.el.remove());
      docks.clear();
    }
    function emitChange() {
      if (!listeners.size) return;
      const snapshot = list();
      listeners.forEach((cb) => {
        try {
          cb(snapshot);
        } catch (e) {
        }
      });
    }
    function emitAdd(id) {
      if (!addListeners.size) return;
      const info = list().find((p) => p.id === id);
      if (!info) return;
      addListeners.forEach((cb) => {
        try {
          cb(info);
        } catch (e) {
        }
      });
    }
    function emitRemove(id) {
      if (!removeListeners.size) return;
      removeListeners.forEach((cb) => {
        try {
          cb({ id });
        } catch (e) {
        }
      });
    }
    function register(el, opts) {
      var _a, _b;
      if (!el) return null;
      const o = opts || {};
      ensureStylesheet();
      if (!getWrapper() || !getPreview()) return null;
      const id = o.id || "brx-panel-" + ++seq;
      const persisted = o.id ? loadLayout().panels[id] : void 0;
      const allowed = o.allowedPositions;
      const want = (persisted == null ? void 0 : persisted.position) || o.position || "bottom";
      const position = resolvePosition(want, allowed);
      const dock = ensureDock(position, o);
      if (o.id) el.dataset.brxId = id;
      dock.rowsEl.appendChild(el);
      el.setAttribute("data-brx-panel", dock.position);
      if (persisted && persisted.width != null) {
        el.dataset.brxWidth = String(persisted.width);
      } else {
        rowPanels(dock).forEach((p) => {
          delete p.dataset.brxWidth;
          if (p.dataset.brxId) persistPanel(p.dataset.brxId, { width: void 0 });
        });
      }
      repackRows(dock);
      registry.set(id, {
        el,
        position: dock.position,
        allowed,
        onCollapse: o.onCollapseChange,
        title: o.title
      });
      if (o.id) {
        const layout = loadLayout().panels;
        let order = (_a = layout[id]) == null ? void 0 : _a.order;
        if (order == null) {
          let maxOrder = -1;
          rowPanels(dock).forEach((p) => {
            var _a2;
            const pid = p.dataset.brxId;
            if (!pid || pid === id) return;
            const po = (_a2 = layout[pid]) == null ? void 0 : _a2.order;
            if (typeof po === "number" && po > maxOrder) maxOrder = po;
          });
          order = maxOrder + 1;
        }
        const w = el.dataset.brxWidth ? parseFloat(el.dataset.brxWidth) : void 0;
        persistPanel(id, { position: dock.position, order, width: w });
      }
      if (o.id && (persisted == null ? void 0 : persisted.hidden)) {
        setPanelHidden(dock, el, true);
      }
      (_b = o.onCollapseChange) == null ? void 0 : _b.call(o, dock.collapsed);
      emitAdd(id);
      emitChange();
      const curDock = () => docks.get(el.getAttribute("data-brx-panel")) || dock;
      return {
        id,
        get position() {
          return el.getAttribute("data-brx-panel") || dock.position;
        },
        unregister: () => unregister(id),
        setHeight: (px) => {
          const d = curDock();
          setDockHeight(d, px);
          persistDock(d.position, { height: d.height });
        },
        setCollapsed: (c) => setDockCollapsed(curDock(), c),
        isCollapsed: () => curDock().collapsed,
        setHidden: (h) => setPanelHidden(curDock(), el, h),
        getHeight: () => curDock().el.offsetHeight
      };
    }
    function unregister(idOrEl) {
      let id = null;
      if (typeof idOrEl === "string") {
        id = idOrEl;
      } else {
        registry.forEach((entry2, key) => {
          if (entry2.el === idOrEl) id = key;
        });
      }
      if (id == null || !registry.has(id)) return;
      const entry = registry.get(id);
      entry.el.removeAttribute("data-brx-panel");
      const host = entry.el.parentElement;
      if (host && (host.classList.contains(ROW_CLASS) || host.classList.contains(ROWS_CLASS))) {
        host.removeChild(entry.el);
      }
      registry.delete(id);
      const dock = docks.get(entry.position);
      if (dock) {
        repackRows(dock);
        saveDockLayout(dock);
      }
      cleanupDock(entry.position);
      emitRemove(id);
      emitChange();
    }
    function resolveId(idOrEl) {
      if (typeof idOrEl === "string") return registry.has(idOrEl) ? idOrEl : null;
      let found = null;
      registry.forEach((entry, key) => {
        if (entry.el === idOrEl) found = key;
      });
      return found;
    }
    function panelTitle(entry, id) {
      var _a, _b;
      if (entry.title) return entry.title;
      const titleEl = entry.el.querySelector("." + PANEL_TITLE_CLASS);
      const fromTitle = (_a = titleEl == null ? void 0 : titleEl.textContent) == null ? void 0 : _a.trim();
      if (fromTitle) return fromTitle;
      const headEl = entry.el.querySelector("." + PANEL_HEADER_CLASS);
      const fromHead = (_b = headEl == null ? void 0 : headEl.textContent) == null ? void 0 : _b.trim();
      return fromHead || id;
    }
    function list() {
      const out = [];
      registry.forEach((entry, id) => {
        const dock = docks.get(entry.position);
        out.push({
          id,
          el: entry.el,
          position: entry.position,
          height: entry.el.offsetHeight,
          collapsed: !!(dock == null ? void 0 : dock.collapsed),
          hidden: entry.el.style.display === "none",
          title: panelTitle(entry, id)
        });
      });
      return out;
    }
    function setHidden(idOrEl, hidden) {
      const id = resolveId(idOrEl);
      if (id == null) return;
      const entry = registry.get(id);
      const dock = docks.get(entry.position);
      if (dock) setPanelHidden(dock, entry.el, hidden);
    }
    function isHidden(idOrEl) {
      const id = resolveId(idOrEl);
      if (id == null) return false;
      return registry.get(id).el.style.display === "none";
    }
    function on(event, cb) {
      if (typeof cb !== "function") return () => void 0;
      if (event === "add") {
        const c = cb;
        addListeners.add(c);
        return () => addListeners.delete(c);
      }
      if (event === "remove") {
        const c = cb;
        removeListeners.add(c);
        return () => removeListeners.delete(c);
      }
      if (event === "change") {
        const c = cb;
        listeners.add(c);
        return () => listeners.delete(c);
      }
      return () => void 0;
    }
    function recalc() {
      ensureStylesheet();
    }
    function setContent(host, content) {
      if (content == null) return;
      if (typeof content === "string") host.innerHTML = content;
      else host.appendChild(content);
    }
    function create(opts) {
      const o = opts || {};
      ensureStylesheet();
      const el = document.createElement("div");
      el.className = PANEL_CLASS + (o.className ? " " + o.className : "");
      const header = document.createElement("div");
      header.className = PANEL_HEADER_CLASS;
      const grip = document.createElement("div");
      grip.className = PANEL_GRIP_CLASS;
      grip.textContent = "\u283F";
      grip.setAttribute("aria-label", "Drag to move panel");
      header.appendChild(grip);
      if (o.header != null) {
        setContent(header, o.header);
      } else if (o.title) {
        const title = document.createElement("span");
        title.className = PANEL_TITLE_CLASS;
        title.textContent = o.title;
        header.appendChild(title);
      }
      let closeBtn = null;
      if (typeof o.onClose === "function") {
        closeBtn = document.createElement("button");
        closeBtn.className = PANEL_CLOSE_CLASS;
        closeBtn.type = "button";
        closeBtn.setAttribute("aria-label", "Close panel");
        closeBtn.textContent = "\u2715";
        header.appendChild(closeBtn);
      }
      const body = document.createElement("div");
      body.className = PANEL_BODY_CLASS + (o.flushBody ? " " + PANEL_BODY_CLASS + "--flush" : "");
      setContent(body, o.body);
      let footer = null;
      if (o.footer != null) {
        footer = document.createElement("div");
        footer.className = PANEL_FOOTER_CLASS;
        setContent(footer, o.footer);
      }
      el.appendChild(header);
      el.appendChild(body);
      if (footer) el.appendChild(footer);
      const handle = register(el, o);
      wireHeaderDrag(header, el);
      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          var _a;
          try {
            (_a = o.onClose) == null ? void 0 : _a.call(o);
          } finally {
            handle == null ? void 0 : handle.unregister();
            el.remove();
          }
        });
      }
      return { handle, el, header, body, footer };
    }
    function setEnabledPositions(positions) {
      const next = ALL_POSITIONS.filter((p) => positions.includes(p));
      enabledPositions = next.length ? next : ["bottom"];
      registry.forEach((entry) => {
        const dest = resolvePosition(entry.position, entry.allowed);
        if (dest !== entry.position) {
          const destDock = docks.get(dest) || ensureDock(dest, {});
          movePanelTo(entry.el, dest, orderedVisiblePanels(destDock).length);
        }
      });
      ALL_POSITIONS.forEach((p) => {
        if (enabledPositions.includes(p)) return;
        const d = docks.get(p);
        if (d && rowPanels(d).length === 0) {
          d.el.remove();
          docks.delete(p);
        }
      });
      emitChange();
    }
    const api = { register, create, unregister, setHidden, isHidden, setEnabledPositions, recalc, list, on, version: VERSION };
    window.BRX_Common = window.BRX_Common || {};
    window.BRX_Common.panels = api;
    const runReady = (cb) => {
      try {
        cb(api);
      } catch (e) {
        console.error("[brx-common] onReady callback failed", e);
      }
    };
    let ready = false;
    const pendingReady = [];
    const scheduleReady = (cb) => {
      if (ready) runReady(cb);
      else pendingReady.push(cb);
    };
    const fireReady = () => {
      if (ready) return;
      ready = true;
      pendingReady.splice(0).forEach(runReady);
      try {
        window.dispatchEvent(new CustomEvent(BRX_COMMON_READY_EVENT, { detail: { version: VERSION } }));
      } catch (e) {
      }
    };
    const bc = window.BRX_Common;
    const queued = Array.isArray(bc.onReady) ? bc.onReady.slice() : [];
    bc.onReady = { push: (cb) => scheduleReady(cb) };
    queued.forEach(scheduleReady);
    if (getWrapper()) {
      ensureStylesheet();
      fireReady();
    } else if (typeof MutationObserver !== "undefined") {
      const boot = new MutationObserver(() => {
        if (getWrapper()) {
          boot.disconnect();
          ensureStylesheet();
          fireReady();
        }
      });
      boot.observe(document.documentElement, { childList: true, subtree: true });
    } else {
      fireReady();
    }
  })();
})();
