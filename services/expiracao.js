'use strict';

/**
 * Expiração de pontos do programa de fidelidade.
 *
 * Regra única: pontos expiram 12 meses após a data de geração
 * (REGRAS.validadeMeses). data_expiracao = data_movimentacao + 12 meses.
 *
 * Este módulo é idempotente: rodar N vezes nunca duplica a movimentação
 * de EXPIRAÇÃO. A rotina pode ser chamada por script (node scripts/expirar.js)
 * ou por endpoint (POST /api/pontos/expirar).
 *
 * Importante: a LEITURA de saldo (services/indicadores) já desconta os pontos
 * vencidos mesmo antes de a rotina gravar o histórico. A gravação serve para
 * deixar a trilha de auditoria explícita.
 */

const store = require("./store");
const regras = require("./regras");

const TIPO_EXPIRACAO = "expiracao";
const ORIGEM_EXPIRACAO = "EXPIRACAO";

/**
 * Movimentações de acúmulo cujo vencimento já passou e que ainda não
 * possuem o correspondiente lançamento de EXPIRAÇÃO.
 */
function pendentes(base, dataRef) {
    const ref = dataRef || new Date();
    const lancados = new Set(
        (base.pontos || [])
            .filter((m) => m.tipo === TIPO_EXPIRACAO)
            .map((m) => m.origem_id)
            .filter((id) => id !== null && id !== undefined)
    );

    return (base.pontos || []).filter((m) => {
        if (m.tipo !== "acumulo") return false;
        if (lancados.has(m.id)) return false;
        const exp = regras.dataDe(m.data_expiracao);
        if (!exp) return false;
        return exp.getTime() <= ref.getTime();
    });
}

/**
 * Gera (sem gravar) as movimentações de expiração pendentes.
 * Retorna { lancamentos, porCliente, totalPontos }.
 */
function calcularLancamentos(base, dataRef) {
    const ref = dataRef || new Date();
    const lista = pendentes(base, ref);
    const porCliente = new Map();

    const lancamentos = lista.map((m) => {
        porCliente.set(m.cliente_id, (porCliente.get(m.cliente_id) || 0) + Math.abs(Number(m.pontos) || 0));
        return {
            cliente_id: m.cliente_id,
            tipo: TIPO_EXPIRACAO,
            pontos: -Math.abs(Number(m.pontos) || 0),
            data_movimentacao: ref.toISOString(),
            data_expiracao: null,
            compras_id: m.compras_id || 0,
            resgates_id: 0,
            origem: ORIGEM_EXPIRACAO,
            origem_id: m.id,
            create_at: ref.toISOString(),
        };
    });

    return {
        lancamentos,
        totalPontos: lancamentos.reduce((s, l) => s + Math.abs(l.pontos), 0),
        porCliente: [...porCliente.entries()].map(([cliente_id, pontos]) => ({ cliente_id, pontos })),
    };
}

/**
 * Executa a expiração gravando as movimentações. Idempotente.
 * Só escreve no arquivo se houver algo novo a lançar.
 */
function executar(base, dataRef) {
    const ref = dataRef || new Date();
    const previsao = calcularLancamentos(base, ref);
    if (!previsao.lancamentos.length) {
        return { executado: false, totalLancamentos: 0, totalPontos: 0, porCliente: [], detalhes: [] };
    }

    const ids = previsao.lancamentos.map(() => store.proximoId(base.pontos));
    previsao.lancamentos.forEach((l, i) => {
        base.pontos.push({ id: ids[i], ...l });
    });
    store.salvar("pontos", base.pontos);

    return {
        executado: true,
        totalLancamentos: previsao.lancamentos.length,
        totalPontos: previsao.totalPontos,
        porCliente: previsao.porCliente,
        detalhes: previsao.lancamentos,
    };
}

module.exports = {
    TIPO_EXPIRACAO,
    ORIGEM_EXPIRACAO,
    pendentes,
    calcularLancamentos,
    executar,
};
