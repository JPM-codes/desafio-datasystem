'use strict';

/**
 * API da campanha de Impacto (logística reversa + ação social).
 * Gerencia doações de calçado e devolução de caixas, validando itens,
 * concedendo bônus no saldo normal (origem BONUS_DOACAO/BONUS_CAIXA)
 * e acompanhando a destinação.
 */
const express = require("express");
const router = express.Router();
const store = require("../services/store");
const regras = require("../services/regras");
const impacto = require("../services/impacto");

// ============================================================
// Helpers
// ============================================================
function enriquecerAcao(base, acao) {
    const cliente = base.clientes.find((c) => c.id === acao.cliente_id);
    return {
        ...acao,
        cliente_nome: cliente ? cliente.nome : "Cliente",
        cliente_iniciais: store.iniciaisDoNome(cliente ? cliente.nome : "C"),
        rotulo: impacto.rotuloTipo(acao.tipo_acao),
        origem: impacto.origemDe(acao.tipo_acao),
        status_validacao_rotulo: impacto.statusValidacao(acao.status_validacao).rotulo,
        status_destinacao_rotulo: impacto.statusDestinacao(acao.status_destinacao).rotulo,
        destino_rotulo: impacto.rotuloDestino(acao.destino),
        regraBonus: impacto.regraTextoDe(acao.tipo_acao),
        pontuacao_processada: store.acaoJaPontuada(base, acao),
    };
}

function findAcao(base, idParam) {
    const id = parseInt(idParam);
    if (isNaN(id)) return null;
    return base.acoes_impacto.find((a) => a.id === id);
}

function findCliente(base, body) {
    if (body.cliente_id) {
        return base.clientes.find((c) => c.id === parseInt(body.cliente_id));
    }
    if (body.cpf) {
        const digitos = regras.soDigitos(body.cpf);
        return base.clientes.find((c) => regras.soDigitos(c.documento) === digitos);
    }
    return null;
}

function movimentoDeAcao(base, acao) {
    return store.movimentoDeBonusDaAcao(base, acao.id);
}

// ============================================================
// Listagem / busca
// ============================================================
router.get("/", (req, res) => {
    const base = store.carregar();
    const q = req.query || {};

    let lista = [...(base.acoes_impacto || [])];

    if (q.tipo_acao) lista = lista.filter((a) => a.tipo_acao === q.tipo_acao);
    if (q.status_validacao) lista = lista.filter((a) => a.status_validacao === q.status_validacao);
    if (q.status_destinacao) lista = lista.filter((a) => a.status_destinacao === q.status_destinacao);
    if (q.cliente_id) lista = lista.filter((a) => a.cliente_id === parseInt(q.cliente_id));
    if (q.ponto_coleta) {
        const termo = String(q.ponto_coleta).trim().toLowerCase();
        lista = lista.filter((a) => String(a.ponto_coleta || "").toLowerCase() === termo);
    }
    if (q.data_inicio) {
        const inicio = new Date(q.data_inicio);
        lista = lista.filter((a) => new Date(a.data_recebimento) >= inicio);
    }
    if (q.data_fim) {
        const fim = new Date(q.data_fim);
        fim.setHours(23, 59, 59, 999);
        lista = lista.filter((a) => new Date(a.data_recebimento) <= fim);
    }

    const ordenados = lista.sort(
        (a, b) => new Date(b.data_recebimento) - new Date(a.data_recebimento)
    );
    return res.json(ordenados.map((a) => enriquecerAcao(base, a)));
});

// ============================================================
// Agregações
// ============================================================
router.get("/dashboard", (req, res) => {
    const base = store.carregar();
    return res.json(store.dashboardImpacto(base, new Date()));
});

router.get("/ranking", (req, res) => {
    const base = store.carregar();
    return res.json(store.rankingImpacto(base, new Date()));
});

router.get("/relatorio", (req, res) => {
    const base = store.carregar();
    return res.json(
        store.relatorioImpacto(base, {
            data_inicio: req.query.data_inicio || null,
            data_fim: req.query.data_fim || null,
            ponto_coleta: req.query.ponto_coleta || null,
        })
    );
});

/** GET /api/impacto/regras — parâmetros configuráveis dos bônus da campanha. */
router.get("/regras", (req, res) => {
    return res.json({
        bonus_doacao_calcado: impacto.CONFIG.bonusDoacao,
        bonus_devolucao_caixa: impacto.CONFIG.bonusCaixa,
        modo_bonus_calcado: impacto.CONFIG.modoBonusCalcado,
        modo_bonus_caixa: impacto.CONFIG.modoBonusCaixa,
        limite_doacao_mes: impacto.CONFIG.limiteDoacaoMes,
        limite_caixa_mes: impacto.CONFIG.limiteCaixaMes,
        modos: impacto.MODOS,
        textos: impacto.config().textos,
        idempotencia: "Uma ação aprovada concede pontos uma única vez (marcador pontuacao_processada + vínculo origem_id).",
    });
});

