# Changelog

All notable changes to `brx-common-panels` (the shared, collision-free dock manager for Bricks Builder add-ons — `window.BRX_Common.panels`) will be documented in this file.

This package lives in-tree at `packages/brx-common-panels/` inside the `ab-bricks-productivity` plugin repo, which is its source of truth. It's automatically mirrored to its own public repo, [wpeasy/brx-common-panels](https://github.com/wpeasy/brx-common-panels), by a GitHub Action on every push to `main` that touches this folder — the mirror publishes whatever is committed here under the version tag in `package.json`, so **every entry below corresponds to a real published tag** on the standalone repo.

## [Unreleased]

---

## [0.22.0] - 2026-08-19

### Changed
- **The panel title is no longer rendered in the header.** Panels are narrow and their headers already carry the controls that matter; a repeated name was the least useful thing competing for that space. It was inconsistent too — a panel supplying its own `header` never showed one, so one panel had a visible label while its neighbour did not.

### Added
- **The name now appears in the two places it earns its room**, identically for every panel:
  - **Expanded** — as the collapse button's tooltip, so the arrow keeps conveying the action while the tooltip says which panel it belongs to. The ARIA label still states the verb, plus `aria-expanded`.
  - **Collapsed** — as a tag along the collapsed strip, rotated to run down it in a top/bottom dock and flat in a side dock. It uses `writing-mode` rather than a `rotate()` transform, so the box sizes to the rotated text instead of overflowing its own.
- Both read the SAME stored title, so a panel with a bespoke header behaves exactly like one that passes `title`.

### Notes
- The tag is a sibling of the header, not a child, so it can never disturb the layout of a panel that supplies its own — and as a direct child of the panel root it is free to fill the collapsed strip. It is absolutely positioned rather than laid out in the flex column: the strip is only 30px on its short axis, so competing with the header for flex space would leave it a few pixels.
- `panelTitle()` still falls back to reading the header when a panel passes no `title`, so `list()` (and any host UI built on it) is unaffected.

---

## [0.21.0] - 2026-08-18

### Added
- **Per-panel collapse.** Every docked panel now carries an expand/collapse button at the far left of its header, and collapses to just that header strip — independently of the dock it lives in. `setCollapsed()` has always collapsed the whole DOCK (every panel in it at once); this is the missing per-panel equivalent.
  - The panel shrinks along the axis its dock lays panels out on: **width** in a top/bottom dock, where panels sit side by side in a row; **height** in a left/right dock, where they stack in a column. The arrow follows that axis — `◂`/`▸` in a top/bottom dock, `▴`/`▾` in a side dock — and is re-pointed automatically when a panel is dragged between docks of different axes.
  - The expanded size is remembered. Collapsing swaps the panel's flex declaration from its weight (`<w> 1 0`) to a fixed strip (`0 0 30px`) and leaves the weight untouched, so expanding restores exactly the size it had. A divider resize no longer records a collapsed panel's measured ~30px as its weight, which would otherwise have made it reopen as a sliver.
  - State persists per panel id (`selfCollapsed`), deliberately in its own field rather than folded into `width` for the same reason.
  - Transitions `flex-grow`/`flex-basis` with `ease-out`, suppressed during a panel drag or a divider resize (where every frame sets flex directly and easing would lag the pointer) and under `prefers-reduced-motion`.
- **API**: `panels.setPanelCollapsed(idOrEl, collapsed)` / `panels.isPanelCollapsed(idOrEl)`, the same pair on the panel handle, `defaultPanelCollapsed` on `register`/`create`, and `panelCollapsed` on `PanelInfo`.

