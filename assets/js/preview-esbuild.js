// TSX Studio — preview-esbuild.js (TSX Studio 1.1 PRO)
// Suporta: /// file: multi-file, ZIP import, esm.sh resolver, @/ alias, react-native fake shim

const ESBUILD_VERSION = '0.17.19';
const ESBUILD_ESM = `https://unpkg.com/esbuild-wasm@${ESBUILD_VERSION}/esm/browser.js`;
const ESBUILD_WASM = `https://unpkg.com/esbuild-wasm@${ESBUILD_VERSION}/esbuild.wasm`;

// ---------- Config ---------
const ALIAS_ROOT = 'src'; // "@/..." -> vfs:/src/...
// ---------------------------

async function loadEsbuild() {
  if (window.__esbuild) return window.__esbuild;
  const module = await import(ESBUILD_ESM);
  await module.initialize({ wasmURL: ESBUILD_WASM });
  window.__esbuild = module;
  return module;
}

// ---------- UTIL: parse /// file: blocks ----------
function parseMultiFileText(text) {
  // expects sections like: /// file: path/to/File.tsx
  const files = {};
  const parts = text.split(/(?=^\/\/\/\s*file:\s*)/m);
  for (const p of parts) {
    const m = p.match(/\/\/\/\s*file:\s*([^\r\n]+)/i);
    if (m) {
      const path = m[1].trim().replace(/^\/*/, ''); // remove leading slash
      const content = p.replace(m[0], '').replace(/^\n/, '');
      files[path] = content;
    }
  }
  // if nothing found, assume single file App.tsx
  if (Object.keys(files).length === 0) {
    files['App.tsx'] = text;
  }
  return files;
}

// ---------- RN Fake Shim (simples, suficiente para a maioria dos exemplos RN) ----------
const RN_SHIM = `
// React Native shim for TSX Studio (fake renderer -> DOM)
import React from "https://esm.sh/react";
export const View = (props) => {
  const { style, children, ...rest } = props || {};
  return React.createElement('div', { ...rest, style: style }, children);
};
export const Text = (props) => {
  const { style, children, ...rest } = props || {};
  return React.createElement('span', { ...rest, style: style }, children);
};
export const Image = (props) => {
  const { source, style, ...rest } = props || {};
  const src = (source && (source.uri || source)) || '';
  return React.createElement('img', { src, style, ...rest });
};
export const TouchableOpacity = (props) => {
  const { onPress, children, ...rest } = props || {};
  return React.createElement('button', { onClick: onPress, ...rest }, children);
};
export const StyleSheet = {
  create: (obj) => obj
};
export default { View, Text, Image, TouchableOpacity, StyleSheet };
`;

// ---------- Helpers para resolver imports ----------
function isBareImport(path) {
  return !path.startsWith('.') && !path.startsWith('/') && !path.startsWith('vfs:') && !path.startsWith('http');
}

function normalizeAlias(path) {
  // "@/components/Button" -> "vfs:/src/components/Button"
  if (path.startsWith('@/')) {
    return `vfs:/${ALIAS_ROOT}/${path.slice(2)}`;
  }
  return path;
}

function rewriteBareImports(code) {
  return code.replace(/from\s+['"]([^'"]+)['"]/g, (m, pkg) => {
    // 1) NUNCA toque nos caminhos VFS
    if (pkg.startsWith("vfs:/")) {
      return `from "${pkg}"`;
    }
    // 2) NUNCA toque em caminhos relativos (./ ou ../)
    if (pkg.startsWith(".") || pkg.startsWith("/")) {
      return `from "${pkg}"`;
    }
    // 3) React Native → shim interno
    if (pkg === "react-native" || pkg.startsWith("react-native/")) {
      return `from "${pkg}"`;
    }
    // 4) Suporte para "@/..." — alias do projeto
    if (pkg.startsWith("@/")) {
      return `from "${pkg}"`;
    }
    // 5) Qualquer outro é um bare import → carregar de esm.sh
    return `from "https://esm.sh/${pkg}"`;
  });
}


// ---------- plugin esbuild: VFS + resolver + http fetch ----------
function makePlugin(files = {}) {
  return {
    name: 'tsx-studio-vfs-resolver',
    setup(build) {
      // VFS namespace (internal files)
      build.onResolve({ filter: /^vfs:\/(.+)$/ }, args => ({
        path: args.path,
        namespace: 'vfs'
      }));

      build.onLoad({ filter: /.*/, namespace: 'vfs' }, args => {
        const path = args.path.replace(/^vfs:\//, '');
        if (files[path] !== undefined) {
          const loader = path.endsWith('.ts') || path.endsWith('.tsx') ? 'tsx' :
                         path.endsWith('.css') ? 'css' : 'js';
          return { contents: files[path], loader };
        }
        // special: react-native shim
        if (path === 'react-native-shim') {
          return { contents: RN_SHIM, loader: 'js' };
        }
        return null;
      });

      // Resolve alias "@/..." -> vfs:/src/...
      build.onResolve({ filter: /^@\/.*/ }, args => {
        const p = args.path.replace(/^@\//, '');
        return { path: `vfs:/${ALIAS_ROOT}/${p}`, namespace: 'vfs' };
      });

      // Resolve react-native bare import -> vfs:/react-native-shim
      build.onResolve({ filter: /^react-native(\/.*)?$/ }, args => {
        return { path: `vfs:/react-native-shim`, namespace: 'vfs' };
      });

      // Bare imports (npm) -> esm.sh as HTTP namespace
      build.onResolve({ filter: /^[^\.\/].*/ }, args => {
        // if already an absolute URL, let it through
        if (/^https?:\/\//.test(args.path)) {
          return { path: args.path, namespace: 'http' };
        }
        // pass through if starts with @/ or vfs:
        if (args.path.startsWith('@/') || args.path.startsWith('vfs:')) {
          return { path: args.path, namespace: 'vfs' };
        }
        // otherwise map to esm.sh
        return { path: `https://esm.sh/${args.path}`, namespace: 'http' };
      });

      // Load from http namespace (esm.sh / cdn)
      build.onLoad({ filter: /.*/, namespace: 'http' }, async args => {
        const res = await fetch(args.path);
        if (!res.ok) throw new Error('Failed to fetch ' + args.path);
        const text = await res.text();
        const loader = args.path.endsWith('.css') ? 'css' :
                       args.path.endsWith('.ts') || args.path.endsWith('.tsx') ? 'tsx' : 'js';
        return { contents: text, loader };
      });
    }
  };
}

// ---------- ZIP helper (uses JSZip global) ----------
async function loadZipToVfs(blob) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip not found. Adicione <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>');
  }
  const zip = await JSZip.loadAsync(blob);
  const files = {};
  const entries = Object.keys(zip.files);
  for (const path of entries) {
    const file = zip.files[path];
    if (!file.dir) {
      const text = await file.async('string');
      // normalize: strip leading ./ or /
      const p = path.replace(/^\.?\//, '');
      files[p] = text;
    }
  }
  return files;
}

