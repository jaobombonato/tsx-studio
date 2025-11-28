// Loader oficial do Monaco para RequireJS

window.MonacoEnvironment = {
  getWorkerUrl: function (_, label) {
    const path = "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs";
    if (label === "json") return `${path}/language/json/json.worker.js`;
    if (label === "css") return `${path}/language/css/css.worker.js`;
    if (label === "html") return `${path}/language/html/html.worker.js`;
    if (label === "ts" || label === "typescript")
      return `${path}/language/typescript/ts.worker.js`;
    return `${path}/editor/editor.worker.js`;
  }
};

require.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs"
  }
});
