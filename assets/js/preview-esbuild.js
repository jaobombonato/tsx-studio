/* ============================================================
   TSX STUDIO ENGINE — v1.3 PRO
   ESBuild-wasm + VFS + ZIP + Resolver + Babel Fallback
   + React Native Fake Runtime (LMarena-style)
   + Heurística automática RN/Web
   ============================================================ */

/* -------------------------------------------
   0) CONFIG & GLOBALS
------------------------------------------- */

const ESBUILD_VERSION = '0.19.5';
const ESBUILD_ESM = `https://unpkg.com/esbuild-wasm@${ESBUILD_VERSION}/esm/browser.js`;
const ESBUILD_WASM = `https://unpkg.com/esbuild-wasm@${ESBUILD_VERSION}/esbuild.wasm`;

const httpCache = new Map();

/* -------------------------------------------
   1) LOAD ESBUILD (singleton)
------------------------------------------- */

async function loadEsbuild() {
  if (window.__esbuild) return window.__esbuild;
  const mod = await import(ESBUILD_ESM);
  await mod.initialize({ wasmURL: ESBUILD_WASM });
  window.__esbuild = mod;
  return mod;
}

/* -------------------------------------------
   2) DETECÇÃO AUTOMÁTICA DE MODO RN-FAKE
------------------------------------------- */

