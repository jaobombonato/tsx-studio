/* ============================================================
   TSX Studio PRO – Monaco Loader FINAL (CORRIGIDO)
============================================================ */

window.MonacoEnvironment = {
  getWorker: function (_, label) {
    let url = "";

    // Caminho REAL no servidor Vercel
    const base = "/js/monaco/min/vs";

    if (label === "json") url = `${base}/language/json/json.worker.js`;
    else if (label === "css") url = `${base}/language/css/css.worker.js`;
    else if (label === "html") url = `${base}/language/html/html.worker.js`;
    else if (label === "typescript" || label === "ts") url = `${base}/language/typescript/ts.worker.js`;
    else url = `${base}/editor/editor.worker.js`;

    // Worker fix com blob (necessário no Vercel)
    return new Worker(URL.createObjectURL(new Blob([`
      importScripts("${url}");
    `], { type: "text/javascript" })));
  }
};

// Corrige carregamento de módulos Monaco via RequireJS
require.config({
  waitSeconds: 20,
  paths: {
    vs: "/js/monaco/min/vs"
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
