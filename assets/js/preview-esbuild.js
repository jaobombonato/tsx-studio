/*
  preview-esbuild.js — versão compatível
*/

const ESBUILD_VERSION = '0.17.19';
const ESBUILD_ESM = `https://unpkg.com/esbuild-wasm@${ESBUILD_VERSION}/esm/browser.js`;
const ESBUILD_WASM = `https://unpkg.com/esbuild-wasm@${ESBUILD_VERSION}/esbuild.wasm`;

async function loadEsbuild() {
  if (window.__esbuild) return window.__esbuild;
  const mod = await import(ESBUILD_ESM);
  await mod.initialize({ wasmURL: ESBUILD_WASM });
  window.__esbuild = mod;
  return mod;
}

function rewriteBareImports(code) {
  return code.replace(/from\s+['"]([^\.\/'"][^'"]*)['"]/g, (m, pkg) => {
    return `from "https://esm.sh/${pkg}"`;
  });
}

function makePlugin(files = {}) {
  return {
    name: "tsxstudio-plugin",
    setup(build) {
      build.onResolve({ filter: /^vfs:/ }, args => ({
        path: args.path,
        namespace: "vfs"
      }));

      build.onLoad({ filter: /.*/, namespace: "vfs" }, args => {
        const p = args.path.replace(/^vfs:/, "");
        const content = files[p];
        if (!content) return null;

        const isTS =
          p.endsWith(".ts") || p.endsWith(".tsx") ? "tsx" : "js";

        return { contents: content, loader: isTS };
      });

      build.onResolve({ filter: /^[^\.\/].*/ }, args => ({
        path: `https://esm.sh/${args.path}`,
        namespace: "http"
      }));

      build.onLoad({ filter: /.*/, namespace: "http" }, async args => {
        const res = await fetch(args.path);
        const text = await res.text();

        const loader = args.path.endsWith(".css")
          ? "css"
          : args.path.endsWith(".ts") || args.path.endsWith(".tsx")
          ? "tsx"
          : "js";

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
        resolveDir: "/",
        sourcefile: "App.tsx",
        loader: "tsx"
      },
      bundle: true,
      format: "esm",
      write: false,
      plugins: [makePlugin(files)],
      define: { "process.env.NODE_ENV": '"development"' }
    });

    const output = result.outputFiles[0].text;
    const blob = new Blob([output], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);

    const iframe = document.getElementById("previewFrame");

    iframe.srcdoc = `
      <html>
        <body style="margin:0;padding:0;">
          <div id="root"></div>

          <script type="module">
            import React from "https://esm.sh/react";
            import ReactDOM from "https://esm.sh/react-dom/client";

            import App from "${url}";

            ReactDOM.createRoot(
              document.getElementById("root")
            ).render(React.createElement(App));
          </script>
        </body>
      </html>
    `;

  } catch (err) {
    const iframe = document.getElementById("previewFrame");
    iframe.srcdoc =
      "<pre style='color:red;padding:20px;'>Erro: " + err + "</pre>";
    console.error(err);
  }
}

window.renderWithEsbuild = renderWithEsbuild;
