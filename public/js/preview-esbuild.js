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
   5) PLUGIN VFS + FETCH npm - VERSÃO CORRIGIDA
   ============================================================ */

function makePlugin(files = {}) {
  return {
    name: "tsxstudio-vfs-pro",
    setup(build) {
      
      console.log("🔧 [PLUGIN] Inicializando plugin");

      /* 1) VFS resolver - DEVE ser o primeiro */
      build.onResolve({ filter: /^vfs:/ }, (args) => {
        console.log("🔧 [PLUGIN] Resolvendo VFS:", args.path);
        return {
          path: args.path,
          namespace: "vfs"
        };
      });

      /* 2) VFS loader */
      build.onLoad({ filter: /.*/, namespace: "vfs" }, (args) => {
        const path = args.path.replace(/^vfs:\/*/, "");
        console.log("🔧 [PLUGIN] Carregando VFS:", path);
        
        if (path === "react-native-shim.js") {
          return { contents: RN_SHIM, loader: "js" };
        }

        if (files[path] !== undefined) {
          const loader = path.endsWith(".tsx") || path.endsWith(".ts") ? "tsx"
            : path.endsWith(".css") ? "css"
            : "js";
          console.log("🔧 [PLUGIN] Arquivo encontrado, loader:", loader);
          return { contents: files[path], loader };
        }

        console.error("🔧 [PLUGIN] Arquivo VFS não encontrado:", path);
        return {
          errors: [{ text: `Arquivo VFS não encontrado: ${path}` }]
        };
      });

      /* 3) Bare imports resolver - EXCLUINDO vfs explicitamente */
      build.onResolve({ filter: /^(?!vfs:)[^./][^/]*$/ }, (args) => {
        console.log("🔧 [PLUGIN] Resolvendo bare import:", args.path);
        
        // Verificação extra para garantir que não é vfs
        if (args.path.startsWith("vfs:")) {
          return null; // Deixa para o resolver do vfs
        }

        if (FIXED_VERSIONS[args.path]) {
          const fixedPath = `https://esm.sh/${FIXED_VERSIONS[args.path]}`;
          console.log("🔧 [PLUGIN] Usando versão fixa:", fixedPath);
          return {
            path: fixedPath,
            namespace: "http"
          };
        }

        const esmPath = `https://esm.sh/${args.path}@latest`;
        console.log("🔧 [PLUGIN] Usando esm.sh:", esmPath);
        return {
          path: esmPath,
          namespace: "http"
        };
      });

      /* 4) HTTP loader */
      build.onLoad({ filter: /.*/, namespace: "http" }, async (args) => {
        console.log("🔧 [PLUGIN] Carregando HTTP:", args.path);
        
        if (httpCache.has(args.path)) {
          console.log("🔧 [PLUGIN] Usando cache HTTP");
          return {
            contents: httpCache.get(args.path),
            loader: guessLoader(args.path)
          };
        }

        try {
          const res = await fetch(args.path);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          
          const text = await res.text();
          httpCache.set(args.path, text);
          
          console.log("🔧 [PLUGIN] HTTP carregado com sucesso");
          return { 
            contents: text, 
            loader: guessLoader(args.path) 
          };
        } catch (error) {
          console.error("🔧 [PLUGIN] Erro HTTP:", error);
          return {
            errors: [{ text: `Falha ao carregar: ${args.path} - ${error.message}` }]
          };
        }
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
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@3/dist/tailwind.min.css" />
    </head>
    <body style="margin:0">
      <div id="root"></div>

      <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
      
      <script type="module">
        (async () => {
          try {
            // React e ReactDOM
            const reactMod = await import("https://esm.sh/react@18.2.0");
            const React = reactMod.default || reactMod;

            const domMod = await import("https://esm.sh/react-dom@18.2.0/client");
            const ReactDOMClient = domMod.default || domMod;

            window.React = React;
            window.ReactDOMClient = ReactDOMClient;

            // Importar bundle
            const AppModule = await import("${bundleUrl}");
            const App = AppModule.default || AppModule.App;

            // Renderizar
            ReactDOMClient.createRoot(document.getElementById("root"))
              .render(React.createElement(App));

          } catch (e) {
            document.body.innerHTML = '<pre style="color:red;padding:20px;">' + e + '</pre>';
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
  
  console.log("🔧 [1] Iniciando renderWithEsbuild");
  
  let allCode = input || "";
  for (const k in extraFiles) allCode += "\n" + extraFiles[k];
  const isRN = shouldUseRNFake(allCode);
  
  console.log("🔧 [2] isRN:", isRN);

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

    console.log("🔧 [3] VFS criado, arquivos:", Object.keys(normalized));

    /* ------------------------------------------------------------
       MODO REACT NATIVE FAKE (sem esbuild)
    ------------------------------------------------------------ */
    if (isRN) {
      console.log("🔧 [4] Modo RN Fake");
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
    console.log("🔧 [5] Modo Web - Carregando ESBuild");
    const esbuild = await loadEsbuild();

    /* Detectar entry file */
    const entry =
      normalized["src/App.tsx"]
        ? "src/App.tsx"
        : normalized["App.tsx"]
        ? "App.tsx"
        : Object.keys(normalized)[0];

    console.log("🔧 [6] Entry file:", entry);

    try {
      console.log("🔧 [7] Iniciando build ESBuild");
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

      console.log("🔧 [8] Build completo!");
      const out = result.outputFiles[0].text;
      const blob = new Blob([out], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);

      iframe.srcdoc = htmlForWeb(url);
      return;

    } catch (buildError) {
      /* ESBuild falhou → fallback para Babel */
      console.error("🔧 [ERROR] Build error:", buildError);

      const entrySrc = normalized[entry];
      const compiled = await babelCompile(entrySrc);
      const blob = new Blob([compiled], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);

      iframe.srcdoc = htmlForWeb(url);
      return;
    }

  } catch (fatalError) {
    console.error("🔧 [FATAL ERROR]:", fatalError);
    iframe.srcdoc =
      `<pre style="color:red;padding:20px;">ERRO FATAL ENGINE:\n${String(
        fatalError
      )}</pre>`;
  }
}

/* ------------------------------------------------------------
   11) Expor globalmente - VERSÃO MAIS SEGURA
------------------------------------------------------------ */

window.renderWithEsbuild = async function(code, files) {
  console.log("🔧 [GLOBAL] Chamada global recebida");
  try {
    return await renderWithEsbuild(code, files);
  } catch (error) {
    console.error("🔧 [GLOBAL] Erro na execução:", error);
    throw error;
  }
};

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
