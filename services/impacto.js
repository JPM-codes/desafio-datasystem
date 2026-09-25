'use strict';

/**
 * Regras da campanha de Impacto (logística reversa + ação social).
 * Complementa services/regras.js SEM alterar as regras de compra/fidelidade.
 * Todos os bônus e limites ficam centralizados em CONFIG.
 */
const CONFIG = {
    // Pontos concedidos por tipo de ação (configuráveis)
    bonusDoacao: 50,      // DOACAO_CALCADO
    bonusCaixa: 20,       // DEVOLUCAO_CAIXA
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

function bonusDe(tipo) {
    if (tipo === "DOACAO_CALCADO") return CONFIG.bonusDoacao;
    if (tipo === "DEVOLUCAO_CAIXA") return CONFIG.bonusCaixa;
    return 0;
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
        limiteDoacaoMes: CONFIG.limiteDoacaoMes,
        limiteCaixaMes: CONFIG.limiteCaixaMes,
        regras: {
            bonusConfiguravel: true,
            saldoIntegrado: true,
            expiracaoMeses: 12,
        },
    };
}

module.exports = {
    CONFIG,
    TIPOS,
    VALIDACAO_STATUSES,
    DESTINACAO_STATUSES,
    DESTINOS_CAIXA,
    ORIGENS_PONTOS,
    tipoValido,
    origemDe,
    bonusDe,
    limiteDe,
    rotuloTipo,
    rotuloOrigem,
    statusValidacao,
    statusDestinacao,
    destinoCaixaValido,
    rotuloDestino,
    config,
};