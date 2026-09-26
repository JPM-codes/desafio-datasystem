const express = require("express");
const router = express.Router();
const store = require("../services/store");
const regras = require("../services/regras");
const indicadores = require("../services/indicadores");
const expiracao = require("../services/expiracao");

router.get("/", (req, res) => {
    const base = store.carregar();
    return res.json(base.pontos);
});

/** GET /api/pontos/saldo/:clienteId — saldo sempre livre de pontos vencidos. */
router.get("/saldo/:clienteId", (req, res) => {
    const id = parseInt(req.params.clienteId);
    if (isNaN(id)) return res.status(400).json({ message: "ID inválido." });

    const base = store.carregar();
    const cliente = base.clientes.find((c) => c.id === id);
    if (!cliente) return res.status(404).json({ message: "Cliente não encontrado." });

    const ref = new Date();
    const t = indicadores.totaisDeMovimentos(store.movimentacoesDoCliente(base.pontos, id), ref);
    return res.json({
        cliente_id: id,
        saldo: t.disponiveis,
        acumulado: t.acumulados,
        resgatado: t.resgatados,
        expirado: t.expiradosEfetivos,
        ajuste: t.ajustes,
        impacto: t.geradosImpacto,
        regra: "saldo = acumulados + ajustes - resgatados - expirados",
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
    const vencidos = expiracao.pendentes(base, ref);
    const nomes = {};
    base.clientes.forEach((c) => (nomes[c.id] = c.nome));

    return res.json({
        alertaDias: regras.REGRAS.alertaExpiracaoDias,
        validadeMeses: regras.REGRAS.validadeMeses,
        totalPontos: aVencer.reduce((s, m) => s + Math.abs(m.pontos), 0),
        totalVencidos: vencidos.reduce((s, m) => s + Math.abs(m.pontos), 0),
        vencidos: vencidos.map((m) => ({ ...m, cliente: nomes[m.cliente_id] || "Cliente" })),
        movimentacoes: aVencer.map((m) => ({
            ...m,
            cliente: nomes[m.cliente_id] || "Cliente",
        })),
    });
});

/**
 * POST /api/pontos/expirar
 * Lança as movimentações de EXPIRAÇÃO dos pontos vencidos (12 meses).
 * Idempotente: executar novamente não duplica lançamentos.
 */
router.post("/expirar", (req, res) => {
    const base = store.carregar();
    const ref = new Date();
    const resultado = expiracao.executar(base, ref);
    const nomes = {};
    base.clientes.forEach((c) => (nomes[c.id] = c.nome));

    return res.json({
        executado: resultado.executado,
        totalLancamentos: resultado.totalLancamentos,
        totalPontos: resultado.totalPontos,
        validadeMeses: regras.REGRAS.validadeMeses,
        porCliente: resultado.porCliente.map((r) => ({
            cliente_id: r.cliente_id,
            cliente: nomes[r.cliente_id] || "Cliente",
            pontos: r.pontos,
        })),
        saldoApos: indicadores.calcular(base, ref).pontos,
    });
});

module.exports = router;