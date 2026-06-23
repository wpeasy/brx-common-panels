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
  (function bootstrap() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (window.BRX_Common && window.BRX_Common.panels) return;
    const VERSION = "0.10.0";
    const PREVIEW_ID = "bricks-preview";
    const WRAPPER_ID = "bricks-builder-iframe-wrapper";
    const HOST_CLASS = "brx-common-host";
    const DOCK_CLASS = "brx-common-dock";
    const BAR_CLASS = "brx-common-dock__bar";
    const CHEVRON_CLASS = "brx-common-dock__chevron";
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
    const STYLE_ID = "brx-common-panels-style";
    const LS_KEY = "brx-common-panels";
    const DEFAULT_HEIGHT = 300;
    const DEFAULT_MIN = 80;
    const MAX_PANELS = 3;
    const PANEL_MIN_WIDTH = 80;
    const registry = /* @__PURE__ */ new Map();
    const docks = /* @__PURE__ */ new Map();
    const listeners = /* @__PURE__ */ new Set();
    let seq = 0;
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
        // Layout host (class is robust to a renamed #bricks-preview; id kept as fallback).
        "#" + PREVIEW_ID + ",." + HOST_CLASS + "{display:flex;flex-direction:column;}",
        "#" + WRAPPER_ID + "{flex:1 1 auto !important;height:auto !important;min-height:0 !important;}",
        // Dock container.
        "." + DOCK_CLASS + "{flex:0 0 auto;position:relative;display:flex;flex-direction:column;min-height:0;box-sizing:border-box;}",
        "." + DOCK_CLASS + '[data-collapsed="true"]{height:auto !important;}',
        "." + DOCK_CLASS + ":empty{display:none;}",
        // Panel row: flex row, no-wrap — up to 3 panels side by side, equal width.
        "." + ROW_CLASS + "{flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:row;flex-wrap:nowrap;}",
        "." + ROW_CLASS + ">[data-brx-panel]{flex:1 1 0;min-width:" + PANEL_MIN_WIDTH + "px;min-height:0;overflow:hidden;}",
        // Collapsed → hide the panel row, leaving just the chrome bar.
        "." + DOCK_CLASS + '[data-collapsed="true"]>.' + ROW_CLASS + "{display:none;}",
        // Vertical divider between adjacent panels — drag to resize horizontally.
        "." + DIVIDER_CLASS + "{flex:0 0 4px;align-self:stretch;cursor:ew-resize;background:var(--builder-border,#3a3a3a);touch-action:none;}",
        "." + DIVIDER_CLASS + ":hover{background:var(--builder-color-accent,#3b82f6);}",
        // Chrome bar on the iframe-facing edge: the WHOLE bar toggles collapse
        // (click) and resizes (drag); a centered light chevron indicates state.
        "." + BAR_CLASS + "{flex:0 0 auto;display:flex;align-items:center;justify-content:center;height:8px;background:var(--builder-color-accent,#3b82f6);cursor:ns-resize;touch-action:none;user-select:none;}",
        "." + DOCK_CLASS + '[data-collapsed="true"]>.' + BAR_CLASS + "{cursor:pointer;}",
        "." + CHEVRON_CLASS + "{pointer-events:none;color:#000;font:600 8px/1 system-ui,sans-serif;opacity:.85;}",
        "." + BAR_CLASS + ":hover ." + CHEVRON_CLASS + "{opacity:1;}",
        // ── Panel template (create()) — consistent header+body, Bricks builder colours, tight padding ──
        "." + PANEL_CLASS + "{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--builder-bg,#1e1e1e);color:var(--builder-color,#e0e0e0);font-family:inherit;font-size:12px;box-sizing:border-box;}",
        "." + PANEL_CLASS + " *{box-sizing:border-box;}",
        "." + PANEL_HEADER_CLASS + ",." + PANEL_FOOTER_CLASS + "{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:3px 8px;min-height:24px;background:var(--bricks-bg-dark,#18191d);color:var(--bricks-color-light,#e6e9ee);}",
        "." + PANEL_HEADER_CLASS + "{border-bottom:1px solid var(--builder-border,#2f3136);}",
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
        "." + PLACEHOLDER_CLASS + "{flex:1 1 0;min-width:" + PANEL_MIN_WIDTH + "px;align-self:stretch;box-sizing:border-box;border:2px dashed var(--builder-color-accent,#3b82f6);background:rgba(59,130,246,.10);border-radius:2px;pointer-events:none;}",
        // Ghost that follows the cursor.
        "." + GHOST_CLASS + "{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;white-space:nowrap;padding:4px 10px;border-radius:3px;font:600 12px/1 system-ui,sans-serif;background:var(--bricks-bg-dark,#18191d);color:var(--bricks-color-light,#e6e9ee);border:1px solid var(--builder-color-accent,#3b82f6);box-shadow:0 6px 18px rgba(0,0,0,.45);opacity:.92;}",
        // Close (✕) button — pushed to the top-right of the header.
        "." + PANEL_CLOSE_CLASS + "{margin-left:auto;flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;font:600 12px/1 system-ui,sans-serif;opacity:.7;}",
        "." + PANEL_CLOSE_CLASS + ":hover{opacity:1;}",
        "." + PANEL_BODY_CLASS + "{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 8px;}",
        "." + PANEL_BODY_CLASS + "--flush{padding:0;}"
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
      if (position === "bottom") return collapsed ? "\u25B4" : "\u25BE";
      return collapsed ? "\u25BE" : "\u25B4";
    }
    function updateChevron(state) {
      if (state.chevron) state.chevron.textContent = chevronChar(state.position, state.collapsed);
    }
    function rowPanels(dock) {
      return Array.prototype.filter.call(
        dock.row.children,
        (c) => c.hasAttribute("data-brx-panel")
      );
    }
    function visibleRowPanels(dock) {
      return rowPanels(dock).filter((p) => p.style.display !== "none");
    }
    function sortDockByOrder(dock) {
      const persisted = loadLayout().panels;
      const ordered = rowPanels(dock).sort((a, b) => {
        var _a, _b, _c, _d;
        const oa = (_b = (_a = persisted[a.dataset.brxId || ""]) == null ? void 0 : _a.order) != null ? _b : Number.MAX_SAFE_INTEGER;
        const ob = (_d = (_c = persisted[b.dataset.brxId || ""]) == null ? void 0 : _c.order) != null ? _d : Number.MAX_SAFE_INTEGER;
        return oa - ob;
      });
      ordered.forEach((p) => dock.row.appendChild(p));
    }
    function layoutRow(dock) {
      Array.prototype.slice.call(dock.row.querySelectorAll("." + DIVIDER_CLASS)).forEach((d) => d.remove());
      const panels = visibleRowPanels(dock);
      panels.forEach((p) => {
        p.style.flex = (p.dataset.brxWidth || "1") + " 1 0";
      });
      for (let i = 0; i < panels.length - 1; i++) {
        dock.row.insertBefore(createDivider(dock), panels[i + 1]);
      }
    }
    function createDivider(dock) {
      const divider = document.createElement("div");
      divider.className = DIVIDER_CLASS;
      let startX = 0;
      let prev = null;
      let next = null;
      let startPrev = 0;
      let startNext = 0;
      const onMove = (e) => {
        if (!prev || !next) return;
        const delta = e.clientX - startX;
        let a = startPrev + delta;
        let b = startNext - delta;
        if (a < PANEL_MIN_WIDTH) {
          b -= PANEL_MIN_WIDTH - a;
          a = PANEL_MIN_WIDTH;
        }
        if (b < PANEL_MIN_WIDTH) {
          a -= PANEL_MIN_WIDTH - b;
          b = PANEL_MIN_WIDTH;
        }
        prev.style.flex = a + " 1 0";
        next.style.flex = b + " 1 0";
      };
      const onUp = (e) => {
        var _a;
        (_a = divider.releasePointerCapture) == null ? void 0 : _a.call(divider, e.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        visibleRowPanels(dock).forEach((p) => {
          p.dataset.brxWidth = String(p.offsetWidth);
        });
        saveDockLayout(dock);
        emitChange();
      };
      divider.addEventListener("pointerdown", (e) => {
        var _a;
        if (e.button !== 0) return;
        prev = divider.previousElementSibling;
        next = divider.nextElementSibling;
        if (!prev || !next) return;
        e.preventDefault();
        const panels = rowPanels(dock);
        const widths = panels.map((p) => p.offsetWidth);
        panels.forEach((p, i) => {
          p.style.flex = widths[i] + " 1 0";
        });
        startPrev = widths[panels.indexOf(prev)];
        startNext = widths[panels.indexOf(next)];
        startX = e.clientX;
        (_a = divider.setPointerCapture) == null ? void 0 : _a.call(divider, e.pointerId);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
      return divider;
    }
    function resolveDropTarget(x, y, dragged) {
      const within = (d) => {
        if (!d) return false;
        const r = d.el.getBoundingClientRect();
        return y >= r.top && y <= r.bottom;
      };
      let position;
      if (within(docks.get("top"))) position = "top";
      else if (within(docks.get("bottom"))) position = "bottom";
      else {
        const wrapper = getWrapper();
        const wr = wrapper == null ? void 0 : wrapper.getBoundingClientRect();
        position = wr ? y < wr.top + wr.height / 2 ? "top" : "bottom" : "bottom";
      }
      const target = docks.get(position);
      const panels = target ? visibleRowPanels(target).filter((p) => p !== dragged) : [];
      let index = panels.length;
      for (let i = 0; i < panels.length; i++) {
        const r = panels[i].getBoundingClientRect();
        if (x < r.left + r.width / 2) {
          index = i;
          break;
        }
      }
      return { position, index };
    }
    function movePanelTo(panel, position, index) {
      const fromPos = panel.getAttribute("data-brx-panel");
      const fromDock = fromPos ? docks.get(fromPos) : void 0;
      let toDock = docks.get(position);
      if (!toDock) toDock = ensureDock(position, {});
      if (rowPanels(toDock).filter((p) => p !== panel).length >= MAX_PANELS) {
        console.warn('[BRX_Common] dock "' + position + '" is full (max ' + MAX_PANELS + ") \u2014 move ignored.");
        return;
      }
      const ref = visibleRowPanels(toDock).filter((p) => p !== panel)[index] || null;
      toDock.row.insertBefore(panel, ref);
      panel.setAttribute("data-brx-panel", position);
      const id = panel.dataset.brxId;
      if (id) {
        const entry = registry.get(id);
        if (entry) entry.position = position;
      }
      rowPanels(toDock).forEach((p) => {
        delete p.dataset.brxWidth;
      });
      layoutRow(toDock);
      saveDockLayout(toDock);
      if (fromDock && fromDock !== toDock) {
        layoutRow(fromDock);
        saveDockLayout(fromDock);
        if (fromPos) cleanupDock(fromPos);
      }
      emitChange();
    }
    function reflowDragPreview(placeholder, dragged, target) {
      if (placeholder.parentElement) placeholder.remove();
      const into = docks.get(target.position);
      if (into) {
        const panels = visibleRowPanels(into).filter((p) => p !== dragged);
        into.row.insertBefore(placeholder, panels[target.index] || null);
      }
      ["top", "bottom"].forEach((pos) => {
        const d = docks.get(pos);
        if (!d) return;
        Array.prototype.slice.call(d.row.querySelectorAll("." + DIVIDER_CLASS)).forEach((x) => x.remove());
        const slots = visibleRowPanels(d).filter((p) => p !== dragged);
        slots.forEach((p) => {
          p.style.flex = "1 1 0";
        });
        const hasSlot = slots.length > 0 || placeholder.parentElement === d.row;
        d.el.style.display = hasSlot ? "" : "none";
      });
    }
    function wireGripDrag(grip, panel) {
      grip.addEventListener("pointerdown", (e) => {
        var _a;
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        (_a = grip.setPointerCapture) == null ? void 0 : _a.call(grip, e.pointerId);
        const ghost = document.createElement("div");
        ghost.className = GHOST_CLASS;
        const titleEl = panel.querySelector("." + PANEL_TITLE_CLASS);
        const headEl = panel.querySelector("." + PANEL_HEADER_CLASS);
        ghost.textContent = ((titleEl == null ? void 0 : titleEl.textContent) || (headEl == null ? void 0 : headEl.textContent) || "Panel").trim().slice(0, 28) || "Panel";
        document.body.appendChild(ghost);
        const moveGhost = (ev) => {
          ghost.style.transform = "translate(" + (ev.clientX + 12) + "px," + (ev.clientY + 12) + "px)";
        };
        panel.classList.add(DRAGGING_CLASS);
        const placeholder = document.createElement("div");
        placeholder.className = PLACEHOLDER_CLASS;
        let target = resolveDropTarget(e.clientX, e.clientY, panel);
        moveGhost(e);
        reflowDragPreview(placeholder, panel, target);
        const onMove = (ev) => {
          moveGhost(ev);
          target = resolveDropTarget(ev.clientX, ev.clientY, panel);
          reflowDragPreview(placeholder, panel, target);
        };
        const onUp = (ev) => {
          var _a2;
          (_a2 = grip.releasePointerCapture) == null ? void 0 : _a2.call(grip, ev.pointerId);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          if (ghost.parentElement) ghost.remove();
          if (placeholder.parentElement) placeholder.remove();
          docks.forEach((d) => {
            d.el.style.display = "";
          });
          panel.classList.remove(DRAGGING_CLASS);
          movePanelTo(panel, target.position, target.index);
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
      let startY = 0;
      let startH = 0;
      let active = false;
      let moved = false;
      const onMove = (e) => {
        if (!active || state.collapsed) return;
        const delta = state.position === "bottom" ? startY - e.clientY : e.clientY - startY;
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
        startY = e.clientY;
        startH = state.el.offsetHeight;
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
      const ceiling = state.max === Infinity ? preview ? Math.round(preview.clientHeight * 0.85) : px : state.max;
      return Math.max(state.min, Math.min(px, ceiling));
    }
    function setDockHeight(state, px) {
      state.height = clampHeight(state, px);
      if (!state.collapsed) state.el.style.height = state.height + "px";
    }
    function applyCollapsedDom(state) {
      if (state.collapsed) {
        state.el.setAttribute("data-collapsed", "true");
        state.el.style.height = "";
      } else {
        state.el.removeAttribute("data-collapsed");
        state.el.style.height = state.height + "px";
      }
      updateChevron(state);
    }
    function setDockCollapsed(state, collapsed) {
      var _a;
      if (state.collapsed === collapsed) return;
      state.collapsed = collapsed;
      applyCollapsedDom(state);
      persistDock(state.position, { collapsed });
      (_a = state.onCollapse) == null ? void 0 : _a.call(state, collapsed);
      emitChange();
    }
    function setPanelHidden(dock, panel, hidden) {
      panel.style.display = hidden ? "none" : "";
      if (hidden && panel.parentElement === dock.row) dock.row.appendChild(panel);
      layoutRow(dock);
      const anyVisible = visibleRowPanels(dock).length > 0;
      dock.el.style.display = anyVisible ? "" : "none";
      emitChange();
    }
    function ensureDock(position, opts) {
      var _a, _b, _c;
      const existing = docks.get(position);
      if (existing) {
        if (opts.onCollapseChange) existing.onCollapse = opts.onCollapseChange;
        return existing;
      }
      const preview = getPreview();
      const wrapper = getWrapper();
      const el = document.createElement("div");
      el.className = DOCK_CLASS;
      el.setAttribute("data-position", position);
      if (position === "top") preview.insertBefore(el, wrapper);
      else preview.insertBefore(el, wrapper.nextSibling);
      const row = document.createElement("div");
      row.className = ROW_CLASS;
      const saved = loadLayout().docks[position] || {};
      const height = typeof saved.height === "number" ? saved.height : (_a = opts.defaultHeight) != null ? _a : DEFAULT_HEIGHT;
      const collapsed = typeof saved.collapsed === "boolean" ? saved.collapsed : !!opts.defaultCollapsed;
      const state = {
        el,
        bar: null,
        chevron: null,
        row,
        position,
        height,
        collapsed,
        min: (_b = opts.minHeight) != null ? _b : DEFAULT_MIN,
        max: (_c = opts.maxHeight) != null ? _c : Infinity,
        resizable: opts.resizable !== false,
        onCollapse: opts.onCollapseChange
      };
      el.style.height = height + "px";
      if (state.resizable) state.bar = createBar(state);
      if (position === "top") {
        el.appendChild(row);
        if (state.bar) el.appendChild(state.bar);
      } else {
        if (state.bar) el.appendChild(state.bar);
        el.appendChild(row);
      }
      applyCollapsedDom(state);
      docks.set(position, state);
      return state;
    }
    function cleanupDock(position) {
      const state = docks.get(position);
      if (!state) return;
      if (rowPanels(state).length > 0) return;
      state.el.remove();
      docks.delete(position);
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
    function register(el, opts) {
      var _a;
      if (!el) return null;
      const o = opts || {};
      ensureStylesheet();
      if (!getWrapper() || !getPreview()) return null;
      const id = o.id || "brx-panel-" + ++seq;
      const persisted = o.id ? loadLayout().panels[id] : void 0;
      const position = (persisted == null ? void 0 : persisted.position) || (o.position === "top" ? "top" : "bottom");
      const dock = ensureDock(position, o);
      if (rowPanels(dock).length >= MAX_PANELS) {
        console.warn('[BRX_Common] dock "' + dock.position + '" is full (max ' + MAX_PANELS + " panels) \u2014 register ignored.");
        cleanupDock(dock.position);
        return null;
      }
      if (o.id) el.dataset.brxId = id;
      dock.row.appendChild(el);
      el.setAttribute("data-brx-panel", dock.position);
      if (persisted && persisted.width != null) {
        el.dataset.brxWidth = String(persisted.width);
      } else {
        rowPanels(dock).forEach((p) => {
          delete p.dataset.brxWidth;
        });
      }
      sortDockByOrder(dock);
      layoutRow(dock);
      registry.set(id, { el, position: dock.position });
      if (o.id) saveDockLayout(dock);
      (_a = dock.onCollapse) == null ? void 0 : _a.call(dock, dock.collapsed);
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
      if (host && host.classList.contains(ROW_CLASS)) host.removeChild(entry.el);
      registry.delete(id);
      const dock = docks.get(entry.position);
      if (dock) {
        layoutRow(dock);
        saveDockLayout(dock);
      }
      cleanupDock(entry.position);
      emitChange();
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
          collapsed: !!(dock == null ? void 0 : dock.collapsed)
        });
      });
      return out;
    }
    function on(event, cb) {
      if (event !== "change" || typeof cb !== "function") return () => void 0;
      listeners.add(cb);
      return () => listeners.delete(cb);
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
      wireGripDrag(grip, el);
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
    const api = { register, create, unregister, recalc, list, on, version: VERSION };
    window.BRX_Common = window.BRX_Common || {};
    window.BRX_Common.panels = api;
    if (getWrapper()) {
      ensureStylesheet();
    } else if (typeof MutationObserver !== "undefined") {
      const boot = new MutationObserver(() => {
        if (getWrapper()) {
          boot.disconnect();
          ensureStylesheet();
        }
      });
      boot.observe(document.documentElement, { childList: true, subtree: true });
    }
  })();
})();