// ---------- principal: renderWithEsbuild (aceita entryCode ou VFS) ----------
export async function renderWithEsbuild(entryCodeOrPath, files = {}) {
  // entryCodeOrPath: can be string of code (single file), or 'vfs:/path' to entry in files
  try {
    const esbuild = await loadEsbuild();

    // If entryCodeOrPath looks like a multi-file text, parse it
    let filesMap = { ...(files || {}) };

    // If user passed a single long text (contain /// file:), parse to VFS
    if (typeof entryCodeOrPath === 'string' && entryCodeOrPath.includes('/// file:')) {
      const parsed = parseMultiFileText(entryCodeOrPath);
      filesMap = { ...filesMap, ...parsed };
      // default entry is src/App.tsx or App.tsx
      entryCodeOrPath = Object.keys(parsed).includes('src/App.tsx') ? 'vfs:/src/App.tsx' : 'vfs:/App.tsx';
    }

    // If entryCodeOrPath is a raw code string without /// file:, we compile it as App.tsx
    if (typeof entryCodeOrPath === 'string' && !entryCodeOrPath.startsWith('vfs:/') && !entryCodeOrPath.trim().startsWith('import') && !entryCodeOrPath.includes('export')) {
      // treat as code snippet
      filesMap['App.tsx'] = entryCodeOrPath;
      entryCodeOrPath = 'vfs:/App.tsx';
    }

    // If entryCodeOrPath is a plain code containing imports (and not vfs:), we put it as App.tsx
    if (typeof entryCodeOrPath === 'string' && !entryCodeOrPath.startsWith('vfs:/') && (entryCodeOrPath.includes('import') || entryCodeOrPath.includes('export'))) {
      filesMap['App.tsx'] = entryCodeOrPath;
      entryCodeOrPath = 'vfs:/App.tsx';
    }

    // Ensure react-native shim exists in filesMap if referenced
    if (!filesMap['react-native-shim']) {
      filesMap['react-native-shim'] = RN_SHIM;
    }

    // If entry is vfs path, we will create an stdin that imports it
    let stdinContents = '';
    if (typeof entryCodeOrPath === 'string' && entryCodeOrPath.startsWith('vfs:/')) {
      // esbuild stdin: import the vfs file by creating a tiny virtual entry that re-exports default
      const entryPath = entryCodeOrPath.replace(/^vfs:\//, '');
      stdinContents = `import App from "vfs:/${entryPath}"; export default App;`;
    } else {
      // fallback: treat provided string as the code
      stdinContents = entryCodeOrPath.toString();
    }

    // rewrite bare imports in all VFS files to keep esm.sh strategy (but plugin resolves aliases)
    const rewrittenFiles = {};
    for (const [p, c] of Object.entries(filesMap)) {
      rewrittenFiles[p] = rewriteBareImports(c);
    }

    // Create esbuild bundle
    const result = await esbuild.build({
      stdin: {
        contents: rewriteBareImports(stdinContents),
        resolveDir: '/',
        sourcefile: 'App.tsx',
        loader: 'tsx'
      },
      bundle: true,
      format: 'esm',
      write: false,
      plugins: [makePlugin(rewrittenFiles)],
      define: { 'process.env.NODE_ENV': '"development"' },
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
    });

    const code = result.outputFiles[0].text;
    const blob = new Blob([code], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    const iframe = document.getElementById('previewFrame');

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@3.4.6/dist/tailwind.min.css">
        </head>
        <body style="margin:0;font-family:Inter,Arial,Helvetica">
          <div id="root"></div>
          <script type="module">
            (async () => {
              try {
                const reactMod = await import("https://esm.sh/react");
                const reactDomMod = await import("https://esm.sh/react-dom/client");
                const React = reactMod.default || reactMod;
                const ReactDOMClient = reactDomMod.default || reactDomMod;
                window.React = React;
                window.ReactDOMClient = ReactDOMClient;

                const AppModule = await import("${blobUrl}");
                const App = AppModule.default || AppModule.App;

                const root = ReactDOMClient.createRoot(document.getElementById('root'));
                root.render(React.createElement(App));
              } catch (err) {
                document.body.innerHTML = '<pre style="color:red;padding:20px;">' + String(err) + '</pre>';
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
    iframe.srcdoc = '<pre style="color:red;padding:20px;">Build failed: ' + String(err) + '</pre>';
    console.error('esbuild error', err);
  }
}

// ---------- Expose helpers for UI to use ----------

// Mantém compatibilidade: renderWithEsbuild(code, files)
window.renderWithEsbuild = (c, f) => renderWithEsbuild(c, f);

// Carrega texto com /// file: ... e seta como VFS + compila
window.loadVfsFromText = async (text) => {
  const files = parseMultiFileText(text);
  // return files so UI can inspect if needed
  await renderWithEsbuild('vfs:/src/App.tsx', files);
  return files;
};

// Carrega um arquivo zip (File/Blob) e compila
window.loadZipFile = async (fileOrBlob) => {
  const files = await loadZipToVfs(fileOrBlob);
  // prefer src/App.tsx if exists
  const entry = files['src/App.tsx'] ? 'vfs:/src/App.tsx' : files['App.tsx'] ? 'vfs:/App.tsx' : 'vfs:/App.tsx';
  await renderWithEsbuild(entry, files);
  return files;
};

// Carrega um objeto VFS direto
window.loadVfs = async (filesObj) => {
  await renderWithEsbuild('vfs:/src/App.tsx', filesObj);
  return filesObj;
};
