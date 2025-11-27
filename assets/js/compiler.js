window.compileTSX = function (code) {

    if (typeof Babel === "undefined") {
        console.error("Babel não carregou ainda");
        return;
    }

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
        return null;
    }
};
