window.renderPreview = function (compiledCode) {

    const iframe = document.getElementById("previewFrame");

    const html = `
    <html>
        <body>
            <div id="root"></div>

            <script type="module">
                import React from "https://esm.sh/react@18";
                import ReactDOM from "https://esm.sh/react-dom@18";

                const App = (function(){
                    ${compiledCode}
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
