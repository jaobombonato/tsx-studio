window.renderPreview = function (userCode) {

    const iframe = document.getElementById("previewFrame");

    const html = `
    <html>
        <body>
            <div id="root"></div>

            <!-- Babel dentro do iframe -->
            <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>

            <script type="module">
                import React from "https://esm.sh/react@18";
                import ReactDOM from "https://esm.sh/react-dom@18";

                // Compila o TSX do usuário
                const compiled = Babel.transform(${JSON.stringify(
                    String.raw`${userCode}`
                )}, {
                    presets: [
                        ["typescript", { allExtensions: true, isTSX: true }],
                        ["react", { runtime: "automatic" }]
                    ]
                }).code;

                // Executa o código compilado
                const App = (function(){
                    ${'${compiled}'}
                    return exports.default || module.exports || window.App;
                })();

                ReactDOM.createRoot(document.getElementById("root"))
                    .render(React.createElement(App));
            <\/script>

        </body>
    </html>
    `;

    iframe.srcdoc = html;
};
