/* ============================================================
   TSX Studio Engine PRO — v1.5
   Web + React Native Fake (Híbrido)
   ESBuild + Babel fallback
   ZIP + VFS + resolver npm pinado
   Compatível com qualquer app grande de IA
   ============================================================ */

/* -------------------------------------------
   0) CONFIG / GLOBALS
------------------------------------------- */

const ESBUILD_VERSION = "0.19.5";
const ESBUILD_ESM = "/js/esbuild/browser.js";
const ESBUILD_WASM = "/js/esbuild/esbuild.wasm";

const httpCache = new Map();

/* Fix de versões de pacotes problemáticos */
const FIXED_VERSIONS = {
  "react": "react@18.2.0",
  "react-dom": "react-dom@18.2.0",
  "lucide-react": "lucide-react@0.368.0",
  "react-hot-toast": "react-hot-toast@2.4.1",
  "zustand": "zustand@latest",
  "dayjs": "dayjs@latest",
  "clsx": "clsx@latest",
  "uuid": "uuid@latest"
};

/* -------------------------------------------
   1) Load ESBuild (SAFE SINGLETON) — PATCH FINAL
------------------------------------------- */

let __esbuildInstance = null;
async function loadEsbuild() {
  try {
    // Já carregado? retorna imediatamente
    if (__esbuildInstance) return __esbuildInstance;
    // Carrega apenas UMA VEZ
    const mod = await import(ESBUILD_ESM);
    // Evita reinit loop/reimport loop
    if (!mod.initialized) {
      await mod.initialize({
        wasmURL: ESBUILD_WASM,
        worker: false
      });
      mod.initialized = true;
    }
    __esbuildInstance = mod;
    return mod;
  } catch (err) {
    console.error("[TSX PRO] Erro ao carregar ESBuild:", err);
    throw err;
  }
}


/* -------------------------------------------
   2) HEURÍSTICA — RN FAKE x WEB
------------------------------------------- */

