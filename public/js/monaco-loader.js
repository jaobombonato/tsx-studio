/* ============================================================
   TSX Studio PRO – Monaco Loader FINAL (CDN v0.55.1)
============================================================ */

window.MonacoEnvironment = {
  getWorker: function (_, label) {
    const cdn = "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs";

    let url = "";

    if (label === "json") url = `${cdn}/language/json/json.worker.js`;
    else if (label === "css") url = `${cdn}/language/css/css.worker.js`;
    else if (label === "html") url = `${cdn}/language/html/html.worker.js`;
    else if (label === "typescript" || label === "ts")
      url = `${cdn}/language/typescript/ts.worker.js`;
    else
      url = `${cdn}/editor/editor.worker.js`;

    return new Worker(URL.createObjectURL(new Blob([`
      importScripts("${url}");
    `], { type: "text/javascript" })));
  }
};

require.config({
  waitSeconds: 20,
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs"
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

  console.log("%c[TSX PRO] Monaco Editor carregado via CDN!", "color: cyan");
});
