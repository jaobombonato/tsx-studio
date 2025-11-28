document.addEventListener("DOMContentLoaded", () => {

  const fileListEl = document.getElementById("fileList");
  const fileContentEl = document.getElementById("fileContent");

  if (!fileListEl || !fileContentEl) {
    console.warn("[file-tree] Elementos não encontrados");
    return;
  }

  let currentFiles = {};

  function renderFileList() {
    fileListEl.innerHTML = "";
    for (const name in currentFiles) {
      const li = document.createElement("li");
      li.textContent = name;
      li.onclick = () => fileContentEl.value = currentFiles[name];
      fileListEl.appendChild(li);
    }
  }

  window.handleZipUpload = async (file) => {
    if (!window.JSZip) {
      alert("JSZip não encontrado");
      return;
    }
    const zip = await JSZip.loadAsync(file);

    currentFiles = {};
    for (const filename of Object.keys(zip.files)) {
      const data = await zip.file(filename).async("string");
      currentFiles[filename] = data;
    }

    renderFileList();
  };

});