// ============================================================
// Detalhe
// ============================================================
router.get("/:id", (req, res) => {
    const base = store.carregar();
    const acao = findAcao(base, req.params.id);
    if (!acao) return res.status(404).json({ message: "Ação de impacto não encontrada." });
    return res.json(enriquecerAcao(base, acao));
});

// ============================================================
// Registrar recebimento
// ============================================================
router.post("/", (req, res) => {
    const body = req.body || {};
    const tipo = body.tipo_acao;

    if (!impacto.tipoValido(tipo)) {
        return res.status(422).json({
            message: "Tipo de ação inválido. Use 'DOACAO_CALCADO' ou 'DEVOLUCAO_CAIXA'.",
        });
    }

    const quantidade = Math.max(1, Math.round(Number(body.quantidade) || 1));
    const pontoColeta = String(body.ponto_coleta || "").trim();
    if (!pontoColeta) return res.status(422).json({ message: "Informe o ponto de coleta." });

    const base = store.carregar();
    const cliente = findCliente(base, body);
    if (!cliente) {
        return res.status(404).json({
            message: "Cliente não encontrado. Informe 'cliente_id' ou um 'cpf' cadastrado.",
        });
    }

    // Limite mensal de ações bonificadas (quando configurado)
    const { utilizado, limite } = store.limiteMensalDoCliente(base, cliente.id, tipo);
    const novoUso = utilizado + 1;
    if (limite !== null && limite >= 0 && novoUso > limite) {
        return res.status(409).json({
            message: `Limite mensal atingido para ${impacto.rotuloTipo(tipo).toLowerCase()} (${limite}/mês).`,
            utilizado,
            limite,
        });
    }

    const agora = store.agoraIso();
    const acao = {
        id: store.proximoId(base.acoes_impacto),
        cliente_id: cliente.id,
        tipo_acao: tipo,
        quantidade,
        data_recebimento: body.data_recebimento ? new Date(body.data_recebimento).toISOString() : agora,
        ponto_coleta: pontoColeta,
        pontos_bonus: impacto.bonusDe(tipo, quantidade),
        status_validacao: "RECEBIDO",
        status_destinacao: "PENDENTE",
        destino: null,
        data_destinacao: null,
        observacao: body.observacao ? String(body.observacao).trim() : "",
        responsavel_validacao: null,
        pontuacao_processada: false,
        pontuacao_processada_at: null,
        created_at: agora,
        updated_at: agora,
    };

    base.acoes_impacto.push(acao);
    store.salvar("acoes_impacto", base.acoes_impacto);

    const aceita = limite === null || novoUso <= limite;
    return res.status(201).json({
        ...enriquecerAcao(base, acao),
        saldo: store.pontosDisponiveisCliente(base.pontos, cliente.id),
        limite: { utilizado: novoUso, limite },
        regra: impacto.regraTextoDe(tipo),
        aviso:
            limite !== null && novoUso === limite
                ? "Limite mensal configurado atingido: os pontos só são concedidos após aprovação."
                : null,
        mensagem: `Ação registrada para ${cliente.nome} (${impacto.rotuloTipo(tipo)}). ${aceita ? "" : "Limite atingido."}`,
    });
});

// ============================================================
// Validação (triagem)
// ============================================================
router.post("/:id/validar", (req, res) => {
    const base = store.carregar();
    const acao = findAcao(base, req.params.id);
    if (!acao) return res.status(404).json({ message: "Ação de impacto não encontrada." });

    if (acao.status_validacao === "APROVADO" || acao.status_validacao === "RECUSADO") {
        return res.status(409).json({
            message: `Ação já encerrada como ${acao.status_validacao}.`,
            status_validacao: acao.status_validacao,
        });
    }

    acao.status_validacao = "EM_TRIAGEM";
    acao.responsavel_validacao = req.body && req.body.responsavel_validacao
        ? String(req.body.responsavel_validacao)
        : (acao.responsavel_validacao || "Sistema");
    acao.updated_at = store.agoraIso();
    store.salvar("acoes_impacto", base.acoes_impacto);
    return res.json(enriquecerAcao(base, acao));
});

