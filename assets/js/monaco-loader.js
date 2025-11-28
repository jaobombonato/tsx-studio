require.config({
  paths: {
    "vs": "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs"
  }
});

require(["vs/editor/editor.main"], () => {
  window.editor = monaco.editor.create(
    document.getElementById("editorContainer"),
    {
      value: `export default function App(){ return <h1>Hello!</h1> }`,
      language: "typescript",
      theme: "vs-dark",
      fontSize: 14,
      minimap: { enabled: false }
    }
  );
});