function shouldUseRNFake(code = '') {
  const low = code.toLowerCase();
  return (
    low.includes('from "react-native"') ||
    low.includes('from \'react-native\'') ||
    /<\s*view\b/i.test(code) ||
    /<\s*text\b/i.test(code) ||
    /stylesheet\.create\s*\(/i.test(code)
  );
}

/* -------------------------------------------
   3) RUNTIME RN-FAKE (base LMarena)
------------------------------------------- */

const RN_SHIM = `
  import React from "https://esm.sh/react";

  export const View = (p) => React.createElement("div", { ...p, style: p.style }, p.children);
  export const Text = (p) => React.createElement("span", { ...p, style: p.style }, p.children);

  export const Image = (p) => {
    let src = "";
    if (typeof p.source === "string") src = p.source;
    else if (p.source && p.source.uri) src = p.source.uri;
    return React.createElement("img", { src, style: p.style });
  };

  export const TouchableOpacity = (p) =>
    React.createElement("button", { onClick: p.onPress, style: p.style }, p.children);

  export const ScrollView = (p) =>
    React.createElement("div", { style: { overflowY: "auto", ...p.style } }, p.children);

  export const FlatList = (p) => {
    const { data = [], renderItem } = p || {};
    return React.createElement(
      "div",
      {},
      data.map((item, idx) => renderItem({ item, index: idx }))
    );
  };

  export const StyleSheet = { create: (o) => o };

  export default { View, Text, Image, TouchableOpacity, ScrollView, FlatList, StyleSheet };
`;

/* -------------------------------------------
   4) REWRITE IMPORTS (esm.sh) — NÃO mexer em vfs: / relativos
------------------------------------------- */

function rewriteBareImports(code) {
  return code.replace(/from\s+['"]([^'"]+)['"]/g, (m, pkg) => {
    if (
      pkg.startsWith('http') ||
      pkg.startsWith('vfs:') ||
      pkg.startsWith('.') ||
      pkg.startsWith('/') ||
      pkg.startsWith('@/') ||
      pkg === 'react-native' ||
      pkg.startsWith('react-native/')
    ) return `from "${pkg}"`;

    return `from "https://esm.sh/${pkg}"`;
  });
}

/* -------------------------------------------
   5) VFS + HTTP PLUGIN (imports internos + externos)
------------------------------------------- */

function makePlugin(files = {}) {
  return {
    name: "tsx-studio-vfs",
    setup(build) {

      build.onResolve({ filter: /^vfs:/ }, args => ({
        path: args.path,
        namespace: 'vfs'
      }));

      build.onLoad({ filter: /.*/, namespace: 'vfs' }, args => {
        const p = args.path.replace(/^vfs:\/*/, '');
        if (files[p] !== undefined) {
          const loader =
            p.endsWith('.tsx') || p.endsWith('.ts')
              ? 'tsx'
              : p.endsWith('.css')
              ? 'css'
              : 'js';
          return { contents: files[p], loader };
        }
        if (p === 'react-native-shim.js') {
          return { contents: RN_SHIM, loader: 'js' };
        }
        return null;
      });

      build.onResolve({ filter: /^[^./].*/ }, args => {
        if (args.path.startsWith('vfs:')) return { path: args.path, namespace: 'vfs' };
        return { path: `https://esm.sh/${args.path}`, namespace: 'http' };
      });

      build.onLoad({ filter: /.*/, namespace: 'http' }, async args => {
        const url = args.path;
        if (httpCache.has(url)) {
          return { contents: httpCache.get(url), loader: guessLoader(url) };
        }
        const res = await fetch(url);
        const txt = await res.text();
        httpCache.set(url, txt);
        return { contents: txt, loader: guessLoader(url) };
      });
    }
  };
}

function guessLoader(url) {
  if (url.endsWith('.css')) return 'css';
  if (url.endsWith('.ts') || url.endsWith('.tsx')) return 'tsx';
  return 'js';
}

/* -------------------------------------------
   6) BABEL FALLBACK (quando esbuild falha)
------------------------------------------- */

async function babelCompile(code) {
  if (!window.Babel) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/@babel/standalone/babel.min.js';
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const { code: out } = Babel.transform(code, {
    presets: [
      ["typescript", { allExtensions: true, isTSX: true }],
      ["react", { runtime: "automatic" }]
    ]
  });
  return out;
}

/* -------------------------------------------
   7) MULTI-FILE PARSER (/// file:)
------------------------------------------- */

function parseMultiFile(text) {
  const parts = text.split(/(?=^\/\/\/\s*file:\s*)/m);
  const files = {};
  for (const p of parts) {
    const m = p.match(/\/\/\/\s*file:\s*([^\r\n]+)/);
    if (m) {
      const path = m[1].trim().replace(/^\/+/, '');
      const content = p.replace(m[0], '').replace(/^\n/, '');
      files[path] = content;
    }
  }
  if (Object.keys(files).length === 0) files['App.tsx'] = text;
  return files;
}

/* -------------------------------------------
   8) MONTAR HTML DO IFRAME (React Web)
------------------------------------------- */

function htmlForWeb(bundleUrl) {
  return `
  <html>
    <head>
      <meta charset="utf-8"/>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@3/dist/tailwind.min.css">
    </head>
    <body style="margin:0">
      <div id="root"></div>
      <script type="module">
        const React = (await import("https://esm.sh/react")).default;
        const ReactDOM = (await import("https://esm.sh/react-dom/client")).default;
        const App = (await import("${bundleUrl}")).default;
        ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
      <\/script>
    </body>
  </html>`;
}

/* -------------------------------------------
   9) HTML RN-FAKE (modo nativo simulado)
------------------------------------------- */

function htmlForRN(bundleUrl) {
  return `
  <html>
    <head>
      <meta charset="utf-8"/>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@3/dist/tailwind.min.css">
    </head>
    <body style="margin:0">
      <div id="root"></div>
      <script type="module">
        const React = (await import("https://esm.sh/react")).default;
        const App = (await import("${bundleUrl}")).default;
        // Execução RN-fake (sem ReactDOM)
        const root = document.getElementById("root");
        root.appendChild(App()); // App deve retornar elemento criado
      <\/script>
    </body>
  </html>`;
}

/* -------------------------------------------
   10) RENDER — COM HEURÍSTICA RN-FAKE
------------------------------------------- */

export async function renderWithEsbuild(input, files = {}) {
  const iframe = document.getElementById('previewFrame');

  // Detect RN mode:
  let look = input || "";
  for (const k in files) look += files[k];
  const isRN = shouldUseRNFake(look);

  try {
    // MULTI-FILE?
    let vfs = {};
    if (typeof input === "string" && input.includes("/// file:")) {
      vfs = parseMultiFile(input);
    } else if (Object.keys(files).length > 0) {
      vfs = { ...files };
    } else {
      vfs = { "App.tsx": input };
    }

    // Normalize VFS
    const norm = {};
    for (const k in vfs) {
      const nk = k.replace(/^\/+/, '');
      norm[nk] = vfs[k];
    }

    // If RN mode -> Babel compile + RN shim
    if (isRN) {
      const appFile = norm["App.tsx"] || norm["src/App.tsx"] || Object.values(norm)[0];
      const compiled = await babelCompile(appFile);
      const blob = new Blob([compiled], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      iframe.srcdoc = htmlForRN(url);
      return;
    }

    // --- MODO WEB (esbuild) ---
    const esbuild = await loadEsbuild();
    const entry = Object.keys(norm).includes("src/App.tsx")
      ? "src/App.tsx"
      : Object.keys(norm)[0] || "App.tsx";

    norm["react-native-shim.js"] = RN_SHIM;

    try {
      const result = await esbuild.build({
        stdin: {
          contents: rewriteBareImports(
            `import App from "vfs:/${entry}"; export default App;`
          ),
          loader: "tsx",
          resolveDir: "/",
          sourcefile: "entry.tsx"
        },
        bundle: true,
        write: false,
        format: "esm",
        plugins: [makePlugin(norm)],
        define: { 'process.env.NODE_ENV': '"development"' }
      });

      const out = result.outputFiles[0].text;
      const blob = new Blob([out], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      iframe.srcdoc = htmlForWeb(url);
      return;
    } catch (err) {
      console.warn("ESBuild falhou, tentando Babel fallback:", err);
      const appSrc = norm[entry];
      const compiled = await babelCompile(appSrc);
      const blob = new Blob([compiled], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      iframe.srcdoc = htmlForWeb(url);
      return;
    }

  } catch (err) {
    iframe.srcdoc = `<pre style="color:red;padding:20px;">ERRO ENGINE:\n${String(err)}</pre>`;
    console.error(err);
  }
}

window.renderWithEsbuild = (c, f) => renderWithEsbuild(c, f);