// ============================================================
// Aprovação (única concessão de pontos)
// ============================================================
router.post("/:id/aprovar", (req, res) => {
    const base = store.carregar();
    const acao = findAcao(base, req.params.id);
    if (!acao) return res.status(404).json({ message: "Ação de impacto não encontrada." });

    if (acao.status_validacao === "RECUSADO") {
        return res.status(409).json({ message: "Ação recusada não pode ser aprovada." });
    }

    // PROTEÇÃO DE IDEMPOTÊNCIA: uma ação aprovada gera pontos UMA ÚNICA VEZ.
    // A verificação cobre o marcador pontuacao_processada e o vínculo
    // origem_id da movimentação. Mudar o status depois não duplica pontos.
    const jaPontuada = store.acaoJaPontuada(base, acao);
    if (jaPontuada) {
        return res.status(409).json({
            message: "Pontos já concedidos para esta ação. Nenhum ponto adicional será creditado.",
            status_validacao: acao.status_validacao,
            pontuacao_processada: true,
            movimento: store.movimentoDeBonusDaAcao(base, acao.id) || null,
        });
    }

    const agora = store.agoraIso();
    const bonus = impacto.bonusDe(acao.tipo_acao, acao.quantidade);
    const resultado = store.concederBonusImpacto(base, acao, bonus, new Date(agora));

    if (!resultado.concedido) {
        return res.status(409).json({
            message: "Pontos já concedidos para esta ação.",
            movimento: resultado.movimento || null,
        });
    }

    acao.status_validacao = "APROVADO";
    acao.responsavel_validacao = req.body && req.body.responsavel_validacao
        ? String(req.body.responsavel_validacao)
        : (acao.responsavel_validacao || "Sistema");
    acao.pontos_bonus = resultado.movimento.pontos;
    acao.updated_at = agora;

    store.salvar("pontos", base.pontos);
    store.salvar("acoes_impacto", base.acoes_impacto);

    return res.status(200).json({
        ...enriquecerAcao(base, acao),
        movimento: resultado.movimento,
        regra: impacto.regraTextoDe(acao.tipo_acao),
        novoSaldo: store.pontosDisponiveisCliente(base.pontos, acao.cliente_id, new Date(agora)),
        mensagem: `${resultado.movimento.pontos} pontos de bônus concedidos (${impacto.rotuloOrigem(resultado.movimento.origem)}).`,
    });
});

// ============================================================
// Recusa
// ============================================================
router.post("/:id/recusar", (req, res) => {
    const base = store.carregar();
    const acao = findAcao(base, req.params.id);
    if (!acao) return res.status(404).json({ message: "Ação de impacto não encontrada." });

    if (acao.status_validacao === "APROVADO") {
        return res.status(409).json({ message: "Ação já aprovada. Não é possível recusar após a concessão." });
    }
    if (acao.status_validacao === "RECUSADO") {
        return res.status(409).json({ message: "Ação já recusada." });
    }

    acao.status_validacao = "RECUSADO";
    acao.responsavel_validacao = req.body && req.body.responsavel_validacao
        ? String(req.body.responsavel_validacao)
        : (acao.responsavel_validacao || "Sistema");
    if (req.body && req.body.observacao) {
        acao.observacao = String(req.body.observacao).trim();
    }
    acao.updated_at = store.agoraIso();
    store.salvar("acoes_impacto", base.acoes_impacto);
    return res.json(enriquecerAcao(base, acao));
});

// ============================================================
// Destinação
// ============================================================
router.post("/:id/destinar", (req, res) => {
    const base = store.carregar();
    const acao = findAcao(base, req.params.id);
    if (!acao) return res.status(404).json({ message: "Ação de impacto não encontrada." });

    if (acao.status_validacao !== "APROVADO" && acao.status_validacao !== "RECUSADO") {
        return res.status(422).json({
            message: "Destinação só pode ser registrada após aprovação ou recusa do item.",
        });
    }

    const destino = String((req.body && req.body.destino) || "").trim();
    if (!destino) return res.status(422).json({ message: "Informe o destino." });

    if (acao.tipo_acao === "DEVOLUCAO_CAIXA" && !impacto.destinoCaixaValido(destino)) {
        return res.status(422).json({
            message: "Destino inválido para caixa. Use: " + impacto.DESTINOS_CAIXA.map((d) => d.chave).join(", "),
        });
    }

    acao.destino = destino;
    acao.status_destinacao = "DESTINADO";
    acao.data_destinacao = req.body && req.body.data_destinacao
        ? new Date(req.body.data_destinacao).toISOString()
        : store.agoraIso();
    acao.updated_at = store.agoraIso();
    store.salvar("acoes_impacto", base.acoes_impacto);
    return res.json(enriquecerAcao(base, acao));
});

router.post("/:id/entregar", (req, res) => {
    const base = store.carregar();
    const acao = findAcao(base, req.params.id);
    if (!acao) return res.status(404).json({ message: "Ação de impacto não encontrada." });

    if (acao.status_destinacao === "PENDENTE" && !acao.destino) {
        return res.status(422).json({ message: "Registre o destino antes de marcar como entregue." });
    }

    acao.status_destinacao = "ENTREGUE";
    acao.data_destinacao = acao.data_destinacao || store.agoraIso();
    acao.updated_at = store.agoraIso();
    store.salvar("acoes_impacto", base.acoes_impacto);
    return res.json(enriquecerAcao(base, acao));
});

module.exports = router;