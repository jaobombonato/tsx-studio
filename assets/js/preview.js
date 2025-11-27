window.renderPreview = function (tsxCode) {
    const iframe = document.getElementById("previewFrame");

    const html = `
    <html>
    <body>
        <div id="root"></div>

        <!-- Babel dentro do IFRAME -->
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>

        <script type="module">
            import React from "https://esm.sh/react@18";
            import ReactDOM from "https://esm.sh/react-dom@18";

            // Compila TSX dentro do iframe
            const compiled = Babel.transform(\`${tsxCode}\`, {
                presets: [
                    ["typescript", { allExtensions: true, isTSX: true }],
                    ["react", { runtime: "classic" }]
                ],
                plugins: ["transform-modules-commonjs"]  // ← ESSENCIAL!
            }).code;

            let exports = {};
            try {
                eval(compiled);
            } catch (err) {
                document.body.innerHTML = '<pre style="color:red;font-size:18px;">Erro no código: ' + err.message + '</pre>';
                throw err;
            }

            const App = exports.default;

            ReactDOM.createRoot(document.getElementById("root"))
                .render(React.createElement(App));
        <\/script>

    </body>
    </html>
    `;

    iframe.srcdoc = html;
};
