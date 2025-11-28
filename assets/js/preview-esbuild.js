/* ============================================================
   TSX STUDIO — preview-esbuild.js (VERSÃO CORRIGIDA FINAL)
   ============================================================ */

/* ------------------------------------------------------------
   1) Mapa fixo de versões (compatível com seu projeto offline)
------------------------------------------------------------ */
const FIXED_VERSIONS = {
  "react": "react@19.2.0",
  "react-dom": "react-dom@19.2.0",
  "lucide-react": "lucide-react@0.553.0",
  "react-hot-toast": "react-hot-toast@2.4.1",
  "zustand": "zustand@latest",
  "dayjs": "dayjs@latest",
  "clsx": "clsx@latest",
  "uuid": "uuid@latest",
};

/* ------------------------------------------------------------
   2) Resolver de imports — converte "react" → esm.sh
------------------------------------------------------------ */
function resolveBareImports(code) {
  return code.replace(/from\s+["']([^"']+)["']/g, (m, pkg) => {
    if (FIXED_VERSIONS[pkg]) {
      return `from "https://esm.sh/${FIXED_VERSIONS[pkg]}"`;
    }

    if (pkg.startsWith(".") || pkg.startsWith("/") || pkg.startsWith("https://")) {
      return `from "${pkg}"`;
    }

    return `from "https://esm.sh/${pkg}"`;
  });
}

/* ------------------------------------------------------------
   3) Inicialização ESBUILD
------------------------------------------------------------ */
async function initEsbuild() {
  try {
    if (window.esbuild?.initialize) return window.esbuild;

    await import("https://unpkg.com/esbuild-wasm@0.19.8/esbuild-wasm.min.js");

    await window.esbuild.initialize({
      wasmURL: "https://unpkg.com/esbuild-wasm@0.19.8/esbuild.wasm",
      worker: true,
    });

    return window.esbuild;
  } catch (err) {
    console.warn("[preview] esbuild falhou:", err);
    return null;
  }
}

/* ------------------------------------------------------------
   4) Compilação com esbuild — TSX → ESM JS
------------------------------------------------------------ */
async function compileWithEsbuild(code) {
  const esb = await initEsbuild();
  if (!esb) throw new Error("esbuild indisponível (fallback será usado)");

  const resolved = resolveBareImports(code);

  const result = await esb.transform(resolved, {
    loader: "tsx",
    target: "es2022",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    sourcemap: "inline",
  });

  return result.code;
}

/* ------------------------------------------------------------
   5) Fallback — @babel/standalone
------------------------------------------------------------ */
async function compileWithBabel(code) {
  if (!window.Babel) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/@babel/standalone/babel.min.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const resolved = resolveBareImports(code);

  const out = window.Babel.transform(resolved, {
    presets: [
      ["typescript", { allExtensions: true, isTSX: true }],
      ["react", { runtime: "automatic" }],
    ],
    filename: "App.tsx",
  });

  return out.code;
}

/* ------------------------------------------------------------
   6) Compilador final
------------------------------------------------------------ */
async function compileTSX(code) {
  try {
    return await compileWithEsbuild(code);
  } catch (err) {
    console.warn("[preview] esbuild falhou, Babel ativado", err);
    return await compileWithBabel(code);
  }
}

/* ------------------------------------------------------------
   7) Criar blob ESM
------------------------------------------------------------ */
function createModuleBlobUrl(compiledCode) {
  const wrapped = `
${compiledCode}
export default (typeof exports !== 'undefined' && exports.default)
  || (typeof module !== 'undefined' && module.exports?.default)
  || (window?.App)
  || undefined;
  `;

  const blob = new Blob([wrapped], { type: "text/javascript" });
  return URL.createObjectURL(blob);
}

/* ------------------------------------------------------------
   8) Criar iframe.srcdoc
------------------------------------------------------------ */
function createPreviewSrcdoc(moduleUrl) {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0">
<div id="root"></div>

<script type="module">
  window.addEventListener('error', e => {
    parent.postMessage({type:"preview-error", message:e.message, stack:e.error?.stack}, "*");
  });

  window.addEventListener('unhandledrejection', e => {
    parent.postMessage({type:"preview-error", message:String(e.reason)}, "*");
  });

  const React = await import("https://esm.sh/react@19");
  const ReactDOM = await import("https://esm.sh/react-dom@19");

  const mod = await import("${moduleUrl}");
  const App = mod.default;

  if (!App) {
    parent.postMessage({type:"preview-error", message:"Nenhum App exportado"}, "*");
  } else {
    ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
  }
</script>

</body>
</html>`;
}

/* ------------------------------------------------------------
   9) FUNÇÃO PRINCIPAL — SEM EXPORT (CORRIGIDO)
------------------------------------------------------------ */
async function renderWithEsbuild(input) {
  try {
    const compiled = await compileTSX(input);
    const moduleUrl = createModuleBlobUrl(compiled);

    const iframe = document.getElementById("previewFrame");
    iframe.sandbox = "allow-scripts allow-same-origin allow-modals";
    iframe.srcdoc = createPreviewSrcdoc(moduleUrl);

    iframe.onload = () => URL.revokeObjectURL(moduleUrl);

  } catch (err) {
    console.error("[preview] erro:", err);
    alert("Erro no preview: " + err.message);
  }
}

/* ------------------------------------------------------------
   10) Expor função globalmente (CORRETO)
------------------------------------------------------------ */
window.renderWithEsbuild = async (code) => {
  return await renderWithEsbuild(code);
};
