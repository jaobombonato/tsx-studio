/* ============================================================
   TSX STUDIO ENGINE — v1.4 PRO (COM HEURÍSTICA RN CORRIGIDA)
   ESBuild-wasm + VFS + ZIP + Resolver + Babel Fallback
   + React Native Fake Runtime (LMarena-style)
   + Heurística RN sólida (sem falso positivo)
   ============================================================ */

/* -------------------------------------------
   0) CONFIG / GLOBALS
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
   2) HEURÍSTICA RN — SEM FALSOS POSITIVOS
------------------------------------------- */
/*
REGRAS CERTAS:

🔵 Ativa RN-fake SOMENTE quando:
  1. Existe import real de "react-native"
  2. OU existe <View>, <Text>, <ScrollView>, <FlatList>
     MAS NÃO existe elementos HTML típicos (<div>, <h1>, <p>, <section>)
  3. OU existe StyleSheet.create(...) E não existe HTML

🔵 Se existir QUALQUER HTML → É MODO WEB
*/
function shouldUseRNFake(allCode) {
  const c = allCode.toLowerCase();

  // Caso 1 — import real:
  if (c.includes('from "react-native"') || c.includes("from 'react-native'"))
    return true;

  // Se contiver HTML → é web
  if (
    /<\s*div\b/i.test(c) ||
    /<\s*h1\b/i.test(c) ||
    /<\s*p\b/i.test(c) ||
    /<\s*section\b/i.test(c) ||
    /<\s*span\b/i.test(c)
  )
    return false;

  // Caso 2 — elementos RN
  if (
    /<\s*view\b/i.test(c) ||
    /<\s*text\b/i.test(c) ||
    /<\s*scrollview\b/i.test(c) ||
    /<\s*flatlist\b/i.test(c)
  )
    return true;

  // Caso 3 — StyleSheet
  if (/stylesheet\.create\s*\(/i.test(c)) return true;

  return false;
}

/* -------------------------------------------
   3) RUNTIME RN-FAKE (LMarena-style)
------------------------------------------- */
const RN_SHIM = `
  import React from "https://esm.sh/react";

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
    View, Text, Image,
    ScrollView, TouchableOpacity,
    FlatList, StyleSheet
  };
`;

/* -------------------------------------------
   4) REWRITE IMPORTS (esm.sh)
   NÃO tocar em vfs: / ./ / @/ / react-native
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
    )
      return `from "${pkg}"`;

    return `from "https://esm.sh/${pkg}"`;
  });
}

/* -------------------------------------------
   5) PLUGIN VFS + HTTP FETCH (esm.sh)
------------------------------------------- */
function makePlugin(files = {}) {
  return {
    name: "tsxstudio-vfs",
    setup(build) {

      build.onResolve({ filter: /^vfs:/ }, args => ({
        path: args.path,
        namespace: "vfs"
      }));

      build.onLoad({ filter: /.*/, namespace: "vfs" }, args => {
        const p = args.path.replace(/^vfs:\/*/, '');
        if (p === 'react-native-shim.js')
          return { contents: RN_SHIM, loader: 'js' };

        if (files[p] !== undefined) {
          const loader =
            p.endsWith('.tsx') || p.endsWith('.ts')
              ? 'tsx'
              : p.endsWith('.css')
              ? 'css'
              : 'js';
          return { contents: files[p], loader };
        }
        return null;
      });

      build.onResolve({ filter: /^[^./].*/ }, args => {
        if (args.path.startsWith('vfs:'))
          return { path: args.path, namespace: "vfs" };
        return { path: `https://esm.sh/${args.path}`, namespace: "http" };
      });

      build.onLoad({ filter: /.*/, namespace: "http" }, async args => {
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
   6) BABEL FALLBACK
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
  return Babel.transform(code, {
    presets: [
      ["typescript", { allExtensions: true, isTSX: true }],
      ["react", { runtime: "automatic" }]
    ]
  }).code;
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
   8) HTML WEB
------------------------------------------- */
function htmlForWeb(bundle) {
  return `
  <html>
    <head><meta charset="utf-8"/></head>
    <body style="margin:0">
      <div id="root"></div>
      <script type="module">
        const React = (await import("https://esm.sh/react")).default;
        const ReactDOM = (await import("https://esm.sh/react-dom/client")).default;
        const App = (await import("${bundle}")).default;
        ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
      <\/script>
    </body>
  </html>`;
}

/* -------------------------------------------
   9) HTML RN-FAKE
------------------------------------------- */
function htmlForRN(bundle) {
  return `
  <html>
    <head><meta charset="utf-8"/></head>
    <body style="margin:0">
      <div id="root"></div>
      <script type="module">
        const React = (await import("https://esm.sh/react")).default;
        const App = (await import("${bundle}")).default;
        document.getElementById("root").appendChild(App());
      <\/script>
    </body>
  </html>`;
}

/* -------------------------------------------
   10) ENGINE PRINCIPAL (COM HEURÍSTICA RN)
------------------------------------------- */

export async function renderWithEsbuild(input, files = {}) {
  const iframe = document.getElementById("previewFrame");

  // montar string gigante com todo código
  let all = input || "";
  for (const k in files) all += "\n" + files[k];

  // detectar RN
  const isRN = shouldUseRNFake(all);

  try {
    let vfs = {};

    if (typeof input === "string" && input.includes("/// file:")) {
      vfs = parseMultiFile(input);
    } else if (Object.keys(files).length > 0) {
      vfs = { ...files };
    } else {
      vfs = { "App.tsx": input };
    }

    // normalizar paths
    const norm = {};
    for (const k in vfs) {
      norm[k.replace(/^\/+/, '')] = vfs[k];
    }

    // --- MODO RN ---
    if (isRN) {
      const entry = norm["App.tsx"] || Object.values(norm)[0];
      const compiled = await babelCompile(entry);
      const blob = new Blob([compiled], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      iframe.srcdoc = htmlForRN(url);
      return;
    }

    // --- MODO WEB (ESBUILD) ---
    const esbuild = await loadEsbuild();

    const entry =
      norm["src/App.tsx"]
        ? "src/App.tsx"
        : norm["App.tsx"]
        ? "App.tsx"
        : Object.keys(norm)[0];

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
        define: { "process.env.NODE_ENV": '"development"' }
      });

      const out = result.outputFiles[0].text;
      const blob = new Blob([out], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      iframe.srcdoc = htmlForWeb(url);
      return;

    } catch (err) {
      console.warn("ESBuild falhou, fallback Babel:", err);
      const entrySrc = norm[entry];
      const compiled = await babelCompile(entrySrc);
      const blob = new Blob([compiled], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      iframe.srcdoc = htmlForWeb(url);
      return;
    }

  } catch (err) {
    iframe.srcdoc =
      `<pre style="color:red;padding:20px;">ERRO ENGINE:\n${String(err)}</pre>`;
    console.error(err);
  }
}

// GLOBAL
window.renderWithEsbuild = (c, f) => renderWithEsbuild(c, f);
