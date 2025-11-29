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
  "react": "react@18",
  "react-dom": "react-dom@18", 
  "lucide-react": "lucide-react",
  "react-hot-toast": "react-hot-toast",
  "zustand": "zustand",
  "dayjs": "dayjs",
  "clsx": "clsx",
  "uuid": "uuid"
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

      /* 3) Bare imports resolver - EXPRESSÃO CORRIGIDA */
      build.onResolve({ filter: /^[^./][^v/].*/ }, (args) => {
        console.log("🔧 [PLUGIN] Resolvendo bare import:", args.path);
        
        // Verificação extra para garantir que não é vfs
        if (args.path.startsWith("vfs:")) {
          return null;
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

      /* 4) HTTP loader - VERSÃO CORRIGIDA PARA ESM.SH */
build.onLoad({ filter: /.*/, namespace: "http" }, async (args) => {
  console.log("🔧 [PLUGIN] Carregando HTTP:", args.path);
  
  if (httpCache.has(args.path)) {
    return {
      contents: httpCache.get(args.path),
      loader: guessLoader(args.path)
    };
  }

  try {
    let finalUrl = args.path;
    let text = '';
    
    // CORREÇÃO: Limpa URLs problemáticas do esm.sh
    if (finalUrl.includes('esm.sh')) {
      // Remove URLs duplicadas e parâmetros problemáticos
      const cleanUrl = finalUrl
        .replace(/https:\/\/esm\.sh\/https:\/\/esm\.sh\//, 'https://esm.sh/')
        .replace(/\/(es2022|es2015)\//, '/')
        .replace(/\?[^]*$/, '?js');
      
      console.log("🔧 [PLUGIN] URL limpa:", cleanUrl);
      
      // Tenta várias estratégias em ordem
      const urlsToTry = [
        cleanUrl,
        cleanUrl.replace('?js', ''),
        `https://esm.sh/${cleanUrl.split('esm.sh/')[1]?.split('?')[0] || 'react'}?js`,
        finalUrl // fallback
      ];
      
      for (const url of urlsToTry) {
        try {
          console.log("🔧 [PLUGIN] Tentando URL:", url);
          const res = await fetch(url);
          if (res.ok) {
            text = await res.text();
            finalUrl = url;
            console.log("🔧 [PLUGIN] Sucesso com:", url);
            break;
          }
        } catch (e) {
          console.log("🔧 [PLUGIN] Falha com:", url, e.message);
          continue;
        }
      }
      
      if (!text) {
        throw new Error(`Não conseguiu carregar: ${args.path}`);
      }
      
      // CORREÇÃO CRÍTICA: Remove imports problemáticos do código
      text = text
        // Remove imports com paths quebrados
        .replace(/from\s+["']\/\/esm\.sh\/[^"']+["']/g, '')
        .replace(/from\s+["']\/[^"']+["']/g, '')
        // Corrige imports relativos problemáticos
        .replace(/export\s*\*\s*from\s+["'][^"']*lucide-react[^"']*["']/g, '// export removido')
        .replace(/export\s*\*\s*from\s+["'][^"']*react[^"']*["']/g, '// export removido');
      
    } else {
      // Para outras URLs, fetch normal
      const res = await fetch(finalUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    }
    
    httpCache.set(args.path, text);
    return { 
      contents: text, 
      loader: guessLoader(finalUrl) 
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
   6) BABEL FALLBACK — VERSÃO SUPER ROBUSTA
   ============================================================ */

async function babelCompile(code) {
  return new Promise((resolve, reject) => {
    // Verifica se Babel já está disponível
    if (window.Babel && typeof window.Babel.transform === 'function') {
      console.log("🔧 [BABEL] Usando Babel já carregado");
      try {
        const result = window.Babel.transform(code, {
          presets: [
            ["typescript", { allExtensions: true, isTSX: true }],
            ["react", { runtime: "automatic" }]
          ],
          filename: 'app.tsx'
        });
        resolve(result.code);
        return;
      } catch (error) {
        reject(error);
        return;
      }
    }

    // Se não tem Babel, carrega
    console.log("🔧 [BABEL] Carregando Babel...");
    
    // Remove scripts antigos do Babel se existirem
    const oldScripts = document.querySelectorAll('script[src*="babel"]');
    oldScripts.forEach(script => script.remove());
    
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@babel/standalone@7.23.6/babel.min.js';
    
    script.onload = () => {
      console.log("🔧 [BABEL] Script carregado, aguardando...");
      // Aguarda um pouco para o Babel inicializar
      setTimeout(() => {
        if (window.Babel && typeof window.Babel.transform === 'function') {
          console.log("🔧 [BABEL] Babel pronto!");
          try {
            const result = window.Babel.transform(code, {
              presets: [
                ["typescript", { allExtensions: true, isTSX: true }],
                ["react", { runtime: "automatic" }]
              ],
              filename: 'app.tsx'
            });
            resolve(result.code);
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error('Babel não inicializou corretamente'));
        }
      }, 500);
    };
    
    script.onerror = () => {
      console.error("🔧 [BABEL] Erro ao carregar script");
      reject(new Error('Falha ao carregar Babel'));
    };
    
    document.head.appendChild(script);
  });
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
    iframe.srcdoc = `<pre style="color:red;padding:20px;">ERRO FATAL ENGINE:\n${String(fatalError)}</pre>`;
  }
}

/* ------------------------------------------------------------
   11) Expor globalmente - VERSÃO COMPLETA E SEGURA
------------------------------------------------------------ */

window.renderWithEsbuild = async function(code, files) {
  console.log("🔧 [GLOBAL] Iniciando renderização");
  const iframe = document.getElementById("previewFrame");
  if (!iframe) {
    console.error("🔧 [GLOBAL] iframe não encontrado!");
    return;
  }

  try {
    // Código VFS
    let allCode = code || "";
    for (const k in files) allCode += "\n" + files[k];
    const isRN = shouldUseRNFake(allCode);
    
    console.log("🔧 [GLOBAL] Modo:", isRN ? "React Native" : "Web");

    let vfs = {};
    if (typeof code === "string" && code.includes("/// file:")) {
      vfs = parseMultiFile(code);
    } else if (Object.keys(files).length > 0) {
      vfs = { ...files };
    } else {
      vfs = { "App.tsx": code };
    }

    // Normalizar paths
    const normalized = {};
    for (const k in vfs) {
      normalized[k.replace(/^\/+/, "")] = vfs[k];
    }
    normalized["react-native-shim.js"] = RN_SHIM;

    // MODO REACT NATIVE FAKE
    if (isRN) {
      console.log("🔧 [GLOBAL] Usando modo React Native Fake");
      const entry = normalized["App.tsx"] || Object.values(normalized)[0];
      const compiled = await babelCompile(entry);
      const blob = new Blob([compiled], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      iframe.srcdoc = htmlForRN(url);
      return;
    }

    // MODO WEB COM ESBUILD
    console.log("🔧 [GLOBAL] Usando modo Web com ESBuild");
    const esbuild = await loadEsbuild();
    const entry = normalized["src/App.tsx"] ? "src/App.tsx" : normalized["App.tsx"] ? "App.tsx" : Object.keys(normalized)[0];
    
    console.log("🔧 [GLOBAL] Arquivo de entrada:", entry);

    try {
      const result = await esbuild.build({
        stdin: {
          contents: rewriteBareImports(`import App from "vfs:/${entry}"; export default App;`),
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

      console.log("🔧 [GLOBAL] Build ESBuild concluído!");
      const out = result.outputFiles[0].text;
      const blob = new Blob([out], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      iframe.srcdoc = htmlForWeb(url);

    } catch (buildError) {
      console.warn("🔧 [GLOBAL] ESBuild falhou, usando Babel:", buildError);
      const entrySrc = normalized[entry];
      const compiled = await babelCompile(entrySrc);
      const blob = new Blob([compiled], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      iframe.srcdoc = htmlForWeb(url);
    }

    } catch (fatalError) {
    console.error("🔧 [GLOBAL] Erro fatal:", fatalError);
    
    const fallbackHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@3/dist/tailwind.min.css" />
        <style>
          body { margin: 0; font-family: system-ui, sans-serif; padding: 20px; }
          .error-panel { 
            background: #fef2f2; 
            border: 1px solid #fecaca; 
            padding: 20px; 
            margin: 20px 0; 
            border-radius: 8px; 
            color: #dc2626;
          }
          .warning-panel { 
            background: #fffbeb; 
            border: 1px solid #fcd34d; 
            padding: 20px; 
            margin: 20px 0; 
            border-radius: 8px; 
            color: #92400e;
          }
          .code-panel {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 15px;
            border-radius: 6px;
            font-family: monospace;
            font-size: 12px;
            overflow: auto;
            max-height: 300px;
          }
        </style>
      </head>
      <body>
        <div class="warning-panel">
          <h2>⚠️ Erro de Compilação</h2>
          <p>O código não pôde ser compilado. Detalhes do erro:</p>
        </div>
        
        <div class="error-panel">
          <h3>${fatalError.name || 'Erro'}</h3>
          <p><strong>${fatalError.message || 'Erro desconhecido'}</strong></p>
          
          <details style="margin-top: 15px;">
            <summary>Ver stack trace completo</summary>
            <div class="code-panel">
${fatalError.stack || 'Nenhum stack trace disponível'}
            </div>
          </details>
          
          <details style="margin-top: 15px;">
            <summary>Ver código que causou o erro</summary>
            <div class="code-panel">
${code.substring(0, 2000).replace(/</g, '&lt;').replace(/>/g, '&gt;')}
            </div>
          </details>
        </div>

        <div style="margin-top: 20px; padding: 15px; background: #f0f9ff; border-radius: 8px;">
          <h4>💡 Soluções possíveis:</h4>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li>Verifique se todos os imports estão corretos</li>
            <li>Certifique-se de usar <code>export default</code> no componente principal</li>
            <li>Teste com um código mais simples primeiro</li>
          </ul>
        </div>
      </body>
      </html>
    `;
    
    iframe.srcdoc = fallbackHTML;
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
