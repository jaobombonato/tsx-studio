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
            loader:
              path.endsWith('.ts') || path.endsWith('.tsx') ? 'tsx' : 'js'
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
          args.path.endsWith('.css') ? 'css'
            : args.path.endsWith('.ts') || args.path.endsWith('.tsx') ? 'tsx'
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
      jsxFactory: "React.createElement",
      jsxFragment: "React.Fragment"
    });

    const c
