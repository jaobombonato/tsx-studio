TSX Studio Engine - Preview package
==================================

Contents:
- index.html (landing)
- editor.html (Monaco editor + Run button)
- assets/js/monaco-loader.js (loads Monaco via unpkg AMD)
- assets/js/preview-esbuild.js (engine: esbuild-wasm bundling and preview)

How to deploy:
1. Upload the folder to GitHub and connect to Vercel (or deploy static to any host).
2. Open /editor.html, type TSX in the editor and click 'Rodar'.
3. The engine will fetch esbuild-wasm from unpkg and esm.sh dependencies on-demand.

Notes:
- This is a minimal engine to run TSX in the browser. For production, host esbuild.wasm locally and add caching.
- Large projects may need VFS multi-file support (already scaffolded via files object in renderWithEsbuild signature).
