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
                        ["react", { runtime: "automatic" }]
                    ]
                }).code;

                // Executa o JS compilado
                const App = (function(){
                    try {
                        let exports = {};
                        eval(compiled);
                        return exports.default || window.App;
                    } catch (err) {
                        document.body.innerHTML = '<pre style="color:red;">Erro no código: ' + err.message + '</pre>';
                        throw err;
                    }
                })();

                ReactDOM.createRoot(document.getElementById("root"))
                    .render(React.createElement(App));
            <\/script>

        </body>
    </html>
    `;

    iframe.srcdoc = html;
};
