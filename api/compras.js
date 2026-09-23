const express = require("express");
const compras = require("../public/database/compras.json");

const router = express.Router();

router.get("/", (req, res) => {
    return res.json(compras);
});

router.get("/busca", (req, res) => {
    const { cliente_id, produto, data_compra } = req.query;

    if (!cliente_id && !produto && !data_compra) {
        return res.status(400).json({
            message: "Informe ao menos um parâmetro para buscar: 'cliente_id', 'produto' ou 'data_compra'."
        });
    }

    const termoClienteId = cliente_id ? parseInt(cliente_id) : null;
    const termoProduto = produto ? produto.trim().toLowerCase() : null;
    const termoDataCompra = data_compra ? data_compra.trim() : null;

    const results = compras.filter((compra) => {
        const bateuClienteId = termoClienteId
            ? compra.cliente_id === termoClienteId
            : true;

        const bateuProduto = termoProduto
            ? compra.produto && compra.produto.toLowerCase().includes(termoClienteId)
            : true;

        const bateuData = termoDataCompra
            ? compra.data_compra === data_compra
            : true;

        return bateuClienteId && bateuProduto && bateuData;
    });

    return res.json(results)
});

router.get("/:id", (req, res) => {
    const idParam = parseInt(req.params.id);

    if (isNaN(idParam)) {
        return res.status(400).json({ message: "ID inválido. Forneça um número." });
    }

    const compra = compras.find((c) => c.id === idParam);

    if (!compra) {
        return res.status(404).json({ message: "Compra não encontrada." });
    }

    return res.json(compra);
});

module.exports = router;