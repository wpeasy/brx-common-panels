/*
 * Easy Links - a load-order-safe content panel for brx-common-panels.
 *
 * Paste-ready demo: register a docked "Easy Links" card (header icon, a table
 * of links, a footer). Drop it into a snippet manager that runs in the Bricks
 * builder main window, or wrap it in <script>...</script>.
 *
 * IMPORTANT - keep this file pure ASCII. Some snippet managers mangle multi-byte
 * characters (emoji, em-dash, arrows) when they store/serve code inline, which
 * surfaces as "Uncaught SyntaxError: Invalid or unexpected token". Put glyphs in
 * the HTML strings as numeric entities (e.g. &#128279; for the link icon) and
 * keep comments to plain ASCII (-, ->). Do NOT paste raw emoji into this file.
 */
(function () {
    // onReady runs the callback once the registry is ready, whether this code
    // evaluates before OR after brx-common-panels loads.
    (window.BRX_Common = window.BRX_Common || {}).onReady = window.BRX_Common.onReady || [];

    window.BRX_Common.onReady.push(function (panels) {
        if (panels.list().some(function (p) { return p.id === 'easy-links'; })) return;

        // Header: HTML with an icon (entity keeps the JS source ASCII) + a title.
        var header =
            '<span style="margin-right:6px" aria-hidden="true">&#128279;</span>' +
            '<span>Easy Links</span>';

        // Body: a small table of links. Icons are numeric HTML entities.
        var links = [
            { label: 'Help',          url: 'https://example.com/help',      icon: '&#10068;'  },
            { label: 'Documentation', url: 'https://example.com/docs',      icon: '&#128216;' },
            { label: 'Resources',     url: 'https://example.com/resources', icon: '&#128230;' }
        ];

        var rows = links.map(function (l) {
            return '<tr><td class="el__i">' + l.icon + '</td>' +
                '<td><a href="' + l.url + '" target="_blank" rel="noopener noreferrer">' + l.label + '</a></td></tr>';
        }).join('');

        var body =
            '<table class="el"><tbody>' + rows + '</tbody></table>' +
            '<style>' +
                '.el{width:100%;border-collapse:collapse;font-size:13px}' +
                '.el td{padding:6px 8px;border-bottom:1px solid var(--builder-border,#3a3a3a)}' +
                '.el__i{width:1.5em;text-align:center;opacity:.8}' +
                '.el a{color:var(--builder-color-accent,#4ea1ff);text-decoration:none}' +
                '.el a:hover{text-decoration:underline}' +
            '</style>';

        panels.create({
            id: 'easy-links',          // stable id -> layout + hidden state persist
            position: 'bottom',        // bottom | top | left | right
            header: header,
            body: body,
            footer: 'Sample panel',
            defaultHeight: 200,
            closable: true,            // X in the header; hides + persists (closeMode defaults to 'hide')
            onClose: function () { console.log('[Easy Links] closed'); } // cleanup/logging hook only
        });
    });
})();