function shouldUseRNFake(code) {
  const c = code.toLowerCase();

  if (c.includes(`from "react-native"`) || c.includes(`from 'react-native'`))
    return true;

  if (
    /<div\b/i.test(c) ||
    /<section\b/i.test(c) ||
    /<p\b/i.test(c) ||
    /<h1\b/i.test(c) ||
    /<span\b/i.test(c)
  ) return false;

  if (
    /<view\b/i.test(c) ||
    /<text\b/i.test(c) ||
    /<scrollview\b/i.test(c) ||
    /<flatlist\b/i.test(c)
  ) return true;

  if (/stylesheet\.create\s*\(/i.test(c)) return true;

  return false;
}

/* -------------------------------------------
   3) RN FAKE SHIM
------------------------------------------- */

const RN_SHIM = `
  import React from "https://esm.sh/react@18.2.0";

  export const View = (p={}) =>
    React.createElement("div", { ...p, style: p.style }, p.children);

  export const Text = (p={}) =>
    React.createElement("span", { ...p, style: p.style }, p.children);

  export const Image = (p={}) => {
    let src = p.source?.uri || p.source || "";
    return React.createElement("img", { src, style: p.style });
  };

  export const ScrollView = (p={}) =>
    React.createElement("div", { style: { overflowY: "auto", ...p.style } }, p.children);

  export const TouchableOpacity = (p={}) =>
    React.createElement("button", { onClick: p.onPress, style: p.style }, p.children);

  export const FlatList = (p={}) => {
    const { data = [], renderItem } = p;
    return React.createElement(
      "div",
      {},
      data.map((item, i) => renderItem({ item, index: i }))
    );
  };

  export const StyleSheet = { create: (o) => o };

  export default {
    View, Text, Image, ScrollView,
    TouchableOpacity, FlatList, StyleSheet
  };
`;
/* ============================================================
   4) REWRITE DE IMPORTS (AUTO-FIX, VERSION PINNING)
   ============================================================ */

function rewriteBareImports(code) {
  return code.replace(/from\s+['"]([^'"]+)['"]/g, (match, pkg) => {

    /* 1) URLs absolutas ficam como estão */
    if (pkg.startsWith("http")) return `from "${pkg}"`;

    /* 2) VFS NÃO pode ser modificado */
    if (pkg.startsWith("vfs:")) return `from "${pkg}"`;

    /* 3) imports relativos NÃO são reescritos */
    if (pkg.startsWith(".") || pkg.startsWith("/"))
      return `from "${pkg}"`;

    /* 4) alias "@/"" mantém */
    if (pkg.startsWith("@/")) return `from "${pkg}"`;

    /* 5) React Native — shim automático */
    if (pkg === "react-native" || pkg.startsWith("react-native/"))
      return `from "${pkg}"`;

    /* 6) FIX AUTOMÁTICO DE VERSÃO — pacote mapeado */
    if (FIXED_VERSIONS[pkg]) {
      return `from "https://esm.sh/${FIXED_VERSIONS[pkg]}"`;
    }

    /* 7) fallback geral — usar @latest */
    return `from "https://esm.sh/${pkg}@latest"`;
  });
}

/* ============================================================
   5) PLUGIN VFS + FETCH npm
   ============================================================ */

function makePlugin(files = {}) {
  return {
    name: "tsxstudio-vfs-pro",
    setup(build) {

      /* VFS → resolve */
      build.onResolve({ filter: /^vfs:/ }, args => ({
        path: args.path,
        namespace: "vfs"
      }));

      /* VFS → load */
      build.onLoad({ filter: /.*/, namespace: "vfs" }, args => {
        const p = args.path.replace(/^vfs:\/*/, "");

        /* shim react-native */
        if (p === "react-native-shim.js") {
          return { contents: RN_SHIM, loader: "js" };
        }

        if (files[p] !== undefined) {
          const loader = p.endsWith(".tsx") || p.endsWith(".ts") ? "tsx"
            : p.endsWith(".css") ? "css"
            : "js";
          return { contents: files[p], loader };
        }

        return null;
      });

      /* Bare imports → esm.sh */
      build.onResolve({ filter: /^[^./].*/ }, args => {
        if (args.path.startsWith("vfs:"))
          return { path: args.path, namespace: "vfs" };

        /* Se tiver versão fixa, aplica */
        if (FIXED_VERSIONS[args.path]) {
          return {
            path: `https://esm.sh/${FIXED_VERSIONS[args.path]}`,
            namespace: "http"
          };
        }

        return {
          path: `https://esm.sh/${args.path}@latest`,
          namespace: "http"
        };
      });

      /* HTTP loader (esm.sh) */
      build.onLoad({ filter: /.*/, namespace: "http" }, async args => {
        const url = args.path;

        if (httpCache.has(url)) {
          return {
            contents: httpCache.get(url),
            loader: guessLoader(url)
          };
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error("Fetch falhou: " + url);

        const text = await res.text();
        httpCache.set(url, text);

        return { contents: text, loader: guessLoader(url) };
      });

    }
  };
}

function guessLoader(url) {
  if (url.endsWith(".css")) return "css";
  if (url.endsWith(".ts") || url.endsWith(".tsx")) return "tsx";
  return "js";
}

/* ============================================================
   6) BABEL FALLBACK — SEMPRE DISPONÍVEL NO IFRAME
   ============================================================ */

async function ensureBabelInIframe(doc) {
  return new Promise((resolve) => {
    const script = doc.createElement("script");
    script.src = "https://unpkg.com/@babel/standalone/babel.min.js";
    script.onload = () => resolve(true);
    doc.head.appendChild(script);
  });
}

async function babelCompile(code) {
  if (!window.Babel) {
    await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/@babel/standalone/babel.min.js";
      s.onload = resolve;
      document.head.appendChild(s);
    });
  }

  const result = Babel.transform(code, {
    presets: [
      ["typescript", { allExtensions: true, isTSX: true }],
      ["react", { runtime: "automatic" }]
    ]
  });

  return result.code;
}
/* ============================================================
   7) MULTI-FILE PARSER (/// file:)
   ============================================================ */
function parseMultiFile(text) {
  const parts = text.split(/(?=^\/\/\/\s*file:\s*)/m);
  const files = {};

  for (const p of parts) {
    const m = p.match(/\/\/\/\s*file:\s*([^\r\n]+)/);
    if (m) {
      const path = m[1].trim().replace(/^\/+/, "");
      const content = p.replace(m[0], "").replace(/^\n/, "");
      files[path] = content;
    }
  }

  if (Object.keys(files).length === 0) {
    files["App.tsx"] = text;
  }

  return files;
}

/* ============================================================
   8) HTML PARA WEB — React + ReactDOM + Babel no iframe
   ============================================================ */
function htmlForWeb(bundleUrl) {
  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/tailwindcss@3/dist/tailwind.min.css" />
    </head>

    <body style="margin:0">
      <div id="root"></div>

      <script>
  // Babel precisa existir ANTES do módulo principal
  <script src="/js/monaco-loader.js"></script>
<script src="/js/babel.min.js"></script>

<script type="module">
  (async () => {
    try {
      /* React e ReactDOM (fixado 18.2.0 — manter por enquanto) */
      const reactMod = await import("https://esm.sh/react@18.2.0");
      const React = reactMod.default || reactMod;

      const domMod = await import("https://esm.sh/react-dom@18.2.0/client");
      const ReactDOMClient = domMod.default || domMod;

      window.React = React;
      window.ReactDOMClient = ReactDOMClient;

      /* Importar bundle */
      const AppModule = await import("${bundleUrl}");
      const App = AppModule.default || AppModule.App;

      /* Executar */
      ReactDOMClient.createRoot(document.getElementById("root"))
        .render(React.createElement(App));

    } catch (e) {
      document.body.innerHTML =
        '<pre style="color:red;padding:20px;">' + e + '</pre>';
      console.error(e);
    }
  })();
<\/script>
    </body>
  </html>`;
}

/* ============================================================
   9) HTML PARA RN-FAKE
   ============================================================ */
function htmlForRN(bundleUrl) {
  return `
  <html>
    <head>
      <meta charset="utf-8" />
    </head>

    <body style="margin:0">
      <div id="root"></div>

      <script type="module">
        (async () => {
          try {
            await import("https://unpkg.com/@babel/standalone/babel.min.js");

            const reactMod = await import("https://esm.sh/react@18.2.0");
            const React = reactMod.default || reactMod;

            const domMod = await import("https://esm.sh/react-dom@18.2.0/client");
            const ReactDOMClient = domMod.default || domMod;

            window.React = React;
            window.ReactDOMClient = ReactDOMClient;

            const AppModule = await import("${bundleUrl}");
            const App = AppModule.default || AppModule.App;

            try {
              ReactDOMClient.createRoot(document.getElementById("root"))
                .render(React.createElement(App));
            } catch (fallbackError) {
              const node = App();
              const root = document.getElementById("root");
              if (node && node.nodeType === 1) root.appendChild(node);
              else root.innerHTML = "RN shim retornou tipo inesperado.";
            }

          } catch (e) {
            document.body.innerHTML =
              '<pre style="color:red;padding:20px;">' + e + '</pre>';
            console.error(e);
          }
        })();
      <\/script>
    </body>
  </html>`;
}
/* ============================================================
   10) ENGINE PRINCIPAL — renderWithEsbuild
   ============================================================ */

async function renderWithEsbuild(input, extraFiles = {}) {
  const iframe = document.getElementById("previewFrame");

  /* ------------------------------------------------------------
     Montar código completo para heurística
  ------------------------------------------------------------ */
  let allCode = input || "";
  for (const k in extraFiles) allCode += "\n" + extraFiles[k];

  const isRN = shouldUseRNFake(allCode);

  try {
    /* ------------------------------------------------------------
       Criar VFS final
    ------------------------------------------------------------ */
    let vfs = {};

    if (typeof input === "string" && input.includes("/// file:")) {
      vfs = parseMultiFile(input);
    } else if (Object.keys(extraFiles).length > 0) {
      vfs = { ...extraFiles };
    } else {
      vfs = { "App.tsx": input };
    }

    /* Normalizar paths */
    const normalized = {};
    for (const k in vfs) {
      normalized[k.replace(/^\/+/, "")] = vfs[k];
    }

    /* Incluir RN shim */
    normalized["react-native-shim.js"] = RN_SHIM;

    /* ------------------------------------------------------------
       MODO REACT NATIVE FAKE (sem esbuild)
    ------------------------------------------------------------ */
    if (isRN) {
      const entry = normalized["App.tsx"] || Object.values(normalized)[0];
      const compiled = await babelCompile(entry);

      const blob = new Blob([compiled], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);

      iframe.srcdoc = htmlForRN(url);
      return;
    }

    /* ------------------------------------------------------------
       MODO WEB — USANDO ESBUILD
    ------------------------------------------------------------ */
    const esbuild = await loadEsbuild();

    /* Detectar entry file */
    const entry =
      normalized["src/App.tsx"]
        ? "src/App.tsx"
        : normalized["App.tsx"]
        ? "App.tsx"
        : Object.keys(normalized)[0];

    try {
      /* Executar ESBuild */
      const result = await esbuild.build({
        stdin: {
          contents: rewriteBareImports(
            `import App from "vfs:/${entry}"; export default App;`
          ),
          loader: "tsx",
          resolveDir: "/",
          sourcefile: "entry.tsx",
        },
        bundle: true,
        write: false,
        format: "esm",
        plugins: [makePlugin(normalized)],
        define: {
          "process.env.NODE_ENV": '"development"',
        }
      });

      /* Bundle final */
      const out = result.outputFiles[0].text;
      const blob = new Blob([out], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);

      iframe.srcdoc = htmlForWeb(url);
      return;

    } catch (buildError) {
      /* ESBuild falhou → fallback para Babel */
      console.warn("[TSX PRO] ESBuild falhou, usando Babel:", buildError);

      const entrySrc = normalized[entry];
      const compiled = await babelCompile(entrySrc);
      const blob = new Blob([compiled], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);

      iframe.srcdoc = htmlForWeb(url);
      return;
    }

  } catch (fatalError) {
    iframe.srcdoc =
      `<pre style="color:red;padding:20px;">ERRO FATAL ENGINE:\n${String(
        fatalError
      )}</pre>`;
    console.error("[TSX PRO] ERRO FATAL:", fatalError);
  }
}

/* ------------------------------------------------------------
   11) Expor globalmente
------------------------------------------------------------ */

window.renderWithEsbuild = (code, files) =>
  renderWithEsbuild(code, files);
/* ============================================================
   12) SUPORTE A ARQUIVOS DE ASSETS (json, svg, png, jpg, md)
   ============================================================ */

/*
O TSX Studio PRO interpreta automaticamente:
- import data from "./data.json"
- import logo from "./logo.svg"
- import icon from "./img.png"

E converte para strings base64 OU texto puro,
dependendo da extensão.
*/

async function loadAsset(url, type) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao carregar asset: " + url);

  if (type === "json") {
    return await res.json();
  }

  if (type === "text" || type === "svg" || type === "md") {
    return await res.text();
  }

  if (type === "img") {
    const blob = await res.blob();
    return await blobToBase64(blob);
  }

  return null;
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

/* 
Expomos para debug futuro:
window.TSX_LoadAsset("imagem.png", "img")
*/
window.TSX_LoadAsset = loadAsset;

/* ============================================================
   13) LOGS MAIS BONITOS NO PREVIEW (debug opcional)
   ============================================================ */

(function injectConsoleProxy() {
  const original = console.log;

  console.log = (...args) => {
    original.apply(console, args);

    try {
      const iframe = document.getElementById("previewFrame");
      if (!iframe) return;

      const win = iframe.contentWindow;
      if (!win) return;

      if (!win.__TSX_CONSOLE_LOG__) return;
      win.__TSX_CONSOLE_LOG__(args.map(String).join(" "));
    } catch (_) {}
  };
})();

/* ============================================================
   14) SUPPORT: Atualizar preview após ZIP
   ============================================================ */

window.TSX_RefreshPreview = function () {
  const code = window.editor ? window.editor.getValue() : "";
  if (!code) return;

  renderWithEsbuild(code, window.TSX_VFS || {});
};
/* ============================================================
   TSX Studio PRO v1.5 - ENGINE FINALIZADA
   Compatível com:
   - React Web
   - React Native Fake
   - ESBuild + Babel fallback
   - ZIP + VFS invisível
   - Multi-file via "/// file:"
   - Imports npm com version pinning
   - lucide-react / react-hot-toast / zustand / router
   - Assets (json/svg/png/md)
   - Projetos grandes de IA (Claude, Gemini, GPT, DeepSeek)
   ============================================================ */

console.log("%c[TSX PRO] Engine v1.5 carregada com sucesso!", "color:#4ade80;font-weight:bold;");
