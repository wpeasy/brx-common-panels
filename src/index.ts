/**
 * BRX_Common — Bricks Builder shared iframe-panel dock registry
 * ----------------------------------------------------------------------------
 * Lets any Bricks add-on dock a UI panel ABOVE or BELOW the preview iframe in a
 * single, collision-free way. A plugin registers its panel element; this module
 * places it in a shared dock container (a sibling of #bricks-builder-iframe-wrapper)
 * and owns the layout so the canvas always fills the remaining space.
 *
 *     const handle = window.BRX_Common.panels.register(myEl, { position: 'bottom' });
 *     // ... later ...
 *     handle.unregister();
 *
 * Layout mechanism (no JS height math):
 *   #bricks-preview is made a flex column and #bricks-builder-iframe-wrapper is
 *   forced to `flex:1; height:auto` via an injected `!important` stylesheet. Per
 *   the CSS cascade, an `!important` author rule beats Bricks' non-important
 *   INLINE height, so Bricks can keep writing its inline height and the iframe
 *   still fills the space — no per-write observer arms-race. Dock containers take
 *   their own (drag-resizable) height; the iframe fills whatever remains.
 *
 * Ownership model — the DOCK is the chrome:
 *   - Each container has a slim CHROME BAR on the edge facing the iframe with a
 *     resize grip (drag to resize) and a collapse chevron (click to collapse to
 *     just the bar / expand). Panels simply FILL their container — they carry no
 *     resize or collapse UI of their own.
 *   - ONE authoritative owner of the iframe wrapper layout (no inline-style wars).
 *   - Layout (position, height, collapsed) persists in localStorage, keyed by the
 *     dock, and is restored on register().
 *   - Idempotent bootstrap: if a registry already exists this no-ops, so plugins
 *     can bundle this today and stand down the moment Bricks ships it natively.
 *
 * Builder-editor only. No front-end footprint. Zero dependencies.
 */

export type DockPosition = 'top' | 'bottom';

export interface RegisterOptions {
    /** Which dock to place the panel in. Default 'bottom'. A persisted position for this id wins. */
    position?: DockPosition;
    /** Stable id used for layout persistence. Auto-generated if omitted (then not persisted). */
    id?: string;
    /** Initial container height in px when nothing is persisted yet. Default 300. */
    defaultHeight?: number;
    /** Resize clamp minimum in px. Default 80. */
    minHeight?: number;
    /** Resize clamp maximum in px. Default: 85% of the preview height at drag time. */
    maxHeight?: number;
    /** Whether the dock shows its resize/collapse chrome bar. Default true. */
    resizable?: boolean;
    /** Initial collapsed state when nothing is persisted yet. Default false. */
    defaultCollapsed?: boolean;
    /** Called whenever the dock's collapsed state changes (incl. the restored state on register). */
    onCollapseChange?: (collapsed: boolean) => void;
}

export interface PanelHandle {
    readonly id: string;
    readonly position: DockPosition;
    /** Remove the panel from the dock (leaves the element in the DOM for the caller to dispose). */
    unregister(): void;
    /** Set the container height in px (clamped). */
    setHeight(px: number): void;
    /** Collapse the dock to just its chrome bar (panel hidden) / expand it. */
    setCollapsed(collapsed: boolean): void;
    /** Whether the dock is currently collapsed. */
    isCollapsed(): boolean;
    /**
     * Hide the container (the iframe reclaims the space) WITHOUT unregistering —
     * the panel element stays in the DOM so the caller's references survive. Use
     * for temporary hide / detach; use unregister() for permanent removal.
     */
    setHidden(hidden: boolean): void;
    /** Current container height in px. */
    getHeight(): number;
}

export interface PanelInfo {
    id: string;
    el: HTMLElement;
    position: DockPosition;
    height: number;
    collapsed: boolean;
}

/** Options for the templated panel factory (create()). Extends register opts. */
export interface PanelTemplateOptions extends RegisterOptions {
    /** Convenience: a plain title shown in the header (used when `header` is omitted). */
    title?: string;
    /** Header content — HTML string or a DOM node. Overrides `title`. */
    header?: string | Node;
    /** Body content — HTML string or a DOM node. */
    body?: string | Node;
    /**
     * Optional footer content — HTML string or a DOM node. When provided, a footer
     * (styled like the header, with a top border) is added below the body. Pass an
     * empty string for an empty footer you populate later via the returned element.
     */
    footer?: string | Node;
    /** Extra class(es) added to the panel root. */
    className?: string;
    /** Remove the body's default padding so content (e.g. an editor) fills edge-to-edge. */
    flushBody?: boolean;
    /**
     * When provided, a ✕ button is added to the top-right of the header. Clicking
     * it runs this callback (for the consumer's cleanup) and then unregisters +
     * removes the panel. Omit for a panel with no close affordance.
     */
    onClose?: () => void;
}

/** What create() returns: the registration handle plus the templated parts to populate. */
export interface TemplatedPanel {
    handle: PanelHandle | null;
    /** The panel root (the registered element). */
    el: HTMLElement;
    /** The header container — append buttons/labels here. */
    header: HTMLElement;
    /** The (scrollable) body container — append your panel content here. */
    body: HTMLElement;
    /** The footer container, or null when no `footer` option was given. */
    footer: HTMLElement | null;
}

type ChangeListener = (info: PanelInfo[]) => void;

export interface BrxCommonPanels {
    register(el: HTMLElement, opts?: RegisterOptions): PanelHandle | null;
    /**
     * Build a consistent header+body panel (Bricks builder colours, tight
     * padding) and register it. Returns the handle plus the header/body
     * containers to populate. Keeps every plugin's panel visually uniform.
     */
    create(opts?: PanelTemplateOptions): TemplatedPanel;
    unregister(idOrEl: string | HTMLElement): void;
    /** Re-assert the layout stylesheet (rarely needed — flex handles reflow). */
    recalc(): void;
    list(): PanelInfo[];
    /** Subscribe to layout changes (register/unregister/move/resize/collapse). Returns an unsubscribe fn. */
    on(event: 'change', cb: ChangeListener): () => void;
    /** Engine version, for feature detection. */
    readonly version: string;
}

