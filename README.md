# brx-common-panels

> A tiny, dependency-free **dock manager** for [Bricks Builder](https://bricksbuilder.io/) add‑ons.
> Dock UI panels **above or below the preview iframe** in one shared, collision‑free way.

`brx-common-panels` gives every Bricks add‑on a single, official‑feeling place to put
persistent UI by the preview canvas — a CSS editor, a query inspector, a console, a
layout bar, etc. Instead of each plugin fighting over the iframe's height, there is **one
authoritative owner of the layout**, exposed on a shared `window.BRX_Common.panels`
namespace. Two plugins that both want a strip under the canvas now simply cooperate.

- **Zero dependencies**, ~12 KB, single IIFE. Builder‑editor only — **no front‑end footprint.**
- **Idempotent**: the first copy to load wins; an official Bricks‑provided registry (or another plugin's bundled copy) always wins if present.
- **Multi‑panel docks**: panels sit side‑by‑side (up to 3 per row, wrapping to a new row), with drag‑to‑resize dividers.
- **Drag‑and‑drop** panels between the top and bottom docks (and reorder within a dock).
- **Layout persistence** across reloads (position, order, width, height, collapsed).
- **Panel template** with header / body / footer slots, a drag grip, optional close button — so every plugin's panel looks consistent.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [How it works](#how-it-works)
- [Install](#install)
- [Quick start](#quick-start)
- [Concepts](#concepts)
- [API reference](#api-reference)
  - [`panels.create(options)`](#panelscreateoptions--templated-panel)
  - [`panels.register(el, options)`](#panelsregisterel-options--raw-element)
  - [`PanelHandle`](#panelhandle)
  - [`panels.unregister` / `list` / `on` / `recalc` / `version`](#other-methods)
- [Persistence](#persistence)
- [Styling &amp; theming](#styling--theming)
- [CSS class reference](#css-class-reference)
- [Cooperating with other plugins](#cooperating-with-other-plugins)
- [Known limitations](#known-limitations)
- [Build from source](#build-from-source)
- [License](#license)

---

## Why this exists

Bricks gives add‑ons no official hook for docking persistent UI next to the preview
canvas, so every plugin improvises — almost always by writing
`#bricks-builder-iframe-wrapper`'s height itself and shrinking the iframe. Those methods
**collide** the moment two are active (or one meets Bricks' / another add‑on's injected
toolbar): whoever writes the height last wins, and the other plugin's panel is clipped or
floats over the canvas. The result is layout bugs **no single plugin author can fix**,
because the conflict is structural.

`brx-common-panels` removes the conflict by making the layout a shared, single‑owner
contract. It is offered as a community bridge until/if Bricks ships an official version —
and because it's idempotent, it stands down automatically the moment a Bricks‑native
registry appears.

## How it works

The module injects **one** stylesheet that turns the iframe's container
(`#bricks-preview`) into a flex column and forces the iframe wrapper to fill it:

```css
#bricks-preview { display: flex; flex-direction: column; }
#bricks-builder-iframe-wrapper { flex: 1 1 auto !important; height: auto !important; min-height: 0 !important; }
```

Per the CSS cascade, an `!important` **author** rule beats a non‑important **inline**
style — so Bricks can keep writing its inline `height` and the iframe still fills the
remaining space. **No `calc()`, no per‑write `ResizeObserver`, no inline‑style war.** Dock
containers take their own (drag‑resizable) height; the iframe fills whatever's left.

---

## Install

The module ships as a single IIFE that publishes `window.BRX_Common.panels`. Load it in
the **builder main window** (not the preview iframe), early — e.g. from your plugin's PHP:

```php
add_action( 'wp_enqueue_scripts', function () {
    if ( ! function_exists( 'bricks_is_builder' ) || ! bricks_is_builder() ) {
        return;
    }
    // Main window only — the registry mutates #bricks-preview, which lives there.
    $is_iframe = function_exists( 'bricks_is_builder_iframe' ) && bricks_is_builder_iframe();
    if ( $is_iframe ) {
        return;
    }
    wp_enqueue_script(
        'brx-common-panels',
        plugins_url( 'assets/brx-common-panels.js', __FILE__ ),
        [],
        filemtime( __DIR__ . '/assets/brx-common-panels.js' ), // cache‑bust on rebuild
        false // load in <head> so it's ready before your panel code runs
    );
} );
```

Because the bootstrap is idempotent, **multiple plugins can each bundle their own copy**
and cooperate — first one to load wins, and they all talk to the same registry.

> **Tip:** always guard access — `window.BRX_Common?.panels?.create(...)` — since the
> script loads separately and may be absent on a partial boot or an older host.

---

## Quick start

The easiest path is `create()`, which builds a consistent header + body + (optional)
footer panel and registers it in one call:

```js
const { handle, header, body, footer } = window.BRX_Common.panels.create({
    id: 'my-plugin-panel',   // stable id → layout persists across reloads
    position: 'bottom',      // 'bottom' (default) | 'top'
    title: 'My Panel',       // or pass `header:` with your own HTML/Node
    body: '<p>Hello</p>',    // HTML string or a DOM node
    footer: 'Ready',         // optional footer (omit for none)
    defaultHeight: 280,
    onClose: () => myCleanup() // optional → adds a ✕ that runs cleanup + removes the panel
});

// `header`, `body`, `footer` are live containers — populate them any time:
const btn = document.createElement('button');
btn.textContent = 'Run';
header.appendChild(btn);

// Control the dock via the handle:
handle.setCollapsed(true);
handle.setHidden(true);   // hide this panel without unregistering
handle.unregister();      // remove it entirely
```

That's it — your panel docks below the canvas, shares the chrome (drag grip, resize/
collapse bar) with every other panel, and its layout survives reloads.

### Try it right now (console)

Open a page in the Bricks builder, then paste this into the **main‑window** dev console
(not the preview iframe) to drop a few demo panels in — drag their headers between docks,
drag the divider between them to resize, and click ✕ to close:

```js
BRX_Common.panels.create({ id:'demo-1', position:'top', title:'Panel One', body:'<p>Drag my header · resize the divider · ✕ to close</p>', footer:'footer one', onClose:()=>console.log('closed demo-1') });
BRX_Common.panels.create({ id:'demo-2', position:'top', title:'Panel Two', body:'<p>Two panels share the top dock — drag the divider between us.</p>', onClose:()=>console.log('closed demo-2') });
BRX_Common.panels.create({ id:'demo-3', position:'bottom', title:'Panel Three', body:'<p>I am in the bottom dock. Drag my header up to join the others.</p>', onClose:()=>console.log('closed demo-3') });

// Remove them again:
// ['demo-1','demo-2','demo-3'].forEach(id => BRX_Common.panels.unregister(id));
```

(Each `create()` is on one line so the body strings don't break when pasted.)

---

## Concepts

**Docks.** There are two docks — `top` and `bottom` — created lazily as siblings of the
iframe wrapper inside `#bricks-preview`. The **dock** is the vertical unit: it owns the
drag‑resize/collapse **bar** on its iframe‑facing edge, its **height**, and its
**collapsed** state.

**Panels fill; docks size.** A dock arranges its panels in **rows of up to 3**,
side‑by‑side and equal‑width by default; a 4th panel **wraps to a new row** and the dock
grows taller. Panels just fill their slot — they carry no resize chrome of their own. A
draggable **divider** between adjacent panels in a row resizes them horizontally.

**The bar.** A slim accent bar sits on each dock's iframe‑facing edge. **Click it** to
collapse the dock to just the bar; **drag it** to resize the dock's height.

**Dragging.** The **whole header** is a drag handle (a `⠿` grip at the far‑left hints at
it). Press and drag the header to move the panel to the other dock or reorder it within a
dock — a ghost follows the cursor and a placeholder shows where it will land. Presses on
interactive header controls (buttons, inputs, the close ✕) don't start a drag, and a plain
click never does (a drag only begins past a small movement threshold).

---

## API reference

Everything hangs off `window.BRX_Common.panels`.

### `panels.create(options)` → templated panel

Builds a consistent panel (Bricks builder colours, tight padding), registers it, and
returns the parts to populate. **Preferred** for new panels.

```ts
create(options?: PanelTemplateOptions): {
    handle: PanelHandle | null;  // null if the dock/registry wasn't ready
    el:     HTMLElement;         // the panel root (the registered element)
    header: HTMLElement;         // header slot — your controls go here
    body:   HTMLElement;         // body slot (scrollable)
    footer: HTMLElement | null;  // footer slot, or null when no `footer` was given
}
```

**`PanelTemplateOptions`** (extends [`RegisterOptions`](#registeroptions)):

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | – | Convenience title shown in the header (used when `header` is omitted). |
| `header` | `string \| Node` | – | Header content (HTML string or DOM node). Overrides `title`. |
| `body` | `string \| Node` | – | Body content. |
| `footer` | `string \| Node` | – | Optional footer content. Omit for no footer; pass `''` for an empty footer to populate later. |
| `className` | `string` | – | Extra class(es) on the panel root. |
| `flushBody` | `boolean` | `false` | Remove the body's padding so content (e.g. an editor) fills edge‑to‑edge. |
| `onClose` | `() => void` | – | When set, adds a ✕ to the header that runs this callback, then unregisters + removes the panel. |

### `panels.register(el, options)` → raw element

Registers an element you built yourself (full control, no template chrome). The element
fills its dock slot. Returns a [`PanelHandle`](#panelhandle) or `null`.

```ts
register(el: HTMLElement, options?: RegisterOptions): PanelHandle | null
```

#### `RegisterOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `position` | `'top' \| 'bottom'` | `'bottom'` | Which dock to place the panel in. A persisted position for this `id` wins. |
| `id` | `string` | auto | Stable id → enables layout persistence (position / order / width). Auto‑generated (and **not** persisted) if omitted. |
| `defaultHeight` | `number` | `300` | Initial dock height (px) when nothing is persisted. |
| `minHeight` | `number` | `80` | Resize clamp minimum (px). |
| `maxHeight` | `number` | 85% of preview | Resize clamp maximum (px). |
| `resizable` | `boolean` | `true` | Whether the dock shows its resize/collapse bar. |
| `defaultCollapsed` | `boolean` | `false` | Initial collapsed state when nothing is persisted. |
| `onCollapseChange` | `(collapsed: boolean) => void` | – | Fires whenever this panel's dock collapses/expands (and once with the restored state on register). Per‑panel — every panel in a shared dock is notified, and the callback travels with the panel across a drag‑and‑drop move. |

> **Note:** drag‑and‑drop, the grip, header/body/footer slots, the close button, and the
> footer are **template features** (`create()`). A bare `register()` element gets docking,
> resizing, collapsing and persistence, but no grip/template chrome.

### `PanelHandle`

Returned by `register()` (and inside `create()`'s result). Methods resolve the panel's
**current** dock, so they keep working after a drag‑and‑drop move to another dock.

| Member | Type | Description |
|---|---|---|
| `id` | `string` | The panel's id. |
| `position` | `'top' \| 'bottom'` | The panel's current dock (live getter). |
| `unregister()` | `() => void` | Remove the panel from its dock (leaves the element in the DOM for you to dispose). |
| `setHeight(px)` | `(number) => void` | Set the dock height (clamped). |
| `setCollapsed(c)` | `(boolean) => void` | Collapse the dock to just its bar / expand it. |
| `isCollapsed()` | `() => boolean` | Whether the dock is collapsed. |
| `setHidden(h)` | `(boolean) => void` | Hide/show **this panel** without unregistering. The dock only disappears (iframe reclaims the space) when **all** its panels are hidden. |
| `getHeight()` | `() => number` | Current dock height (px). |

### Other methods

| Member | Type | Description |
|---|---|---|
| `unregister(idOrEl)` | `(string \| HTMLElement) => void` | Remove a panel by id or element. |
| `list()` | `() => PanelInfo[]` | Snapshot: `{ id, el, position, height, collapsed }[]`. |
| `on('change', cb)` | `(cb) => () => void` | Subscribe to layout changes (register / unregister / move / resize / collapse). Returns an unsubscribe fn. |
| `recalc()` | `() => void` | Re‑assert the layout stylesheet (rarely needed — flex handles reflow). |
| `version` | `string` | Engine version, for feature detection. |

---

## Persistence

Layout is saved to `localStorage` under the key **`brx-common-panels`** and restored on
`register()` — keyed by the panel `id`. (Panels without an `id` are not persisted.) Shape:

```jsonc
{
  "panels": {
    "my-plugin-panel": { "position": "bottom", "order": 0, "width": 412 }
  },
  "docks": {
    "bottom": { "height": 280, "collapsed": false }
  }
}
```

- **Restore happens by id.** Whichever code re‑registers `my-plugin-panel` on the next load
  gets its dock, order and width back. Panels created ad‑hoc (no stable id) don't persist.
- **`width`** is a flex‑grow weight (a divider position). It's applied on restore; **adding
  a brand‑new panel** to a dock re‑equalises all widths.
- **Height & collapsed** are per‑dock.

---

## Styling &amp; theming

The chrome uses **Bricks builder CSS variables** (with sensible fallbacks), so panels match
the editor's theme automatically:

| Variable | Used for |
|---|---|
| `--builder-bg` | Panel body background |
| `--builder-color` | Panel text |
| `--builder-border` | Borders / dividers |
| `--builder-color-accent` | Drag bar, dividers (hover), drop indicators |
| `--bricks-bg-dark` | Header / footer strip background |
| `--bricks-color-light` | Header / footer text, bar chevron-area |

Every class is prefixed `brx-common-` so you can target or override anything from your own
stylesheet. The body padding can be removed per‑panel with `flushBody: true` (e.g. for a
full‑bleed editor).

## CSS class reference

| Class | Element |
|---|---|
| `.brx-common-host` | The flex host (the iframe wrapper's parent) |
| `.brx-common-dock` | A dock container (`[data-position="top\|bottom"]`, `[data-collapsed="true"]`) |
| `.brx-common-dock__bar` | The resize/collapse bar |
| `.brx-common-dock__chevron` | The collapse chevron inside the bar |
| `.brx-common-dock__row` | The flex row that holds the dock's panels |
| `.brx-common-dock__divider` | Draggable divider between two panels |
| `.brx-common-dock__placeholder` | Drop slot shown while dragging |
| `.brx-common-panel` | A templated panel root (`[data-brx-panel]`, `[data-brx-id]`) |
| `.brx-common-panel__grip` | The `⠿` drag grip |
| `.brx-common-panel__header` / `__footer` | Header / footer strips |
| `.brx-common-panel__title` | The title span |
| `.brx-common-panel__close` | The ✕ close button |
| `.brx-common-panel__body` (`--flush`) | The (scrollable) body |
| `.brx-common-panel__ghost` | The drag ghost that follows the cursor |

---

## Cooperating with other plugins

The bootstrap is **idempotent**:

```js
if (window.BRX_Common && window.BRX_Common.panels) return; // someone already provides it
```

So you can bundle this module today and it will:

1. **Win** if it's the first registry to load — every other plugin's bundled copy stands down and registers against yours.
2. **Stand down** if another copy (or a future Bricks‑native `BRX_Common.panels`) loaded first.

Either way, all panels from all plugins share one dock manager. Use **stable, namespaced
ids** (e.g. `myplugin-css`) so your persisted layout never clashes with another plugin's.

---

## Known limitations

- **Widths reset on add / move.** Dragging a panel into a dock, or registering a brand‑new
  panel, re‑equalises that dock's widths (by design). Divider resizes persist until the
  panel set changes.
- **One bar per dock.** Collapse and height are dock‑level, so all panels in a dock collapse
  and resize (vertically) together. Horizontal divider resize is per‑panel.

---

## Build from source

```bash
npm install
npm run build       # → dist/brx-common-panels.js  (readable IIFE)
npm run build:min   # → dist/brx-common-panels.min.js
```

Source is a single TypeScript file (`src/index.ts`) bundled to an IIFE with
[esbuild](https://esbuild.github.io/). No runtime dependencies.

---

## License

GPL‑2.0‑or‑later. See [LICENSE](./LICENSE).
