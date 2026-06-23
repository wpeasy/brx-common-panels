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

    const VERSION = '0.10.0';
    const PREVIEW_ID = 'bricks-preview';
    const WRAPPER_ID = 'bricks-builder-iframe-wrapper';
    const HOST_CLASS = 'brx-common-host';
    const DOCK_CLASS = 'brx-common-dock';
    const BAR_CLASS = 'brx-common-dock__bar';
    const CHEVRON_CLASS = 'brx-common-dock__chevron';
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
    const STYLE_ID = 'brx-common-panels-style';
    const LS_KEY = 'brx-common-panels';
    const DEFAULT_HEIGHT = 300;
    const DEFAULT_MIN = 80;
    const MAX_PANELS = 3;       // panels per dock (flex row, no wrap)
    const PANEL_MIN_WIDTH = 80; // px — horizontal-resize clamp

    interface DockState {
        el: HTMLElement;
        bar: HTMLElement | null;
        chevron: HTMLElement | null;
        row: HTMLElement;       // flex-row host for the dock's panels
        position: DockPosition;
        height: number;
        collapsed: boolean;
        min: number;
        max: number;
        resizable: boolean;
        onCollapse?: (collapsed: boolean) => void;
    }
    interface PanelEntry {
        el: HTMLElement;
        position: DockPosition;
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
            // Panel row: flex row, no-wrap — up to 3 panels side by side, equal width.
            '.' + ROW_CLASS + '{flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:row;flex-wrap:nowrap;}',
            '.' + ROW_CLASS + '>[data-brx-panel]{flex:1 1 0;min-width:' + PANEL_MIN_WIDTH + 'px;min-height:0;overflow:hidden;}',
            // Collapsed → hide the panel row, leaving just the chrome bar.
            '.' + DOCK_CLASS + '[data-collapsed="true"]>.' + ROW_CLASS + '{display:none;}',
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
            '.' + PANEL_HEADER_CLASS + '{border-bottom:1px solid var(--builder-border,#2f3136);}',
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

    // ── Panel row (horizontal layout) ──────────────────────────────────────
    /** ALL registered panels in a dock's row (visible or hidden; excludes dividers). */
    function rowPanels(dock: DockState): HTMLElement[] {
        return Array.prototype.filter.call(
            dock.row.children,
            (c: Element) => c.hasAttribute('data-brx-panel'),
        ) as HTMLElement[];
    }

    /** Only the panels currently shown (a per-panel hide sets display:none). */
    function visibleRowPanels(dock: DockState): HTMLElement[] {
        return rowPanels(dock).filter((p) => p.style.display !== 'none');
    }

    /** Reorder the dock's panels in the DOM to match their persisted `order`. */
    function sortDockByOrder(dock: DockState): void {
        const persisted = loadLayout().panels;
        const ordered = rowPanels(dock).sort((a, b) => {
            const oa = persisted[a.dataset.brxId || '']?.order ?? Number.MAX_SAFE_INTEGER;
            const ob = persisted[b.dataset.brxId || '']?.order ?? Number.MAX_SAFE_INTEGER;
            return oa - ob;
        });
        ordered.forEach((p) => dock.row.appendChild(p)); // dividers are rebuilt by layoutRow
    }

    /**
     * Re-lay the row after the visible panel set changes: equal widths for the
     * visible panels (per spec — adding a panel resets everyone to the same width)
     * and a fresh divider between each adjacent VISIBLE pair. Hidden panels are
     * parked at the end of the row (see setPanelHidden) so the visible ones stay
     * contiguous and dividers always sit between two visible siblings.
     */
    function layoutRow(dock: DockState): void {
        Array.prototype.slice
            .call(dock.row.querySelectorAll('.' + DIVIDER_CLASS))
            .forEach((d: Element) => d.remove());
        const panels = visibleRowPanels(dock);
        panels.forEach((p) => {
            // Persisted/snapshotted grow weight, else equal (grow 1, basis 0).
            p.style.flex = (p.dataset.brxWidth || '1') + ' 1 0';
        });
        for (let i = 0; i < panels.length - 1; i++) {
            dock.row.insertBefore(createDivider(dock), panels[i + 1]);
        }
    }

    /** A draggable vertical divider that resizes the two panels it sits between. */
    function createDivider(dock: DockState): HTMLElement {
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
            // Clamp both to the min width, transferring the overflow to the neighbour.
            if (a < PANEL_MIN_WIDTH) { b -= PANEL_MIN_WIDTH - a; a = PANEL_MIN_WIDTH; }
            if (b < PANEL_MIN_WIDTH) { a -= PANEL_MIN_WIDTH - b; b = PANEL_MIN_WIDTH; }
            // Apply pixel widths as flex-grow weights (basis 0) so the row stays
            // responsive and untouched panels keep their snapshotted size.
            prev.style.flex = a + ' 1 0';
            next.style.flex = b + ' 1 0';
        };
        const onUp = (e: PointerEvent): void => {
            divider.releasePointerCapture?.(e.pointerId);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            // Record the resulting widths (grow weights) so they survive reload.
            visibleRowPanels(dock).forEach((p) => { p.dataset.brxWidth = String(p.offsetWidth); });
            saveDockLayout(dock);
            emitChange();
        };
        divider.addEventListener('pointerdown', (e: PointerEvent) => {
            if (e.button !== 0) return;
            prev = divider.previousElementSibling as HTMLElement | null;
            next = divider.nextElementSibling as HTMLElement | null;
            if (!prev || !next) return;
            e.preventDefault();
            // Snapshot ALL panels' current widths as grow weights so the ones we
            // aren't dragging hold their size while width transfers between prev/next.
            // CRITICAL: read every width BEFORE writing any flex — interleaving the
            // two thrashes layout (setting one panel's grow reflows the rest, so a
            // subsequent offsetWidth read returns a skewed value → panels jump).
            const panels = rowPanels(dock);
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

    // ── Drag-and-drop between / within docks (grip handle) ──────────────────
    /** Resolve which dock + insertion index the pointer is over. */
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
            // Not over a dock — pick by the iframe wrapper's vertical midpoint so a
            // panel can be dropped into a not-yet-existing dock above/below the canvas.
            const wrapper = getWrapper();
            const wr = wrapper?.getBoundingClientRect();
            position = wr ? (y < wr.top + wr.height / 2 ? 'top' : 'bottom') : 'bottom';
        }
        const target = docks.get(position);
        const panels = target ? visibleRowPanels(target).filter((p) => p !== dragged) : [];
        let index = panels.length;
        for (let i = 0; i < panels.length; i++) {
            const r = panels[i].getBoundingClientRect();
            if (x < r.left + r.width / 2) { index = i; break; }
        }
        return { position, index };
    }

    /** Move a panel to a dock + index (creating the dock if needed). Honours the cap. */
    function movePanelTo(panel: HTMLElement, position: DockPosition, index: number): void {
        const fromPos = panel.getAttribute('data-brx-panel') as DockPosition | null;
        const fromDock = fromPos ? docks.get(fromPos) : undefined;
        let toDock = docks.get(position);
        if (!toDock) toDock = ensureDock(position, {});

        // Cap (excluding the panel itself when it's already in this dock).
        if (rowPanels(toDock).filter((p) => p !== panel).length >= MAX_PANELS) {
            // eslint-disable-next-line no-console
            console.warn('[BRX_Common] dock "' + position + '" is full (max ' + MAX_PANELS + ') — move ignored.');
            return;
        }

        const ref = visibleRowPanels(toDock).filter((p) => p !== panel)[index] || null;
        toDock.row.insertBefore(panel, ref);
        panel.setAttribute('data-brx-panel', position);
        const id = panel.dataset.brxId;
        if (id) { const entry = registry.get(id); if (entry) entry.position = position; }

        // The receiving dock gained a panel → equalise (per "add resets to equal").
        rowPanels(toDock).forEach((p) => { delete p.dataset.brxWidth; });
        layoutRow(toDock);
        saveDockLayout(toDock);

        if (fromDock && fromDock !== toDock) {
            layoutRow(fromDock);
            saveDockLayout(fromDock);
            // Source emptied → iframe reclaims its space.
            if (fromPos) cleanupDock(fromPos);
        }
        emitChange();
    }

    /**
     * Re-flow BOTH docks for the live drag preview: the dragged panel is removed
     * from flow (display:none via DRAGGING_CLASS), a placeholder marks the drop
     * slot, every dock's slots equalise, dividers are dropped, and a dock with no
     * visible slots collapses (so the iframe reclaims its space) — so the user
     * sees both ends change as they drag.
     */
    function reflowDragPreview(placeholder: HTMLElement, dragged: HTMLElement, target: { position: DockPosition; index: number }): void {
        if (placeholder.parentElement) placeholder.remove();
        const into = docks.get(target.position);
        if (into) {
            const panels = visibleRowPanels(into).filter((p) => p !== dragged);
            into.row.insertBefore(placeholder, panels[target.index] || null);
        }
        (['top', 'bottom'] as DockPosition[]).forEach((pos) => {
            const d = docks.get(pos);
            if (!d) return;
            Array.prototype.slice.call(d.row.querySelectorAll('.' + DIVIDER_CLASS)).forEach((x: Element) => x.remove());
            const slots = visibleRowPanels(d).filter((p) => p !== dragged);
            slots.forEach((p) => { p.style.flex = '1 1 0'; });
            const hasSlot = slots.length > 0 || placeholder.parentElement === d.row;
            d.el.style.display = hasSlot ? '' : 'none';
        });
    }

    /** Wire a header grip so dragging it moves its panel between / within docks. */
    function wireGripDrag(grip: HTMLElement, panel: HTMLElement): void {
        grip.addEventListener('pointerdown', (e: PointerEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            grip.setPointerCapture?.(e.pointerId);

            // Ghost following the cursor (a light label — never a clone, so the
            // CSS panel's editor isn't duplicated).
            const ghost = document.createElement('div');
            ghost.className = GHOST_CLASS;
            const titleEl = panel.querySelector('.' + PANEL_TITLE_CLASS) as HTMLElement | null;
            const headEl = panel.querySelector('.' + PANEL_HEADER_CLASS) as HTMLElement | null;
            ghost.textContent = (titleEl?.textContent || headEl?.textContent || 'Panel').trim().slice(0, 28) || 'Panel';
            document.body.appendChild(ghost);
            const moveGhost = (ev: PointerEvent): void => {
                ghost.style.transform = 'translate(' + (ev.clientX + 12) + 'px,' + (ev.clientY + 12) + 'px)';
            };

            // Remove the dragged panel from flow + show the placeholder slot.
            panel.classList.add(DRAGGING_CLASS);
            const placeholder = document.createElement('div');
            placeholder.className = PLACEHOLDER_CLASS;

            let target = resolveDropTarget(e.clientX, e.clientY, panel);
            moveGhost(e);
            reflowDragPreview(placeholder, panel, target);

            const onMove = (ev: PointerEvent): void => {
                moveGhost(ev);
                target = resolveDropTarget(ev.clientX, ev.clientY, panel);
                reflowDragPreview(placeholder, panel, target);
            };
            const onUp = (ev: PointerEvent): void => {
                grip.releasePointerCapture?.(ev.pointerId);
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                if (ghost.parentElement) ghost.remove();
                if (placeholder.parentElement) placeholder.remove();
                // Restore any docks we temporarily collapsed during the preview.
                docks.forEach((d) => { d.el.style.display = ''; });
                panel.classList.remove(DRAGGING_CLASS);
                movePanelTo(panel, target.position, target.index);
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
            startH = state.el.offsetHeight;
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
        if (!state.collapsed) state.el.style.height = state.height + 'px';
    }

    /** Apply collapsed state to the DOM only (no persist / notify). */
    function applyCollapsedDom(state: DockState): void {
        if (state.collapsed) {
            state.el.setAttribute('data-collapsed', 'true');
            state.el.style.height = ''; // CSS forces auto → fits the bar
        } else {
            state.el.removeAttribute('data-collapsed');
            state.el.style.height = state.height + 'px';
        }
        updateChevron(state);
    }

    function setDockCollapsed(state: DockState, collapsed: boolean): void {
        if (state.collapsed === collapsed) return; // idempotent — no redundant notify/persist
        state.collapsed = collapsed;
        applyCollapsedDom(state);
        persistDock(state.position, { collapsed });
        state.onCollapse?.(collapsed);
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
        if (hidden && panel.parentElement === dock.row) dock.row.appendChild(panel);
        layoutRow(dock); // re-equalise + dividers among the remaining visible panels
        const anyVisible = visibleRowPanels(dock).length > 0;
        dock.el.style.display = anyVisible ? '' : 'none';
        emitChange();
    }

    // ── Dock containers ─────────────────────────────────────────────────────
    function ensureDock(position: DockPosition, opts: RegisterOptions): DockState {
        const existing = docks.get(position);
        if (existing) {
            // Let a later register update the collapse callback / clamps.
            if (opts.onCollapseChange) existing.onCollapse = opts.onCollapseChange;
            return existing;
        }

        const preview = getPreview()!;
        const wrapper = getWrapper()!;

        const el = document.createElement('div');
        el.className = DOCK_CLASS;
        el.setAttribute('data-position', position);

        if (position === 'top') preview.insertBefore(el, wrapper);
        else preview.insertBefore(el, wrapper.nextSibling);

        const row = document.createElement('div');
        row.className = ROW_CLASS;

        const saved = loadLayout().docks[position] || {};
        const height = typeof saved.height === 'number' ? saved.height : (opts.defaultHeight ?? DEFAULT_HEIGHT);
        const collapsed = typeof saved.collapsed === 'boolean' ? saved.collapsed : !!opts.defaultCollapsed;

        const state: DockState = {
            el,
            bar: null,
            chevron: null,
            row,
            position,
            height,
            collapsed,
            min: opts.minHeight ?? DEFAULT_MIN,
            max: opts.maxHeight ?? Infinity,
            resizable: opts.resizable !== false,
            onCollapse: opts.onCollapseChange,
        };
        el.style.height = height + 'px';

        if (state.resizable) state.bar = createBar(state);
        // Bar sits on the iframe-facing edge: top of a bottom dock, bottom of a top dock.
        if (position === 'top') {
            el.appendChild(row);
            if (state.bar) el.appendChild(state.bar);
        } else {
            if (state.bar) el.appendChild(state.bar);
            el.appendChild(row);
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

        // Enforce the per-dock panel cap. If the dock was just created empty for
        // this (rejected) panel, clean it back up so it doesn't linger.
        if (rowPanels(dock).length >= MAX_PANELS) {
            // eslint-disable-next-line no-console
            console.warn('[BRX_Common] dock "' + dock.position + '" is full (max ' + MAX_PANELS + ' panels) — register ignored.');
            cleanupDock(dock.position);
            return null;
        }

        // Panels live in the dock's flex row.
        if (o.id) el.dataset.brxId = id; // enables width/order persistence for this panel
        dock.row.appendChild(el);
        el.setAttribute('data-brx-panel', dock.position);

        if (persisted && persisted.width != null) {
            // Restore the saved width weight (divider position survives reload).
            el.dataset.brxWidth = String(persisted.width);
        } else {
            // A genuinely new panel → equalise the whole dock (clear saved widths).
            rowPanels(dock).forEach((p) => { delete p.dataset.brxWidth; });
        }

        sortDockByOrder(dock); // honour persisted order (and DnD order across reloads)
        layoutRow(dock);

        registry.set(id, { el, position: dock.position });
        if (o.id) saveDockLayout(dock);

        // Inform the caller of the restored/initial collapsed state (the DOM
        // already reflects it from ensureDock) so it can mirror it — fired via
        // the callback directly so it runs even when the value equals the default.
        dock.onCollapse?.(dock.collapsed);
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
        if (host && host.classList.contains(ROW_CLASS)) host.removeChild(entry.el);
        registry.delete(id);
        const dock = docks.get(entry.position);
        if (dock) {
            layoutRow(dock); // re-flow remaining panels + dividers
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

        wireGripDrag(grip, el);

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
