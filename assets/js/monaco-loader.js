/* ============================================================
   TSX Studio PRO – Monaco Loader FINAL
============================================================ */

window.MonacoEnvironment = {
  getWorker: function (_, label) {
    let url = "";

    const base = "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs";

    if (label === "json") url = `${base}/language/json/json.worker.js`;
    else if (label === "css") url = `${base}/language/css/css.worker.js`;
    else if (label === "html") url = `${base}/language/html/html.worker.js`;
    else if (label === "typescript" || label === "ts") url = `${base}/language/typescript/ts.worker.js`;
    else url = `${base}/editor/editor.worker.js`;

    // Converte o worker remoto em blob local (WORKER FIX)
    return new Worker(URL.createObjectURL(new Blob([`
      importScripts("${url}");
    `], { type: "text/javascript" })));
  }
};

require.config({
  waitSeconds: 20, // evita timeout em 3G/WebView/Safari
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs"
  }
});

/* Inicialização REAL do editor */
require(["vs/editor/editor.main"], function () {
  const container = document.getElementById("editorContainer");

  if (!container) {
    console.error("[TSX PRO] ERRO: editorContainer não encontrado!");
    return;
  }

  window.editor = monaco.editor.create(container, {
    value: `export default function App(){ return <h1>Hello!</h1> }`,
    language: "typescript",
    theme: "vs-dark",
    automaticLayout: true,
    fontSize: 14,
    minimap: { enabled: false },
  });

  console.log("%c[TSX PRO] Monaco Editor carregado!", "color: cyan");
});
