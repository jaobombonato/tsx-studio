/* ============================================================
   TSX Studio PRO – Monaco Loader FINAL
============================================================ */

window.MonacoEnvironment = {
  getWorkerUrl: function (_, label) {
    const base = "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs";
    if (label === "json") return `${base}/language/json/json.worker.js`;
    if (label === "css") return `${base}/language/css/css.worker.js`;
    if (label === "html") return `${base}/language/html/html.worker.js`;
    if (label === "typescript" || label === "ts")
      return `${base}/language/typescript/ts.worker.js`;
    return `${base}/editor/editor.worker.js`;
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
    minimap: { enabled: false }
  });

  console.log("%c[TSX PRO] Monaco Editor carregado!", "color: cyan");
});
