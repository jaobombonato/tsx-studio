// Monaco Editor no Vercel usando AMD loader correto

require.config({
    paths: {
        vs: "https://unpkg.com/monaco-editor@0.45.0/min/vs"
    }
});

window.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
        return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
            self.MonacoEnvironment = {
                baseUrl: 'https://unpkg.com/monaco-editor@0.45.0/min/'
            };
            importScripts('https://unpkg.com/monaco-editor@0.45.0/min/vs/base/worker/workerMain.js');`
        )}`;
    }
};

require(["vs/editor/editor.main"], function () {
    window.editor = monaco.editor.create(document.getElementById("editorContainer"), {
        value: `export default function App(){ return <h1>Hello TSX Studio!</h1> }`,
        language: "typescript",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false }
    });
});
