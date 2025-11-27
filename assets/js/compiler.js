// Compila código TSX usando Babel Standalone
window.compileTSX = function (code) {

    try {
        const result = Babel.transform(code, {
            presets: [
                ["typescript", { allExtensions: true, isTSX: true }],
                ["react", { runtime: "automatic" }]
            ],
            filename: "App.tsx"
        });

        return result.code;

    } catch (err) {
        alert("Erro ao compilar TSX: " + err.message);
        console.error(err);
        return null;
    }
};
