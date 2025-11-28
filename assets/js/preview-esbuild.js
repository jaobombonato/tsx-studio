/*
  preview-esbuild.js
  Motor do TSX Studio — versão corrigida para expor React globalmente no iframe.
*/

const ESBUILD_VERSION = '0.17.19';
const ESBUILD_ESM = `https://unpkg.com/esbuild-wasm@${ESBUILD_VERSION}/esm/browser.js`;
const ESBUILD_WASM = `https://unpkg.com/esbuild-wasm@${ESBUILD_VERSION}/esbuild.wasm`;

async function loadEsbuild() {
  if (window.__esbuild) return window.__esbuild;
  const module = await import(ESBUILD_ESM);
  await module.initialize({ wasmURL: ESBUILD_WASM });
  window.__esbuild = module;
  return module;
}

function rewriteBareImports(code) {
  return code.replace(/from\s+['"]([^\.\/'"][^'"]*)['"]/g, (m, pkg) => {
    return `from "https://esm.sh/${pkg}"`;
  });
}

function makePlugin(files = {}) {
  return {
    name: 'vfs-and-resolve',
    setup(build) {
      build.onResolve({ filter: /^vfs:/ }, args => ({
        path: args.path,
        namespace: 'vfs'
      }));

      build.onLoad({ filter: /.*/, namespace: 'vfs' }, args => {
        const path = args.path.replace(/^vfs:/, '');
        if (files[path] !== undefined) {
          return {
            contents: files[path],
            loader: path.endsWith('.ts') || path.endsWith('.tsx') ? 'tsx' : 'js'
          };
        }
        return null;
      });

      build.onResolve({ filter: /^[^\.\/].*/ }, args => ({
        path: `https://esm.sh/${args.path}`,
        namespace: 'http'
      }));

      build.onLoad({ filter: /.*/, namespace: 'http' }, async args => {
        const res = await fetch(args.path);
        if (!res.ok) throw new Error('Failed to fetch ' + args.path);
        const text = await res.text();

        const loader =
          args.path.endsWith('.css')
            ? 'css'
            : args.path.endsWith('.ts') || args.path.endsWith('.tsx')
            ? 'tsx'
            : 'js';

        return { contents: text, loader };
      });
    }
  };
}

export async function renderWithEsbuild(entryCode, files = {}) {
  try {
    const esbuild = await loadEsbuild();
    const entry = rewriteBareImports(entryCode);

    const result = await esbuild.build({
      stdin: {
        contents: entry,
        resolveDir: '/',
        sourcefile: 'App.tsx',
        loader: 'tsx'
      },
      bundle: true,
      format: 'esm',
      write: false,
      plugins: [makePlugin(files)],
      define: { 'process.env.NODE_ENV': '"development"' },

      // Fix para JSX -> React.createElement
      jsxFactory: "React.createElement",
      jsxFragment: "React.Fragment"
    });

    const code = result.outputFiles[0].text;
    const blob = new Blob([code], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);

    const iframe = document.getElementById('previewFrame');

    // HTML do iframe: primeiro carregamos React e colocamos em window,
    // só depois importamos o bundle (blob) — assim o bundle encontra React.
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <script>window.DEBUG_TSX_STUDIO = true;</script>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@3.4.6/dist/tailwind.min.css">
        </head>
        <body style="margin:0;font-family:Inter,Arial,Helvetica">
          <div id="root"></div>

          <script type="module">
            (async () => {
              try {
                // 1) importa React e ReactDOM e expõe em window dentro do iframe
                const reactMod = await import("https://esm.sh/react");
                const reactDomMod = await import("https://esm.sh/react-dom/client");

                // esm.sh pode retornar default ou named; pegue o default quando existir
                const React = reactMod.default || reactMod;
                const ReactDOMClient = reactDomMod.default || reactDomMod;

                // Exponha como global no contexto do iframe
                window.React = React;
                window.ReactDOMClient = ReactDOMClient;

                // 2) agora importe o bundle (que pode usar React global)
                const AppModule = await import("${blobUrl}");
                const App = AppModule.default || AppModule.App;

                // 3) monte a aplicação usando React importado
                const root = ReactDOMClient.createRoot(document.getElementById("root"));
                root.render(React.createElement(App));
              } catch (err) {
                document.body.innerHTML =
                  '<pre style="color:red;padding:20px;">' + String(err) + '</pre>';
                console.error(err);
              }
            })();
          <\/script>
        </body>
      </html>
    `;
    iframe.srcdoc = html;

  } catch (err) {
    const iframe = document.getElementById('previewFrame');
    iframe.srcdoc =
      '<pre style="color:red;padding:20px;">Build failed: ' + String(err) + '</pre>';
    console.error('esbuild error', err);
  }
}

window.renderWithEsbuild = (c, f) => renderWithEsbuild(c, f);
