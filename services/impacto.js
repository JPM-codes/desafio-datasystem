'use strict';

/**
 * Regras da campanha de Impacto (logística reversa + ação social).
 * Complementa services/regras.js SEM alterar as regras de compra/fidelidade.
 * Todos os bônus e limites ficam centralizados em CONFIG.
 */
/**
 * Parâmetros nomeados exigidos pelo projeto (configuráveis).
 *   bonus_doacao_calcado = 50
 *   bonus_devolucao_caixa = 20
 *   modo_bonus_calcado / modo_bonus_caixa = POR_ACAO | POR_UNIDADE
 *
 * No MVP adota-se POR_ACAO: 50 pontos por AÇÃO de doação aprovada
 * (independentemente da quantidade entregue) e 20 pontos por AÇÃO de
 * devolução aprovada. A regra visual exibida na interface é gerada a
 * partir daqui, portanto banco e tela nunca divergem.
 */
const MODOS = {
    POR_ACAO: "POR_ACAO",
    POR_UNIDADE: "POR_UNIDADE",
};

const CONFIG = {
    // Pontos concedidos por tipo de ação (configuráveis)
    bonusDoacao: 50,      // DOACAO_CALCADO
    bonusCaixa: 20,       // DEVOLUCAO_CAIXA
    // Modo de apuração do bônus
    modoBonusCalcado: MODOS.POR_ACAO,
    modoBonusCaixa: MODOS.POR_ACAO,
    // Limite mensal de ações bonificadas por cliente.
    // null significa "sem limite rígido" até ser configurado.
    limiteDoacaoMes: null, // ex.: 2 → máx 2 doações bonificadas/mês
    limiteCaixaMes: null,  // ex.: 4 → máx 4 caixas bonificadas/mês
};

const TIPOS = {
    DOACAO_CALCADO: { rotulo: "Doação de calçado", origem: "BONUS_DOACAO", icone: "bi-box2-heart" },
    DEVOLUCAO_CAIXA: { rotulo: "Devolução de caixa", origem: "BONUS_CAIXA", icone: "bi-box-seam" },
};

const VALIDACAO_STATUSES = [
    { nome: "RECEBIDO",   rotulo: "Recebido",   classe: "st-recebido" },
    { nome: "EM_TRIAGEM", rotulo: "Em triagem", classe: "st-emtriagem" },
    { nome: "APROVADO",   rotulo: "Aprovado",   classe: "st-aprovado" },
    { nome: "RECUSADO",   rotulo: "Recusado",   classe: "st-recusado" },
];

const DESTINACAO_STATUSES = [
    { nome: "PENDENTE",  rotulo: "Aguardando destinação", classe: "st-pendente" },
    { nome: "DESTINADO", rotulo: "Destinado",             classe: "st-destinado" },
    { nome: "ENTREGUE",  rotulo: "Entregue",              classe: "st-entregue" },
];

const DESTINOS_CAIXA = [
    { chave: "REUTILIZACAO", rotulo: "Reutilização" },
    { chave: "RECICLAGEM",   rotulo: "Reciclagem" },
    { chave: "OUTRO",        rotulo: "Outro" },
];

const ORIGENS_PONTOS = [
    { nome: "COMPRA",        rotulo: "Compra" },
    { nome: "BONUS_DOACAO",  rotulo: "Bônus doação de calçado" },
    { nome: "BONUS_CAIXA",   rotulo: "Bônus devolução de caixa" },
    { nome: "RESGATE",       rotulo: "Resgate" },
    { nome: "EXPIRACAO",     rotulo: "Expiração" },
    { nome: "AJUSTE",        rotulo: "Ajuste" },
];

function tipoValido(tipo) {
    return Boolean(TIPOS[tipo]);
}

function origemDe(tipo) {
    const t = TIPOS[tipo];
    return t ? t.origem : null;
}

function modoDe(tipo) {
    if (tipo === "DOACAO_CALCADO") return CONFIG.modoBonusCalcado;
    if (tipo === "DEVOLUCAO_CAIXA") return CONFIG.modoBonusCaixa;
    return MODOS.POR_ACAO;
}

