const express = require("express");
const router = express.Router();
const store = require("../services/store");
const regras = require("../services/regras");
const indicadores = require("../services/indicadores");

router.get("/", (req, res) => {
    const base = store.carregar();
    return res.json(base.resgates);
});

router.post("/", (req, res) => {
    const { cliente_id, pontos } = req.body || {};

    const id = parseInt(cliente_id);
    if (isNaN(id)) return res.status(400).json({ message: "Informe o 'cliente_id'." });

    const quantidade = Math.floor(Number(pontos) || 0);
    if (quantidade <= 0) {
        return res.status(400).json({ message: "Informe uma quantidade de pontos válida." });
    }

    const base = store.carregar();
    const cliente = base.clientes.find((c) => c.id === id);
    if (!cliente) return res.status(404).json({ message: "Cliente não encontrado." });

    const ref = new Date();
    // O saldo já desconta os pontos vencidos (validade de 12 meses), portanto
    // um resgate de valor maior que o saldo também impede resgatar pontos expirados.
    const totais = indicadores.totaisDeMovimentos(
        store.movimentacoesDoCliente(base.pontos, id),
        ref
    );
    const saldo = totais.disponiveis;

    if (quantidade > saldo) {
        return res.status(422).json({
            message: "Resgate excede o saldo disponível do cliente.",
            saldo,
            saldoResgatavel: saldo,
            detalhe: `Saldo livre de pontos vencidos: ${saldo} pts. Pontos expirados (${totais.expiradosEfetivos}) não podem ser resgatados.`,
        });
    }

    const agora = store.agoraIso();
    const resgate = {
        id: store.proximoId(base.resgates),
        cliente_id: id,
        pontos_utilizados: quantidade,
        valor_desconto: Math.round((quantidade / regras.REGRAS.conversao.pontos) * regras.REGRAS.conversao.valorReal * 100) / 100,
        data_resgate: agora,
        create_at: agora,
    };

    const movimento = {
        id: store.proximoId(base.pontos),
        cliente_id: id,
        tipo: "resgate",
        pontos: -quantidade,
        data_movimentacao: agora,
        data_expiracao: null,
        compras_id: 0,
        resgates_id: resgate.id,
        origem: "RESGATE",
        create_at: agora,
    };

    base.resgates.push(resgate);
    base.pontos.push(movimento);
    store.salvar("resgate", base.resgates);
    store.salvar("pontos", base.pontos);

    const saldoDepois = indicadores.totaisDeMovimentos(
        store.movimentacoesDoCliente(base.pontos, id),
        ref
    ).disponiveis;

    return res.status(201).json({
        ...resgate,
        saldoAntes: saldo,
        saldoDepois,
        conversao: `${regras.REGRAS.conversao.pontos} pontos = R$ ${regras.REGRAS.conversao.valorReal}`,
        aviso: quantidade % regras.REGRAS.conversao.pontos !== 0
            ? "Os pontos foram convertidos pela regra 100 pts = R$ 5,00."
            : null,
    });
});

router.get("/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const base = store.carregar();
    const resgate = base.resgates.find((r) => r.id === id);
    if (!resgate) return res.status(404).json({ message: "Resgate não encontrado." });
    return res.json(resgate);
});

module.exports = router;