// Loader oficial do Monaco para RequireJS

window.MonacoEnvironment = {
  getWorkerUrl: function (_, label) {
    const base = "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs";
    if (label === "json") return `${base}/language/json/json.worker.js`;
    if (label === "css") return `${base}/language/css/css.worker.js`;
    if (label === "html") return `${base}/language/html/html.worker.js`;
    if (label === "ts" || label === "typescript")
      return `${base}/language/typescript/ts.worker.js`;
    return `${base}/editor/editor.worker.js`;
  }
};

require.config({
  waitSeconds: 15, // evita timeout em 3G/WebView/Safari
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs"
  }
});
