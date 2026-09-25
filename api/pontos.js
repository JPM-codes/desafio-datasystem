const express = require("express");
const router = express.Router();
const store = require("../services/store");
const regras = require("../services/regras");

router.get("/", (req, res) => {
    const base = store.carregar();
    return res.json(base.pontos);
});

router.get("/saldo/:clienteId", (req, res) => {
    const id = parseInt(req.params.clienteId);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido." });

    const base = store.carregar();
    const cliente = base.clientes.find((c) => c.id === id);
    if (!cliente) return res.status(404).json({ message: "Cliente não encontrado." });

    const totais = store.totaisPontos(store.movimentacoesDoCliente(base.pontos, id));
    return res.json({
        cliente_id: id,
        saldo: Math.max(0, totais.acumulado - totais.resgatado - totais.expirado),
        acumulado: totais.acumulado,
        resgatado: totais.resgatado,
        expirado: totais.expirado,
    });
});

router.get("/historico/:clienteId", (req, res) => {
    const id = parseInt(req.params.clienteId);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido." });

    const base = store.carregar();
    const movs = store.movimentacoesDoCliente(base.pontos, id).sort(
        (a, b) => new Date(b.data_movimentacao) - new Date(a.data_movimentacao)
    );
    return res.json(movs);
});

router.get("/expiracao", (req, res) => {
    const base = store.carregar();
    const ref = new Date();
    const aVencer = regras.pontosProximosExpiracao(base.pontos, ref);
    const nomes = {};
    base.clientes.forEach((c) => (nomes[c.id] = c.nome));

    return res.json({
        alertaDias: regras.REGRAS.alertaExpiracaoDias,
        totalPontos: aVencer.reduce((s, m) => s + Math.abs(m.pontos), 0),
        movimentacoes: aVencer.map((m) => ({
            ...m,
            cliente: nomes[m.cliente_id] || "Cliente",
        })),
    });
});

module.exports = router;