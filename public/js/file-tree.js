/* ============================================================
   TSX Studio PRO v1.5 — file-tree.js (CORRIGIDO)
============================================================ */

document.addEventListener("DOMContentLoaded", () => {

  console.log("%c[TSX PRO] file-tree.js carregado", "color: green");

  /* ------------------------------------------------------------
     1) Referências globais
  ------------------------------------------------------------ */
  window.TSX_VFS = {};         // Virtual File System completo
  window.TSX_FILE_LIST = [];   // Lista linear de arquivos
  window.TSX_ACTIVE_FILE = ""; // Arquivo aberto no editor

  const fileListEl = document.getElementById("fileList");

  /* ------------------------------------------------------------
     2) Função: adicionar arquivo ao VFS
  ------------------------------------------------------------ */
  function addFileToVFS(path, content) {
    const clean = path.replace(/^\/+/, "");
    window.TSX_VFS[clean] = content;
    window.TSX_FILE_LIST.push(clean);
  }

  /* ------------------------------------------------------------
     3) Função: limpar VFS
  ------------------------------------------------------------ */
  function resetVFS() {
    window.TSX_VFS = {};
    window.TSX_FILE_LIST = [];
    window.TSX_ACTIVE_FILE = "";
  }

  /* ------------------------------------------------------------
     4) Renderizar lista de arquivos na sidebar
  ------------------------------------------------------------ */
  function renderFileList() {
    if (!fileListEl) return;

    fileListEl.innerHTML = "";

    window.TSX_FILE_LIST.forEach((file) => {
      const div = document.createElement("div");
      div.className = "file-item";
      div.innerText = file;

      if (file === window.TSX_ACTIVE_FILE) {
        div.classList.add("file-selected");
      }

      div.onclick = () => openFileInEditor(file);
      fileListEl.appendChild(div);
    });
  }

  /* ------------------------------------------------------------
     5) Abrir arquivo no editor Monaco
  ------------------------------------------------------------ */
  function openFileInEditor(path) {
    const clean = path.replace(/^\/+/, "");
    const content = window.TSX_VFS[clean];

    if (!content) {
      alert("Erro: arquivo não encontrado no VFS:\n" + clean);
      return;
    }

    window.editor.setValue(content);
    window.TSX_ACTIVE_FILE = clean;

    renderFileList();
  }

  /* ------------------------------------------------------------
     6) Carregar ZIP do usuário
  ------------------------------------------------------------ */
  async function handleZipUpload(file) {
    resetVFS();

    try {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.keys(zip.files);

      for (const entry of entries) {
        const zf = zip.files[entry];

        if (!zf.dir) {
          const text = await zf.async("string");
          addFileToVFS(entry, text);
        }
      }

      const possible = [
        "src/App.tsx",
        "src/main.tsx",
        "main.tsx",
        "App.tsx",
        "index.tsx",
        "src/index.tsx"
      ];

      let entryFile = "App.tsx";

      for (const p of possible) {
        if (window.TSX_VFS[p]) {
          entryFile = p;
          break;
        }
      }

      window.TSX_ACTIVE_FILE = entryFile;

      openFileInEditor(entryFile);
      renderFileList();

      alert("ZIP carregado com sucesso!");

    } catch (err) {
      console.error("Erro ao carregar ZIP:", err);
      alert("Erro ao carregar ZIP:\n" + err);
    }
  }

  /* ------------------------------------------------------------
     7) Botão "Importar ZIP"
  ------------------------------------------------------------ */
  const btn = document.getElementById("importZipBtn");
  if (btn) {
    btn.onclick = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".zip";

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) handleZipUpload(file);
      };

      input.click();
    };
  }

  /* ------------------------------------------------------------
     8) Exportar globalmente
  ------------------------------------------------------------ */
  window.TSX_FileTree = {
    renderFileList,
    openFileInEditor,
    handleZipUpload,
  };

  /* ------------------------------------------------------------
     9) Auto-render sidebar
  ------------------------------------------------------------ */
  const showBtn = document.getElementById("showFilesBtn");
  if (showBtn) {
    showBtn.addEventListener("click", () => renderFileList());
  }

});
/* ============================================================
   TSX Studio PRO v1.5 — file-tree.js FINAL (CORRIGIDO)
============================================================ */