### Removed
- **The `⠿` drag grip.** It carried no listener of its own — `wireHeaderDrag()` has always made the WHOLE header the drag handle, with an `isInteractiveTarget` guard so header controls still work — so it was decoration occupying the most reachable corner of every panel. That slot now holds the collapse button. Two comments in the source claimed the grip was "the ONLY drag handle"; they were wrong, and are gone with it.
- Consumers who hid the grip with their own CSS override (the plugin's CSS Panel did) can drop that rule; the element no longer exists.

### Fixed
- `VERSION` in the source read `0.20.0` while `package.json` said `0.20.2`. Both now agree, so `panels.version` reports the published tag.

---

## [0.20.2] - 2026-07-21

### Changed
- The dock chrome bar (the collapse/resize strip on a dock's iframe-facing edge) now highlights to Bricks' own accent colour (`var(--builder-color-accent)`) on hover, matching the existing hover treatment on the between-panel resize dividers — previously it stayed a flat grey with no hover feedback at all.

---

## [0.20.1] - 2026-07-14

### Fixed
- The panel template's header/footer strip (`create()`'s header/footer slots) and the drag-ghost indicator were hardcoded to Bricks' fixed `--bricks-bg-dark`/`--bricks-color-light` brand tokens, so they stayed dark even when Bricks Builder itself was switched to Light mode. Swapped for `--builder-bg-2`/`--builder-color` — Bricks' own light/dark-reactive tokens (already used for the panel body background) — so the header now follows the builder's own mode toggle like the rest of the panel does.

---

## [0.20.0] - 2026-07-11

### Fixed
- Bricks Builder's own scale-to-fit (`transform: scale(h)` on `#bricks-builder-iframe-wrapper`, applied when the active breakpoint/preview width doesn't fit the available space) was double-shrinking the canvas whenever a dock was present, leaving whitespace to the right/bottom of the preview. Root cause: Bricks computes `width`/`height`/`transform` as one self-consistent set, sized against `$_state.previewWrapperWidth`/`previewWrapperHeight` — but those are measured off `#bricks-preview`'s own (dock-unaware) box, so this registry's `!important` grid sizing was re-clipping a box Bricks had already sized for a *different* (too-generous) budget, then Bricks' stale `transform` shrank what was left a second time.
- Fixed by feeding Bricks the true, dock-aware `previewWrapperWidth`/`previewWrapperHeight` (outer box minus live dock width/height) whenever dock layout changes, so Bricks' own scale math is correct for the real space — and by standing the registry's own `width`/`height`/`max-width` override down (via a `data-brx-scaled` attribute) exactly while Bricks is actively scaling, so its now-correct output renders unmodified. Native scale-to-fit (including a user's manually-set scale %) keeps working in every case, docked or not.

---

## [0.19.1] - 2026-07-05

### Fixed
- Bricks Builder's own Style Manager "Preview" toggle (which teleports the SAME preview iframe into the Style Manager popup via an inline fixed-position/height/scale style, marked by a `canvas-preview-active` class on `#bricks-preview`) was having its layout stomped by this registry's `!important` grid + `height:auto` rules — collapsing the Style Manager preview to a near-zero height. Both the grid-display rule and the wrapper height/width rule are now scoped with `:not(.canvas-preview-active)`, a pure-CSS ancestor guard using the exact class Bricks itself already toggles. No JS/observer changes needed — normal main-canvas docking is unaffected.

---

## [0.19.0] - 2026-06-26

### Added
- The registry now owns panel close (hide/show + persistence) instead of leaving it to the consumer. `create()` gains `closable?: boolean` (shows the ✕; defaults to `true` when `onClose` is set) and `closeMode?: 'hide' | 'destroy'` (default `'hide'`). A `'hide'` ✕ calls `setHidden(true)` — the panel stays registered and its hidden state persists across reloads; `'destroy'` is the old `unregister()` + remove.

### Changed
- `onClose` is now a side-effect hook (cleanup/logging) only — it runs before the registry acts and must not implement its own persistence.

**Breaking-ish:** an `onClose`-only panel that previously expected the ✕ to destroy the panel now hides it instead — pass `closeMode:'destroy'` explicitly for the old behaviour.

---

## [0.18.1] - 2026-06-26

### Fixed
- "Ready" now correctly means the DOM wrapper actually exists. `register()` was silently no-opping (returning `null`) when `#bricks-builder-iframe-wrapper` / `#bricks-preview` weren't in the DOM yet at script-eval time, and both the `onReady` queue drain and the `brx-common:ready` event fired at install regardless — so a consumer's `create()`/`register()` inside an `onReady` callback could silently fail with an empty `list()` and no error. Both are now deferred until the wrapper actually appears (via the same boot `MutationObserver` that injects the stylesheet), guaranteeing a dock exists to attach to.

---

## [0.18.0] - 2026-06-26

### Added
- A load-order-safe `onReady` command queue on `window.BRX_Common`: `(window.BRX_Common = window.BRX_Common || {}).onReady ||= []; window.BRX_Common.onReady.push((panels) => { ... })`. The callback runs with the live `panels` API whether pushed before the registry loads (a pre-seeded queue doesn't block install; queued callbacks drain when ready) or after (routed through the same ready-gate). Folds the previous event+sync-check pair into one idiom — the preferred pattern for new consumers going forward. The `brx-common:ready` event stays for back-compat.

---

## [0.17.0] - 2026-06-25

### Added
- Granular lifecycle events: `panels.on('add', cb)` (new `PanelInfo`) and `panels.on('remove', cb)` (`{ id }`), alongside the existing coarse `on('change', cb)` full-snapshot event.
- `brx-common:ready` — a `window` DOM event (`detail: { version }`) dispatched once on install, since a consumer can't subscribe to `panels.on()` before the registry exists yet. Load-order-safe pattern: `if (window.BRX_Common?.panels) init(); else window.addEventListener(BRX_COMMON_READY_EVENT, init, { once: true });` (`BRX_COMMON_READY_EVENT` exported from the types).

---

## [0.16.0] - 2026-06-24

### Added
- Four-way docking: docks can now also be enabled on the **left** and **right** edges (previously top/bottom only), flanking the iframe as vertical side docks (single column, vertical resize) via a 3×3 CSS grid host (was a flex column).
- `panels.setHidden(idOrEl, hidden)` / `isHidden(idOrEl)` — display-only show/hide, independent of collapse state, and persisted across reloads.
- `panels.setEnabledPositions(positions)` — lets the host gate which edges exist at all, relocating any panels docked to a disabled edge.
- Per-panel `allowedPositions` on `register`/`create` — a panel can constrain which edges it accepts (intersected with the host's enabled positions).
- `list()` now also returns `hidden` and `title` per panel.

---

## [0.14.0] - 2026-06-24

### Added
- Empty docks now keep their accent chrome bar visible (as a drag target) as long as any panel exists elsewhere in the layout — previously an empty dock's bar disappeared entirely, making it impossible to drag a panel back into it.

### Changed
- Dock chrome bar thickened from 8px to 10px for an easier drag/click target.

### Fixed
- Bricks' preview width-reset regression: as a flex item, the iframe wrapper was shrink-wrapping to the iframe's ~320px min-content size on a responsive-width reset. Fixed with `align-self:stretch` (full width when width is `auto`) + `margin-inline:auto` (so an explicit responsive width still centers correctly).

---

## [0.13.0] - 2026-06-23

Version-sync only — no functional change (a package.json version correction to match the already-published tag).

---

## [0.12.0] - 2026-06-23

### Added
- Whole-header drag: the entire panel header is now the drag handle (the small grip icon is just a visual cue, not the only draggable area). A drag only begins past a 4px movement threshold, so a plain click on the header (or one of its interactive controls) still registers as a click, not an accidental drag.
- Panel body scrollbars now match the Bricks builder UI look (thin, accent-colored thumb on a `bg-3` track, 8px) via the `--builder-*` CSS variables, instead of the browser's default scrollbar styling.
- README gained a copy-paste console snippet so integrating developers can drop in demo panels and try drag/resize/close immediately without writing any code.

---

## [0.11.0] - 2026-06-23

### Changed
- `onCollapseChange` moved from a single slot on the dock to being stored per-panel on the registry entry. Every panel sharing a dock is now notified on collapse/expand (not just one), and the callback correctly travels with a panel across a cross-dock drag-and-drop move.

---

## [0.10.0] - 2026-06-23

### Added
- Comprehensive public-facing README (why/how, install, full API reference, persistence model, theming, CSS class reference, multi-plugin cooperation model, known limitations) and a GPL-2.0 `LICENSE`, in preparation for the package's own public repo.

---

## [0.1.0] - 2026-06-23

### Added
- Initial release: a standalone, dependency-free dock/registry engine (`window.BRX_Common.panels`) replacing the old bespoke "shrink the iframe's inline height" approach that collided with Bricks' own inline-height writes and with other plugins doing the same thing.
- Flex-column layout via one injected `!important` stylesheet (beats Bricks' inline wrapper height with no observer arms-race). Top/bottom dock containers, container-owned drag-resize, panels fill their dock, layout persisted to `localStorage` keyed by panel id, idempotent bootstrap (safe if multiple plugins load the same script).