function bonusBaseDe(tipo) {
    if (tipo === "DOACAO_CALCADO") return CONFIG.bonusDoacao;
    if (tipo === "DEVOLUCAO_CAIXA") return CONFIG.bonusCaixa;
    return 0;
}

/**
 * Pontos de uma ação de impacto.
 *  - POR_ACAO    → 50 pts por ação aprovada (independentemente da quantidade)
 *  - POR_UNIDADE → 50 pts por calçado / 20 pts por caixa (quantidade × base)
 */
function bonusDe(tipo, quantidade) {
    const base = bonusBaseDe(tipo);
    if (modoDe(tipo) === MODOS.POR_UNIDADE) {
        const qtd = Math.max(1, Math.round(Number(quantidade) || 1));
        return base * qtd;
    }
    return base;
}

/** Texto exibido na interface — sempre coerente com o cálculo do banco. */
function regraTextoDe(tipo) {
    const base = bonusBaseDe(tipo);
    const porUnidade = modoDe(tipo) === MODOS.POR_UNIDADE;
    if (tipo === "DOACAO_CALCADO") {
        return porUnidade
            ? `+${base} pontos por calçado doado`
            : `+${base} pontos por ação de doação de calçados aprovada`;
    }
    if (tipo === "DEVOLUCAO_CAIXA") {
        return porUnidade
            ? `+${base} pontos por caixa devolvida`
            : `+${base} pontos por ação de devolução de caixas aprovada`;
    }
    return "";
}

function limiteDe(tipo) {
    if (tipo === "DOACAO_CALCADO") return CONFIG.limiteDoacaoMes;
    if (tipo === "DEVOLUCAO_CAIXA") return CONFIG.limiteCaixaMes;
    return null;
}

function rotuloTipo(tipo) {
    const t = TIPOS[tipo];
    return t ? t.rotulo : tipo;
}

function rotuloOrigem(origem) {
    const o = ORIGENS_PONTOS.find((x) => x.nome === origem);
    return o ? o.rotulo : origem;
}

function statusValidacao(nome) {
    return VALIDACAO_STATUSES.find((s) => s.nome === nome) || { nome, rotulo: nome, classe: "" };
}

function statusDestinacao(nome) {
    return DESTINACAO_STATUSES.find((s) => s.nome === nome) || { nome, rotulo: nome, classe: "" };
}

function destinoCaixaValido(destino) {
    return DESTINOS_CAIXA.some((d) => d.chave === destino);
}

function rotuloDestino(destino) {
    const d = DESTINOS_CAIXA.find((x) => x.chave === destino);
    return d ? d.rotulo : destino;
}

function config() {
    return {
        bonusDoacao: CONFIG.bonusDoacao,
        bonusCaixa: CONFIG.bonusCaixa,
        modoBonusCalcado: CONFIG.modoBonusCalcado,
        modoBonusCaixa: CONFIG.modoBonusCaixa,
        limiteDoacaoMes: CONFIG.limiteDoacaoMes,
        limiteCaixaMes: CONFIG.limiteCaixaMes,
        textos: {
            DOACAO_CALCADO: regraTextoDe("DOACAO_CALCADO"),
            DEVOLUCAO_CAIXA: regraTextoDe("DEVOLUCAO_CAIXA"),
        },
        regras: {
            bonusConfiguravel: true,
            saldoIntegrado: true,
            expiracaoMeses: 12,
            idempotencia: true,
        },
    };
}

module.exports = {
    CONFIG,
    MODOS,
    TIPOS,
    VALIDACAO_STATUSES,
    DESTINACAO_STATUSES,
    DESTINOS_CAIXA,
    ORIGENS_PONTOS,
    tipoValido,
    origemDe,
    bonusBaseDe,
    bonusDe,
    modoDe,
    regraTextoDe,
    limiteDe,
    rotuloTipo,
    rotuloOrigem,
    statusValidacao,
    statusDestinacao,
    destinoCaixaValido,
    rotuloDestino,
    config,
};