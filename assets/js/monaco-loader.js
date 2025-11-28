// Configuração do RequireJS para Monaco
require.config({
  paths: {
    "vs": "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs"
  }
});

// Configuração dos workers
window.MonacoEnvironment = {
  getWorkerUrl: function (_, label) {
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
      self.MonacoEnvironment = {
        baseUrl: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/"
      };
      importScripts("https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.js");
    `)}`;
  }
};
