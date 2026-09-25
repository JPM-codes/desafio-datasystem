const express = require("express");
const router = express.Router();
const store = require("../services/store");
const regras = require("../services/regras");

router.get("/", (req, res) => {
    const base = store.carregar();
    return res.json(base.compras);
});

router.post("/", (req, res) => {
    const body = req.body || {};
    const valor = Math.round((Number(body.valor) || 0) * 100) / 100;

    if (valor <= 0) {
        return res.status(422).json({ message: "Informe o valor da compra." });
    }

    const base = store.carregar();
    let cliente = null;

    if (body.cliente_id) {
        cliente = base.clientes.find((c) => c.id === parseInt(body.cliente_id));
    } else if (body.cpf) {
        const digitos = regras.soDigitos(body.cpf);
        cliente = base.clientes.find((c) => regras.soDigitos(c.documento) === digitos);
    }

    if (!cliente) {
        return res.status(404).json({
            message: "Cliente não encontrado. Informe 'cliente_id' ou um 'cpf' cadastrado.",
        });
    }

    const pontosAcumulados = base.pontos
        .filter((m) => m.cliente_id === cliente.id && (m.tipo === "acumulo" || m.tipo === "bonus"))
        .reduce((s, m) => s + (m.pontos || 0), 0);
    const nivel = regras.calcularNivel(pontosAcumulados);
    const pts = regras.calcularPontos(valor, nivel);

    const quantidade = Math.max(1, Math.round(Number(body.quantidade) || 1));
    const dataCompra = body.data_compra ? new Date(body.data_compra).toISOString() : store.agoraIso();
    const compraId = store.proximoId(base.compras);

    const compra = {
        id: compraId,
        cliente_id: cliente.id,
        produto: String(body.produto || "Tênis Esportivo").trim(),
        quantidade,
        valor_unitario: Math.round((valor / quantidade) * 100) / 100,
        valor_total: valor,
        pontos_base: pts.base,
        cliente_pontos_bonus: pts.bonus,
        pontos_total: pts.total,
        data_compra: dataCompra,
        create_at: store.agoraIso(),
    };

    const expiracao = regras.calcularDataExpiracao(dataCompra, regras.REGRAS.validadeMeses);
    const movimento = {
        id: store.proximoId(base.pontos),
        cliente_id: cliente.id,
        tipo: "acumulo",
        pontos: pts.total,
        data_movimentacao: dataCompra,
        data_expiracao: expiracao ? expiracao.toISOString() : null,
        compras_id: compraId,
        resgates_id: 0,
        create_at: store.agoraIso(),
    };

    base.compras.push(compra);
    base.pontos.push(movimento);
    store.salvar("compras", base.compras);
    store.salvar("pontos", base.pontos);

    const novoSaldo = store.pontosDisponiveisCliente(base.pontos, cliente.id);
    return res.status(201).json({
        compra,
        movimento,
        nivel: nivel.nome,
        bonusPercentual: nivel.bonus,
        novoSaldo,
        mensagem: `${pts.total} pontos gerados para ${cliente.nome}.`,
    });
});

router.get("/busca", (req, res) => {
    const base = store.carregar();
    const { cliente_id, produto, data_compra } = req.query;

    if (!cliente_id && !produto && !data_compra) {
        return res.status(400).json({
            message: "Informe ao menos um parâmetro para buscar: 'cliente_id', 'produto' ou 'data_compra'.",
        });
    }

    const termoClienteId = cliente_id ? parseInt(cliente_id) : null;
    const termoProduto = produto ? produto.trim().toLowerCase() : null;
    const termoDataCompra = data_compra ? data_compra.trim() : null;

    const results = base.compras.filter((compra) => {
        const bateuClienteId = termoClienteId ? compra.cliente_id === termoClienteId : true;
        const bateuProduto = termoProduto
            ? compra.produto && compra.produto.toLowerCase().includes(termoProduto)
            : true;
        const bateuData = termoDataCompra
            ? String(compra.data_compra).startsWith(termoDataCompra)
            : true;
        return bateuClienteId && bateuProduto && bateuData;
    });

    return res.json(results);
});

router.get("/:id", (req, res) => {
    const idParam = parseInt(req.params.id);
    if (isNaN(idParam)) return res.status(400).json({ message: "ID inválido. Forneça um número." });

    const base = store.carregar();
    const compra = base.compras.find((c) => c.id === idParam);
    if (!compra) return res.status(404).json({ message: "Compra não encontrada." });
    return res.json(compra);
});

module.exports = router;