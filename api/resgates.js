const express = require("express");
const router = express.Router();
const store = require("../services/store");
const regras = require("../services/regras");

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

    const saldo = store.pontosDisponiveisCliente(base.pontos, id);
    const naoMultiplo = quantidade % regras.REGRAS.conversao.pontos !== 0;
    if (quantidade > saldo) {
        return res.status(422).json({ message: "Resgate excede o saldo disponível do cliente.", saldo });
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
        create_at: agora,
    };

    base.resgates.push(resgate);
    base.pontos.push(movimento);
    store.salvar("resgate", base.resgates);
    store.salvar("pontos", base.pontos);

    return res.status(201).json({
        ...resgate,
        aviso: naoMultiplo ? "Os pontos foram convertidos pela regra 100 pts = R$ 5,00." : null,
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