declare global {
    interface Window {
        BRX_Common?: { panels?: BrxCommonPanels } & Record<string, unknown>;
    }
}

(function bootstrap(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // ── Idempotent guard ────────────────────────────────────────────────────
    // First registry to load wins; an official Bricks-provided one always wins
    // if present. Plugins bundling this copy cooperate until Bricks ships it.
    if (window.BRX_Common && window.BRX_Common.panels) return;

    const VERSION = '0.13.0';
    const PREVIEW_ID = 'bricks-preview';
    const WRAPPER_ID = 'bricks-builder-iframe-wrapper';
    const HOST_CLASS = 'brx-common-host';
    const DOCK_CLASS = 'brx-common-dock';
    const BAR_CLASS = 'brx-common-dock__bar';
    const CHEVRON_CLASS = 'brx-common-dock__chevron';
    const ROWS_CLASS = 'brx-common-dock__rows';
    const ROW_CLASS = 'brx-common-dock__row';
    const DIVIDER_CLASS = 'brx-common-dock__divider';
    const PANEL_CLASS = 'brx-common-panel';
    const PANEL_HEADER_CLASS = 'brx-common-panel__header';
    const PANEL_TITLE_CLASS = 'brx-common-panel__title';
    const PANEL_GRIP_CLASS = 'brx-common-panel__grip';
    const PANEL_CLOSE_CLASS = 'brx-common-panel__close';
    const PANEL_BODY_CLASS = 'brx-common-panel__body';
    const PANEL_FOOTER_CLASS = 'brx-common-panel__footer';
    const GHOST_CLASS = 'brx-common-panel__ghost';
    const PLACEHOLDER_CLASS = 'brx-common-dock__placeholder';
    const DRAGGING_CLASS = 'brx-common-panel--dragging';
    const DOCK_DRAG_CLASS = 'brx-common-dock--drag';
    const STYLE_ID = 'brx-common-panels-style';
    const LS_KEY = 'brx-common-panels';
    const DEFAULT_HEIGHT = 300;
    const DEFAULT_MIN = 80;
    const MAX_PER_ROW = 3;      // panels per row before wrapping to a new row
    const PANEL_MIN_WIDTH = 80; // px — horizontal-resize clamp

    interface DockState {
        el: HTMLElement;
        bar: HTMLElement | null;
        chevron: HTMLElement | null;
        rowsEl: HTMLElement;    // vertical stack of rows (each row holds up to MAX_PER_ROW panels)
        position: DockPosition;
        height: number;
        collapsed: boolean;
        min: number;
        max: number;
        resizable: boolean;
    }
    interface PanelEntry {
        el: HTMLElement;
        position: DockPosition;
        // Per-PANEL collapse callback: every panel in a dock is notified when the
        // dock collapses/expands, and the callback travels with the panel across
        // a DnD move (it lives on the entry, not the dock).
        onCollapse?: (collapsed: boolean) => void;
    }

    const registry = new Map<string, PanelEntry>();
    const docks = new Map<DockPosition, DockState>();
    const listeners = new Set<ChangeListener>();
    let seq = 0;

    // ── DOM helpers ─────────────────────────────────────────────────────────
    function getWrapper(): HTMLElement | null {
        return document.getElementById(WRAPPER_ID);
    }
    function getPreview(): HTMLElement | null {
        const w = getWrapper();
        return (w?.parentElement as HTMLElement | null) || document.getElementById(PREVIEW_ID);
    }

    /** Tag the iframe wrapper's actual parent as the flex host (id-independent). */
    function ensureHost(): void {
        const preview = getPreview();
        if (preview) preview.classList.add(HOST_CLASS);
    }

    /**
     * Inject the single stylesheet: make the host a flex column, force the iframe
     * wrapper to fill via `!important` (beats Bricks' non-important inline height),
     * and style the dock containers + their chrome bar.
     */
    function ensureStylesheet(): void {
        ensureHost();
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            // Layout host (class is robust to a renamed #bricks-preview; id kept as fallback).
            '#' + PREVIEW_ID + ',.' + HOST_CLASS + '{display:flex;flex-direction:column;}',
            '#' + WRAPPER_ID + '{flex:1 1 auto !important;height:auto !important;min-height:0 !important;}',
            // Dock container.
            '.' + DOCK_CLASS + '{flex:0 0 auto;position:relative;display:flex;flex-direction:column;min-height:0;box-sizing:border-box;}',
            '.' + DOCK_CLASS + '[data-collapsed="true"]{height:auto !important;}',
            '.' + DOCK_CLASS + ':empty{display:none;}',
            // Rows container: vertical stack — each row holds up to MAX_PER_ROW
            // panels side by side; a 4th panel wraps to a new row beneath. The dock
            // height is content-driven (it grows taller as rows are added).
            '.' + ROWS_CLASS + '{flex:0 0 auto;min-width:0;display:flex;flex-direction:column;}',
            '.' + ROW_CLASS + '{flex:0 0 auto;min-height:0;min-width:0;display:flex;flex-direction:row;flex-wrap:nowrap;}',
            '.' + ROW_CLASS + '+.' + ROW_CLASS + '{border-top:1px solid var(--builder-border,#3a3a3a);}',
            '.' + ROW_CLASS + '>[data-brx-panel]{flex:1 1 0;min-width:' + PANEL_MIN_WIDTH + 'px;min-height:0;overflow:hidden;}',
            // Collapsed → hide the rows, leaving just the chrome bar.
            '.' + DOCK_CLASS + '[data-collapsed="true"]>.' + ROWS_CLASS + '{display:none;}',
            // While dragging, every dock shows a drop area; an empty dock's rows get
            // a dashed drop-zone hint so a panel can be dropped into it.
            '.' + DOCK_CLASS + '.' + DOCK_DRAG_CLASS + ' .' + ROWS_CLASS + '{min-height:46px;}',
            '.' + DOCK_CLASS + '.' + DOCK_DRAG_CLASS + ' .' + ROWS_CLASS + ':empty{margin:4px;border:2px dashed var(--builder-color-accent,#3b82f6);background:rgba(59,130,246,.07);border-radius:3px;}',
            // Vertical divider between adjacent panels — drag to resize horizontally.
            '.' + DIVIDER_CLASS + '{flex:0 0 4px;align-self:stretch;cursor:ew-resize;background:var(--builder-border,#3a3a3a);touch-action:none;}',
            '.' + DIVIDER_CLASS + ':hover{background:var(--builder-color-accent,#3b82f6);}',
            // Chrome bar on the iframe-facing edge: the WHOLE bar toggles collapse
            // (click) and resizes (drag); a centered light chevron indicates state.
            '.' + BAR_CLASS + '{flex:0 0 auto;display:flex;align-items:center;justify-content:center;height:8px;background:var(--builder-color-accent,#3b82f6);cursor:ns-resize;touch-action:none;user-select:none;}',
            '.' + DOCK_CLASS + '[data-collapsed="true"]>.' + BAR_CLASS + '{cursor:pointer;}',
            '.' + CHEVRON_CLASS + '{pointer-events:none;color:#000;font:600 8px/1 system-ui,sans-serif;opacity:.85;}',
            '.' + BAR_CLASS + ':hover .' + CHEVRON_CLASS + '{opacity:1;}',
            // ── Panel template (create()) — consistent header+body, Bricks builder colours, tight padding ──
            '.' + PANEL_CLASS + '{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--builder-bg,#1e1e1e);color:var(--builder-color,#e0e0e0);font-family:inherit;font-size:12px;box-sizing:border-box;}',
            '.' + PANEL_CLASS + ' *{box-sizing:border-box;}',
            '.' + PANEL_HEADER_CLASS + ',.' + PANEL_FOOTER_CLASS + '{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:3px 8px;min-height:24px;background:var(--bricks-bg-dark,#18191d);color:var(--bricks-color-light,#e6e9ee);}',
            // The whole header is a drag handle → grab cursor (interactive children keep theirs).
            '.' + PANEL_HEADER_CLASS + '{border-bottom:1px solid var(--builder-border,#2f3136);cursor:grab;}',
            '.' + PANEL_HEADER_CLASS + ' button,.' + PANEL_HEADER_CLASS + ' a,.' + PANEL_HEADER_CLASS + ' input,.' + PANEL_HEADER_CLASS + ' select,.' + PANEL_HEADER_CLASS + ' textarea{cursor:auto;}',
            '.' + PANEL_FOOTER_CLASS + '{border-top:1px solid var(--builder-border,#2f3136);}',
            '.' + PANEL_TITLE_CLASS + '{font-weight:600;white-space:nowrap;}',
            // Drag grip (far left of the header) — the ONLY drag handle, so it
            // never conflicts with the panel's own header controls.
            '.' + PANEL_GRIP_CLASS + '{flex:0 0 auto;cursor:grab;color:inherit;opacity:.5;font:600 12px/1 system-ui,sans-serif;padding:0 2px;user-select:none;touch-action:none;}',
            '.' + PANEL_GRIP_CLASS + ':hover{opacity:.9;}',
            '.' + PANEL_GRIP_CLASS + ':active{cursor:grabbing;}',
            // While dragging, the original panel is temporarily removed from flow
            // so BOTH docks reflow live (source redistributes/empties, target opens
            // a slot). A placeholder shows where it will land.
            '.' + DRAGGING_CLASS + '{display:none !important;}',
            '.' + PLACEHOLDER_CLASS + '{flex:1 1 0;min-width:' + PANEL_MIN_WIDTH + 'px;align-self:stretch;box-sizing:border-box;border:2px dashed var(--builder-color-accent,#3b82f6);background:rgba(59,130,246,.10);border-radius:2px;pointer-events:none;}',
            // Ghost that follows the cursor.
            '.' + GHOST_CLASS + '{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;white-space:nowrap;padding:4px 10px;border-radius:3px;font:600 12px/1 system-ui,sans-serif;background:var(--bricks-bg-dark,#18191d);color:var(--bricks-color-light,#e6e9ee);border:1px solid var(--builder-color-accent,#3b82f6);box-shadow:0 6px 18px rgba(0,0,0,.45);opacity:.92;}',
            // Close (✕) button — pushed to the top-right of the header.
            '.' + PANEL_CLOSE_CLASS + '{margin-left:auto;flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;font:600 12px/1 system-ui,sans-serif;opacity:.7;}',
            '.' + PANEL_CLOSE_CLASS + ':hover{opacity:1;}',
            '.' + PANEL_BODY_CLASS + '{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 8px;}',
            '.' + PANEL_BODY_CLASS + '--flush{padding:0;}',
            // Scrollbars matching the Bricks builder UI (thin, accent thumb on bg-3 track).
            '.' + PANEL_BODY_CLASS + '{scrollbar-width:thin;scrollbar-color:var(--builder-color-accent,#3b82f6) var(--builder-bg-3,#2a2a2a);}',
            '.' + PANEL_BODY_CLASS + '::-webkit-scrollbar{width:8px;height:8px;}',
            '.' + PANEL_BODY_CLASS + '::-webkit-scrollbar-track{background-color:var(--builder-bg-3,#2a2a2a);}',
            '.' + PANEL_BODY_CLASS + '::-webkit-scrollbar-thumb{background-color:var(--builder-color-accent,#3b82f6);}',
        ].join('');
        (document.head || document.documentElement).appendChild(style);
    }

    // ── Persistence ─────────────────────────────────────────────────────────
    interface DockPersist {
        height?: number;
        collapsed?: boolean;
    }
    interface PanelPersist {
        position: DockPosition;
        order?: number;  // index within the dock (for reorder + DnD)
        width?: number;  // flex-grow weight (divider position); absent = equal
    }
    interface Persisted {
        panels: Record<string, PanelPersist>;
        docks: Partial<Record<DockPosition, DockPersist>>;
    }
    function loadLayout(): Persisted {
        try {
            const raw = localStorage.getItem(LS_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return {
                panels: parsed?.panels && typeof parsed.panels === 'object' ? parsed.panels : {},
                docks: parsed?.docks && typeof parsed.docks === 'object' ? parsed.docks : {},
            };
        } catch {
            return { panels: {}, docks: {} };
        }
    }
    function persistPanel(id: string, patch: Partial<PanelPersist>): void {
        try {
            const m = loadLayout();
            m.panels[id] = { ...(m.panels[id] || { position: 'bottom' }), ...patch };
            localStorage.setItem(LS_KEY, JSON.stringify(m));
        } catch {
            /* localStorage unavailable — layout just won't persist. */
        }
    }
    /** Persist position + order + width for every (id'd) panel currently in a dock. */
    function saveDockLayout(dock: DockState): void {
        rowPanels(dock).forEach((el, i) => {
            const id = el.dataset.brxId;
            if (!id) return;
            const w = el.dataset.brxWidth ? parseFloat(el.dataset.brxWidth) : undefined;
            persistPanel(id, { position: dock.position, order: i, width: w });
        });
    }
    function persistDock(position: DockPosition, patch: DockPersist): void {
        try {
            const m = loadLayout();
            m.docks[position] = { ...(m.docks[position] || {}), ...patch };
            localStorage.setItem(LS_KEY, JSON.stringify(m));
        } catch {
            /* ignore */
        }
    }

    // ── Dock chrome ─────────────────────────────────────────────────────────
    function chevronChar(position: DockPosition, collapsed: boolean): string {
        // The chevron points "the way the panel opens": a bottom dock opens
        // upward, a top dock opens downward.
        if (position === 'bottom') return collapsed ? '▴' : '▾';
        return collapsed ? '▾' : '▴';
    }

    function updateChevron(state: DockState): void {
        if (state.chevron) state.chevron.textContent = chevronChar(state.position, state.collapsed);
    }

    // ── Panel rows (up to MAX_PER_ROW per row, wrap to a new row) ───────────
    /** Which dock contains an element (row/divider/panel). */
    function dockForEl(el: HTMLElement): DockState | undefined {
        let found: DockState | undefined;
        docks.forEach((d) => { if (d.el.contains(el)) found = d; });
        return found;
    }

    /** Panels in a single row element (excludes dividers). */
    function panelsIn(rowEl: HTMLElement): HTMLElement[] {
        return Array.prototype.filter.call(rowEl.children, (c: Element) => c.hasAttribute('data-brx-panel')) as HTMLElement[];
    }

    /** ALL registered panels in a dock, across every row (+ parked hidden), flat DOM order. */
    function rowPanels(dock: DockState): HTMLElement[] {
        return Array.prototype.slice.call(dock.rowsEl.querySelectorAll('[data-brx-panel]')) as HTMLElement[];
    }

    /** Visible panels (a per-panel hide sets display:none) across the dock, flat. */
    function visibleRowPanels(dock: DockState): HTMLElement[] {
        return rowPanels(dock).filter((p) => p.style.display !== 'none');
    }

    /** Visible panels sorted by persisted order — the flat order that chunks into rows. */
    function orderedVisiblePanels(dock: DockState): HTMLElement[] {
        const persisted = loadLayout().panels;
        return visibleRowPanels(dock).sort((a, b) => {
            const oa = persisted[a.dataset.brxId || '']?.order ?? Number.MAX_SAFE_INTEGER;
            const ob = persisted[b.dataset.brxId || '']?.order ?? Number.MAX_SAFE_INTEGER;
            return oa - ob;
        });
    }

    /** Apply the dock's (shared) per-row height to all its rows. */
    function applyRowHeights(dock: DockState): void {
        Array.prototype.slice.call(dock.rowsEl.querySelectorAll('.' + ROW_CLASS))
            .forEach((r: Element) => { (r as HTMLElement).style.height = dock.height + 'px'; });
    }

    /**
     * Rebuild the dock's rows from a flat list of SLOTS (visible panels, plus an
     * optional drag placeholder) — chunked into rows of MAX_PER_ROW. Each panel
     * gets its grow weight (or an equal weight when `equal`), a divider between
     * adjacent panels, and the shared per-row height. Hidden panels are parked
     * (display:none) directly in rowsEl, outside any row.
     */
    function layoutDockSlots(dock: DockState, slots: HTMLElement[], equal = false): void {
        const hidden = rowPanels(dock).filter((p) => p.style.display === 'none');
        dock.rowsEl.textContent = ''; // detach rows/dividers (slot refs are held)
        for (let i = 0; i < slots.length; i += MAX_PER_ROW) {
            const rowEl = document.createElement('div');
            rowEl.className = ROW_CLASS;
            rowEl.style.height = dock.height + 'px';
            const group = slots.slice(i, i + MAX_PER_ROW);
            group.forEach((slot) => {
                if (slot.hasAttribute('data-brx-panel')) {
                    slot.style.flex = (equal ? '1' : (slot.dataset.brxWidth || '1')) + ' 1 0';
                } // a placeholder keeps its CSS flex
                rowEl.appendChild(slot);
            });
            for (let j = 0; j < group.length - 1; j++) {
                rowEl.insertBefore(createDivider(), group[j + 1]);
            }
            dock.rowsEl.appendChild(rowEl);
        }
        hidden.forEach((p) => dock.rowsEl.appendChild(p)); // parked, not in a row
    }

    /** Repack the dock into rows from its current visible panels (persisted order). */
    function repackRows(dock: DockState): void {
        layoutDockSlots(dock, orderedVisiblePanels(dock));
    }

    /** A draggable vertical divider that resizes the two panels it sits between (within one row). */
    function createDivider(): HTMLElement {
        const divider = document.createElement('div');
        divider.className = DIVIDER_CLASS;

        let startX = 0;
        let prev: HTMLElement | null = null;
        let next: HTMLElement | null = null;
        let startPrev = 0;
        let startNext = 0;

        const onMove = (e: PointerEvent): void => {
            if (!prev || !next) return;
            const delta = e.clientX - startX;
            let a = startPrev + delta;
            let b = startNext - delta;
            if (a < PANEL_MIN_WIDTH) { b -= PANEL_MIN_WIDTH - a; a = PANEL_MIN_WIDTH; }
            if (b < PANEL_MIN_WIDTH) { a -= PANEL_MIN_WIDTH - b; b = PANEL_MIN_WIDTH; }
            prev.style.flex = a + ' 1 0';
            next.style.flex = b + ' 1 0';
        };
        const onUp = (e: PointerEvent): void => {
            divider.releasePointerCapture?.(e.pointerId);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            const rowEl = divider.parentElement as HTMLElement | null;
            const dock = rowEl ? dockForEl(rowEl) : undefined;
            if (rowEl) panelsIn(rowEl).forEach((p) => { p.dataset.brxWidth = String(p.offsetWidth); });
            if (dock) saveDockLayout(dock);
            emitChange();
        };
        divider.addEventListener('pointerdown', (e: PointerEvent) => {
            if (e.button !== 0) return;
            prev = divider.previousElementSibling as HTMLElement | null;
            next = divider.nextElementSibling as HTMLElement | null;
            const rowEl = divider.parentElement as HTMLElement | null;
            if (!prev || !next || !rowEl) return;
            e.preventDefault();
            // Read ALL widths in THIS row before writing any flex (avoid layout thrash).
            const panels = panelsIn(rowEl);
            const widths = panels.map((p) => p.offsetWidth);
            panels.forEach((p, i) => { p.style.flex = widths[i] + ' 1 0'; });
            startPrev = widths[panels.indexOf(prev)];
            startNext = widths[panels.indexOf(next)];
            startX = e.clientX;
            divider.setPointerCapture?.(e.pointerId);
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });

        return divider;
    }

    // ── Drag-and-drop between / within docks (header handle) ────────────────
    /**
     * Resolve which dock + FLAT insertion index (across all rows) the pointer is
     * over. The flat index chunks back into rows of MAX_PER_ROW on drop.
     */
    function resolveDropTarget(x: number, y: number, dragged: HTMLElement): { position: DockPosition; index: number } {
        const within = (d?: DockState): boolean => {
            if (!d) return false;
            const r = d.el.getBoundingClientRect();
            return y >= r.top && y <= r.bottom;
        };
        let position: DockPosition;
        if (within(docks.get('top'))) position = 'top';
        else if (within(docks.get('bottom'))) position = 'bottom';
        else {
            const wrapper = getWrapper();
            const wr = wrapper?.getBoundingClientRect();
            position = wr ? (y < wr.top + wr.height / 2 ? 'top' : 'bottom') : 'bottom';
        }
        const target = docks.get(position);
        if (!target) return { position, index: 0 };

        const rows = Array.prototype.slice.call(target.rowsEl.querySelectorAll('.' + ROW_CLASS)) as HTMLElement[];
        let flatBefore = 0;
        for (let r = 0; r < rows.length; r++) {
            const panels = panelsIn(rows[r]).filter((p) => p !== dragged);
            const rect = rows[r].getBoundingClientRect();
            const inThisRow = y < rect.bottom || r === rows.length - 1;
            if (inThisRow) {
                let pos = panels.length;
                for (let i = 0; i < panels.length; i++) {
                    const pr = panels[i].getBoundingClientRect();
                    if (x < pr.left + pr.width / 2) { pos = i; break; }
                }
                return { position, index: flatBefore + pos };
            }
            flatBefore += panels.length;
        }
        return { position, index: flatBefore };
    }

    /** Move a panel to a dock at a flat index (creating the dock if needed); rows re-chunk. */
    function movePanelTo(panel: HTMLElement, position: DockPosition, index: number): void {
        const fromPos = panel.getAttribute('data-brx-panel') as DockPosition | null;
        const fromDock = fromPos ? docks.get(fromPos) : undefined;
        const toDock = docks.get(position) || ensureDock(position, {});

        // Target's current flat order (excluding the panel), then insert it at `index`.
        const others = orderedVisiblePanels(toDock).filter((p) => p !== panel);
        toDock.rowsEl.appendChild(panel); // placement is decided by layoutDockSlots below
        panel.setAttribute('data-brx-panel', position);
        const id = panel.dataset.brxId;
        if (id) { const entry = registry.get(id); if (entry) entry.position = position; }

        const flat = others.slice();
        flat.splice(Math.max(0, Math.min(index, flat.length)), 0, panel);
        flat.forEach((p) => { delete p.dataset.brxWidth; }); // receiving dock equalises
        flat.forEach((p, i) => { if (p.dataset.brxId) persistPanel(p.dataset.brxId, { position, order: i }); });
        layoutDockSlots(toDock, flat);
        saveDockLayout(toDock);

        if (fromDock && fromDock !== toDock) {
            repackRows(fromDock);
            saveDockLayout(fromDock);
            if (fromPos) cleanupDock(fromPos); // source emptied → iframe reclaims its space
        }
        emitChange();
    }

    /**
     * Re-flow BOTH docks for the live drag preview: the dragged panel is removed
     * from flow (display:none), a panel-sized placeholder marks the drop slot at
     * the flat index, both docks re-chunk into equal-width rows, and a dock with no
     * visible slots collapses (iframe reclaims the space) — so the user sees both
     * ends change as they drag.
     */
    function reflowDragPreview(placeholder: HTMLElement, dragged: HTMLElement, target: { position: DockPosition; index: number }): void {
        if (placeholder.parentElement) placeholder.remove();
        (['top', 'bottom'] as DockPosition[]).forEach((pos) => {
            const d = docks.get(pos);
            if (!d) return;
            const slots = orderedVisiblePanels(d).filter((p) => p !== dragged) as HTMLElement[];
            if (pos === target.position) {
                slots.splice(Math.max(0, Math.min(target.index, slots.length)), 0, placeholder);
            }
            layoutDockSlots(d, slots, true); // equal-width preview
            // Keep BOTH docks visible during the drag — an empty one shows a dashed
            // drop zone (via DOCK_DRAG_CLASS) so it can be targeted.
            d.el.style.display = '';
        });
    }

    /** True if the pointer landed on (or inside) an interactive control. */
    function isInteractiveTarget(t: EventTarget | null): boolean {
        const el = t as HTMLElement | null;
        return !!el?.closest?.('button, a, input, select, textarea, label, [contenteditable], [data-brx-no-drag]');
    }

    /**
     * Make the WHOLE header a drag handle: press-and-drag anywhere on it to move
     * the panel between / within docks. A press on an interactive control (button,
     * input, select, the close ✕, etc.) is ignored, and a real drag only begins
     * after a small movement threshold — so plain clicks on the header still work.
     */
    function wireHeaderDrag(header: HTMLElement, panel: HTMLElement): void {
        header.addEventListener('pointerdown', (e: PointerEvent) => {
            if (e.button !== 0) return;
            if (isInteractiveTarget(e.target)) return; // let controls do their thing

            const startX = e.clientX;
            const startY = e.clientY;
            let started = false;
            let ghost: HTMLElement | null = null;
            let placeholder: HTMLElement | null = null;
            let target = resolveDropTarget(startX, startY, panel);

            const moveGhost = (ev: PointerEvent): void => {
                if (ghost) ghost.style.transform = 'translate(' + (ev.clientX + 12) + 'px,' + (ev.clientY + 12) + 'px)';
            };

            const begin = (): void => {
                started = true;
                ghost = document.createElement('div');
                ghost.className = GHOST_CLASS;
                const titleEl = panel.querySelector('.' + PANEL_TITLE_CLASS) as HTMLElement | null;
                const headEl = panel.querySelector('.' + PANEL_HEADER_CLASS) as HTMLElement | null;
                ghost.textContent = (titleEl?.textContent || headEl?.textContent || 'Panel').trim().slice(0, 28) || 'Panel';
                document.body.appendChild(ghost);
                panel.classList.add(DRAGGING_CLASS);
                placeholder = document.createElement('div');
                placeholder.className = PLACEHOLDER_CLASS;
                // Make BOTH docks exist + show a drop zone, so a panel can be dragged
                // into an empty dock (otherwise there'd be nothing to aim at).
                (['top', 'bottom'] as DockPosition[]).forEach((pos) => {
                    const d = docks.get(pos) || ensureDock(pos, {});
                    d.el.classList.add(DOCK_DRAG_CLASS);
                });
            };

            const onMove = (ev: PointerEvent): void => {
                if (!started) {
                    if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
                    begin(); // crossed the threshold — it's a drag, not a click
                }
                moveGhost(ev);
                target = resolveDropTarget(ev.clientX, ev.clientY, panel);
                reflowDragPreview(placeholder!, panel, target);
            };
            const onUp = (): void => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                if (!started) return; // a click, not a drag — leave everything as-is
                if (ghost?.parentElement) ghost.remove();
                if (placeholder?.parentElement) placeholder.remove();
                docks.forEach((d) => { d.el.style.display = ''; d.el.classList.remove(DOCK_DRAG_CLASS); });
                panel.classList.remove(DRAGGING_CLASS);
                movePanelTo(panel, target.position, target.index);
                // Drop the empty drop-zone dock(s) we may have spun up for the drag.
                cleanupDock('top');
                cleanupDock('bottom');
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });
    }

    /**
     * Build the chrome bar. The WHOLE bar is interactive: a click (no drag)
     * toggles collapse, a vertical drag resizes (when expanded). A centered
     * light chevron indicates the open direction.
     */
    function createBar(state: DockState): HTMLElement {
        const DRAG_THRESHOLD = 3; // px of movement before a press counts as a resize, not a click

        const bar = document.createElement('div');
        bar.className = BAR_CLASS;
        bar.setAttribute('role', 'button');
        bar.setAttribute('tabindex', '0');
        bar.setAttribute('aria-label', 'Collapse / expand panel (drag to resize)');

        const chevron = document.createElement('span');
        chevron.className = CHEVRON_CLASS;
        bar.appendChild(chevron);
        state.chevron = chevron;
        updateChevron(state);

        let startY = 0;
        let startH = 0;
        let active = false;
        let moved = false;

        const onMove = (e: PointerEvent): void => {
            if (!active || state.collapsed) return; // no resize while collapsed
            const delta = state.position === 'bottom' ? (startY - e.clientY) : (e.clientY - startY);
            if (!moved && Math.abs(delta) < DRAG_THRESHOLD) return;
            moved = true;
            setDockHeight(state, startH + delta);
        };
        const onUp = (e: PointerEvent): void => {
            if (!active) return;
            active = false;
            bar.releasePointerCapture?.(e.pointerId);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            if (moved) {
                persistDock(state.position, { height: state.height });
                emitChange();
            } else {
                // No drag → it was a click: toggle collapse.
                setDockCollapsed(state, !state.collapsed);
            }
        };
        bar.addEventListener('pointerdown', (e: PointerEvent) => {
            if (e.button !== 0) return; // left button only
            e.preventDefault();
            active = true;
            moved = false;
            startY = e.clientY;
            startH = state.height; // per-row height (the dock grows with rows)
            bar.setPointerCapture?.(e.pointerId);
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });

        // Keyboard: Enter / Space toggles collapse.
        bar.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDockCollapsed(state, !state.collapsed);
            }
        });

        return bar;
    }

    function clampHeight(state: DockState, px: number): number {
        const preview = getPreview();
        const ceiling = state.max === Infinity
            ? (preview ? Math.round(preview.clientHeight * 0.85) : px)
            : state.max;
        return Math.max(state.min, Math.min(px, ceiling));
    }

    function setDockHeight(state: DockState, px: number): void {
        state.height = clampHeight(state, px);
        // The dock height is content-driven (it grows with rows); the per-row
        // height is what we set, so all rows resize together.
        if (!state.collapsed) applyRowHeights(state);
    }

    /** Apply collapsed state to the DOM only (no persist / notify). */
    function applyCollapsedDom(state: DockState): void {
        if (state.collapsed) {
            state.el.setAttribute('data-collapsed', 'true'); // CSS hides the rows → bar only
        } else {
            state.el.removeAttribute('data-collapsed');
            applyRowHeights(state);
        }
        updateChevron(state);
    }

    /** Find the registry entry for a panel element (small n — ≤3 per dock). */
    function entryForEl(el: HTMLElement): PanelEntry | undefined {
        let found: PanelEntry | undefined;
        registry.forEach((e) => { if (e.el === el) found = e; });
        return found;
    }

    /** Notify EVERY panel in a dock that it collapsed/expanded (per-panel callbacks). */
    function notifyDockCollapse(state: DockState, collapsed: boolean): void {
        rowPanels(state).forEach((el) => {
            try {
                entryForEl(el)?.onCollapse?.(collapsed);
            } catch {
                /* a panel's callback throwing must not break the dock */
            }
        });
    }

    function setDockCollapsed(state: DockState, collapsed: boolean): void {
        if (state.collapsed === collapsed) return; // idempotent — no redundant notify/persist
        state.collapsed = collapsed;
        applyCollapsedDom(state);
        persistDock(state.position, { collapsed });
        notifyDockCollapse(state, collapsed);
        emitChange();
    }

    /**
     * Hide/show a SINGLE panel (not the whole dock). Other panels in the dock
     * keep their place; the dock container only disappears (so the iframe
     * reclaims the space) when ALL of its panels are hidden. Hidden panels are
     * parked at the end of the row so the visible ones stay contiguous.
     */
    function setPanelHidden(dock: DockState, panel: HTMLElement, hidden: boolean): void {
        panel.style.display = hidden ? 'none' : '';
        repackRows(dock); // hidden panels are parked outside rows; visible ones re-chunk
        const anyVisible = visibleRowPanels(dock).length > 0;
        dock.el.style.display = anyVisible ? '' : 'none';
        emitChange();
    }

    // ── Dock containers ─────────────────────────────────────────────────────
    function ensureDock(position: DockPosition, opts: RegisterOptions): DockState {
        const existing = docks.get(position);
        if (existing) return existing; // collapse callbacks are per-panel now (on the entry)

        const preview = getPreview()!;
        const wrapper = getWrapper()!;

        const el = document.createElement('div');
        el.className = DOCK_CLASS;
        el.setAttribute('data-position', position);

        if (position === 'top') preview.insertBefore(el, wrapper);
        else preview.insertBefore(el, wrapper.nextSibling);

        const rowsEl = document.createElement('div');
        rowsEl.className = ROWS_CLASS;

        const saved = loadLayout().docks[position] || {};
        const height = typeof saved.height === 'number' ? saved.height : (opts.defaultHeight ?? DEFAULT_HEIGHT);
        const collapsed = typeof saved.collapsed === 'boolean' ? saved.collapsed : !!opts.defaultCollapsed;

        const state: DockState = {
            el,
            bar: null,
            chevron: null,
            rowsEl,
            position,
            height,
            collapsed,
            min: opts.minHeight ?? DEFAULT_MIN,
            max: opts.maxHeight ?? Infinity,
            resizable: opts.resizable !== false,
        };
        // No explicit dock height — it's content-driven (bar + rows) and grows with rows.

        if (state.resizable) state.bar = createBar(state);
        // Bar sits on the iframe-facing edge: top of a bottom dock, bottom of a top dock.
        if (position === 'top') {
            el.appendChild(rowsEl);
            if (state.bar) el.appendChild(state.bar);
        } else {
            if (state.bar) el.appendChild(state.bar);
            el.appendChild(rowsEl);
        }

        // Reflect the restored/initial collapsed state in the DOM (no notify yet —
        // register() informs the caller once the panel is in place).
        applyCollapsedDom(state);

        docks.set(position, state);
        return state;
    }

    /** Remove a dock container once its row holds no registered panels. */
    function cleanupDock(position: DockPosition): void {
        const state = docks.get(position);
        if (!state) return;
        if (rowPanels(state).length > 0) return;
        state.el.remove();
        docks.delete(position);
    }

    // ── Public API ──────────────────────────────────────────────────────────
    function emitChange(): void {
        if (!listeners.size) return;
        const snapshot = list();
        listeners.forEach((cb) => {
            try {
                cb(snapshot);
            } catch {
                /* a listener throwing must not break the dock */
            }
        });
    }

    function register(el: HTMLElement, opts?: RegisterOptions): PanelHandle | null {
        if (!el) return null;
        const o = opts || {};
        ensureStylesheet();
        if (!getWrapper() || !getPreview()) return null;

        const id = o.id || ('brx-panel-' + ++seq);
        const persisted = o.id ? loadLayout().panels[id] : undefined;
        const position: DockPosition = persisted?.position || (o.position === 'top' ? 'top' : 'bottom');

        const dock = ensureDock(position, o);

        // Panels live in the dock's rows (chunked into rows of MAX_PER_ROW). No
        // per-dock cap any more — a 4th+ panel just wraps to a new row.
        if (o.id) el.dataset.brxId = id; // enables width/order persistence for this panel
        dock.rowsEl.appendChild(el); // placement is decided by repackRows() below
        el.setAttribute('data-brx-panel', dock.position);

        if (persisted && persisted.width != null) {
            // Restore the saved width weight (divider position survives reload).
            el.dataset.brxWidth = String(persisted.width);
        } else {
            // A genuinely new panel → equalise the whole dock (clear saved widths).
            rowPanels(dock).forEach((p) => { delete p.dataset.brxWidth; });
        }

        repackRows(dock); // honours persisted order + chunks into rows of MAX_PER_ROW

        registry.set(id, { el, position: dock.position, onCollapse: o.onCollapseChange });
        if (o.id) saveDockLayout(dock);

        // Inform THIS panel of the restored/initial collapsed state (the DOM
        // already reflects it from ensureDock) so it can mirror it — fired even
        // when the value equals the default. Other panels already in the dock keep
        // their state; they aren't re-notified just because a sibling joined.
        o.onCollapseChange?.(dock.collapsed);
        emitChange();

        // Resolve the panel's CURRENT dock each call so the handle keeps working
        // after a DnD move to another dock (the closure's original `dock` goes stale).
        const curDock = (): DockState => docks.get(el.getAttribute('data-brx-panel') as DockPosition) || dock;
        return {
            id,
            get position(): DockPosition { return (el.getAttribute('data-brx-panel') as DockPosition) || dock.position; },
            unregister: () => unregister(id),
            setHeight: (px: number) => {
                const d = curDock();
                setDockHeight(d, px);
                persistDock(d.position, { height: d.height });
            },
            setCollapsed: (c: boolean) => setDockCollapsed(curDock(), c),
            isCollapsed: () => curDock().collapsed,
            setHidden: (h: boolean) => setPanelHidden(curDock(), el, h),
            getHeight: () => curDock().el.offsetHeight,
        };
    }

    function unregister(idOrEl: string | HTMLElement): void {
        let id: string | null = null;
        if (typeof idOrEl === 'string') {
            id = idOrEl;
        } else {
            registry.forEach((entry, key) => {
                if (entry.el === idOrEl) id = key;
            });
        }
        if (id == null || !registry.has(id)) return;

        const entry = registry.get(id)!;
        entry.el.removeAttribute('data-brx-panel');
        // Detach the element from its row BEFORE the empty-container cleanup so
        // removing the container doesn't destroy the panel too — the caller keeps
        // its reference and may re-register it later (e.g. detach → reattach) or
        // dispose of it.
        const host = entry.el.parentElement;
        if (host && (host.classList.contains(ROW_CLASS) || host.classList.contains(ROWS_CLASS))) {
            host.removeChild(entry.el);
        }
        registry.delete(id);
        const dock = docks.get(entry.position);
        if (dock) {
            repackRows(dock); // re-chunk remaining panels into rows
            saveDockLayout(dock); // persist the new order/widths
        }
        cleanupDock(entry.position);
        emitChange();
    }

    function list(): PanelInfo[] {
        const out: PanelInfo[] = [];
        registry.forEach((entry, id) => {
            const dock = docks.get(entry.position);
            out.push({
                id,
                el: entry.el,
                position: entry.position,
                height: entry.el.offsetHeight,
                collapsed: !!dock?.collapsed,
            });
        });
        return out;
    }

    function on(event: 'change', cb: ChangeListener): () => void {
        if (event !== 'change' || typeof cb !== 'function') return () => undefined;
        listeners.add(cb);
        return () => listeners.delete(cb);
    }

    function recalc(): void {
        ensureStylesheet();
    }

    /** Fill a host with a string (innerHTML) or a DOM node. */
    function setContent(host: HTMLElement, content?: string | Node): void {
        if (content == null) return;
        if (typeof content === 'string') host.innerHTML = content;
        else host.appendChild(content);
    }

    function create(opts?: PanelTemplateOptions): TemplatedPanel {
        const o = opts || {};
        ensureStylesheet();

        const el = document.createElement('div');
        el.className = PANEL_CLASS + (o.className ? ' ' + o.className : '');

        const header = document.createElement('div');
        header.className = PANEL_HEADER_CLASS;

        // Drag grip (far-left) — the ONLY handle that starts a move, so it never
        // fights the panel's own header controls.
        const grip = document.createElement('div');
        grip.className = PANEL_GRIP_CLASS;
        grip.textContent = '⠿'; // ⠿ braille grip
        grip.setAttribute('aria-label', 'Drag to move panel');
        header.appendChild(grip);

        if (o.header != null) {
            setContent(header, o.header);
        } else if (o.title) {
            const title = document.createElement('span');
            title.className = PANEL_TITLE_CLASS;
            title.textContent = o.title;
            header.appendChild(title);
        }

        // Optional close (✕) button — top-right of the header.
        let closeBtn: HTMLButtonElement | null = null;
        if (typeof o.onClose === 'function') {
            closeBtn = document.createElement('button');
            closeBtn.className = PANEL_CLOSE_CLASS;
            closeBtn.type = 'button';
            closeBtn.setAttribute('aria-label', 'Close panel');
            closeBtn.textContent = '✕'; // ✕
            header.appendChild(closeBtn);
        }

        const body = document.createElement('div');
        body.className = PANEL_BODY_CLASS + (o.flushBody ? ' ' + PANEL_BODY_CLASS + '--flush' : '');
        setContent(body, o.body);

        // Optional footer — styled like the header, below the body.
        let footer: HTMLElement | null = null;
        if (o.footer != null) {
            footer = document.createElement('div');
            footer.className = PANEL_FOOTER_CLASS;
            setContent(footer, o.footer);
        }

        el.appendChild(header);
        el.appendChild(body);
        if (footer) el.appendChild(footer);

        const handle = register(el, o);

        // The whole header is the drag handle (the grip is just a visual cue).
        wireHeaderDrag(header, el);

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                // Consumer cleanup first, then drop the panel (free the dock slot)
                // and remove the element from the DOM entirely.
                try {
                    o.onClose?.();
                } finally {
                    handle?.unregister();
                    el.remove();
                }
            });
        }

        return { handle, el, header, body, footer };
    }

    const api: BrxCommonPanels = { register, create, unregister, recalc, list, on, version: VERSION };
    window.BRX_Common = window.BRX_Common || {};
    window.BRX_Common.panels = api;

    // ── Bootstrap ───────────────────────────────────────────────────────────
    // The preview/wrapper may not exist yet at script-eval time (builder booting).
    if (getWrapper()) {
        ensureStylesheet();
    } else if (typeof MutationObserver !== 'undefined') {
        const boot = new MutationObserver(() => {
            if (getWrapper()) {
                boot.disconnect();
                ensureStylesheet();
            }
        });
        boot.observe(document.documentElement, { childList: true, subtree: true });
    }
})();
