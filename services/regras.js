'use strict';

/**
 * Regras de negócio centralizadas do programa de fidelidade FATECalçados.
 * Todos os cálculos do sistema devem passar por aqui.
 * As constantes ficam em REGRAS, substituíveis por configuração futura.
 */
const REGRAS = {
    pontos: { reaisPorPonto: 1 },          // R$ 1,00 de compra = 1 ponto base
    validadeMeses: 12,                     // pontos expiram após 12 meses
    conversao: { pontos: 100, valorReal: 5 }, // 100 pontos = R$ 5,00 de desconto
    alertaExpiracaoDias: 30,               // pontos a vencer nos próximos 30 dias
    niveis: [
        { nome: "Bronze", classe: "bronze", minimo: 0,    bonus: 0 },
        { nome: "Prata",  classe: "silver", minimo: 1000, bonus: 0.1 },
        { nome: "Ouro",   classe: "gold",   minimo: 5000, bonus: 0.2 },
    ],
    status: [
        { nome: "ATIVO",   classe: "status-ativo",   minimo: 0,  maximo: 30 },
        { nome: "ATENCAO", classe: "status-atencao", minimo: 31, maximo: 60 },
        { nome: "RISCO",   classe: "status-risco",   minimo: 61, maximo: 90 },
        { nome: "INATIVO", classe: "status-inativo", minimo: 91, maximo: Infinity },
    ],
};

// ============================================================
// Utilitários de data/valor
// ============================================================
function dataDe(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

function diasEntre(inicio, fim) {
    const a = dataDe(inicio);
    const b = dataDe(fim);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function adicionarMeses(data, meses) {
    const d = dataDe(data);
    if (!d) return null;
    const copia = new Date(d.getTime());
    copia.setMonth(copia.getMonth() + meses);
    return copia;
}

function formatarData(iso, comHora) {
    const d = dataDe(iso);
    if (!d) return "—";
    return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...(comHora ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
}

function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });
}

function soDigitos(texto) {
    return String(texto || "").replace(/\D/g, "");
}

function validarCPF(cpf) {
    const dig = soDigitos(cpf);
    if (dig.length !== 11 || /^(\d)\1{10}$/.test(dig)) return false;
    const digitoVerificador = (len) => {
        let soma = 0;
        for (let i = 0; i < len; i++) soma += Number(dig[i]) * (len + 1 - i);
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    };
    return digitoVerificador(9) === Number(dig[9]) && digitoVerificador(10) === Number(dig[10]);
}

// ============================================================
// Pontos e níveis
// ============================================================
function calcularPontos(valorReais, nivel) {
    const valor = Math.max(0, Number(valorReais) || 0);
    const nivelAtual = nivel || REGRAS.niveis[0];
    const base = Math.round(valor / REGRAS.pontos.reaisPorPonto);
    const bonus = Math.round(base * (nivelAtual.bonus || 0));
    return {
        base,
        bonus,
        total: base + bonus,
        multiplicador: 1 + (nivelAtual.bonus || 0),
        bonusPercentual: nivelAtual.bonus || 0,
    };
}

function calcularNivel(totalPontos) {
    const pontos = Math.max(0, Number(totalPontos) || 0);
    const nivel = [...REGRAS.niveis].reverse().find((n) => pontos >= n.minimo) || REGRAS.niveis[0];
    return { ...nivel };
}

function proximoNivel(totalPontos) {
    const pontos = Math.max(0, Number(totalPontos) || 0);
    const proximo = REGRAS.niveis.find((n) => pontos < n.minimo);
    if (!proximo) return null;
    return { ...proximo, pontosRestantes: proximo.minimo - pontos };
}

function calcularDesconto(pontos) {
    return (Math.max(0, Number(pontos) || 0) / REGRAS.conversao.pontos) * REGRAS.conversao.valorReal;
}

function calcularDataExpiracao(dataCompra, meses) {
    return adicionarMeses(dataCompra, meses || REGRAS.validadeMeses);
}

function pontosProximosExpiracao(movimentacoes, dataRef) {
    const ref = dataDe(dataRef) || new Date();
    const limite = adicionarMeses(ref, 0);
    limite.setDate(limite.getDate() + REGRAS.alertaExpiracaoDias);
    return movimentacoes.filter((m) => {
        if (m.tipo !== "acumulo") return false;
        const exp = dataDe(m.data_expiracao);
        return exp && exp.getTime() >= ref.getTime() && exp.getTime() <= limite.getTime();
    });
}

// ============================================================
// Retenção e status
// ============================================================
function calcularDiasSemComprar(ultimaCompra, dataRef) {
    if (!ultimaCompra) return null;
    return diasEntre(ultimaCompra, dataRef);
}

function calcularStatusCliente(diasSemComprar) {
    if (diasSemComprar === null || diasSemComprar === undefined) {
        return { nome: "INATIVO", classe: "status-inativo" };
    }
    const status =
        REGRAS.status.find((s) => diasSemComprar >= s.minimo && diasSemComprar <= s.maximo) ||
        REGRAS.status[REGRAS.status.length - 1];
    return { nome: status.nome, classe: status.classe };
}

function calcularTaxaSegundaCompra(quantidadesPorCliente) {
    const comCompra = quantidadesPorCliente.filter((n) => n >= 1).length;
    const comSegunda = quantidadesPorCliente.filter((n) => n >= 2).length;
    return comCompra ? (comSegunda / comCompra) * 100 : 0;
}

function calcularTempoMedioSegundaCompra(datasPorCliente) {
    let soma = 0;
    let conta = 0;
    datasPorCliente.forEach((datas) => {
        if (datas.length >= 2) {
            const dias = diasEntre(datas[0], datas[1]);
            if (dias !== null) {
                soma += dias;
                conta++;
            }
        }
    });
    return conta ? Math.round(soma / conta) : null;
}

// ============================================================
// RFM
// ============================================================
function calcularRFM({ totalCompras, totalGasto, ultimaCompra, dataRef }) {
    const recencia = ultimaCompra ? diasEntre(ultimaCompra, dataRef) : null;
    return {
        recencia,
        frequencia: totalCompras || 0,
        monetario: totalGasto || 0,
    };
}

function calcularTicketMedio(totalGasto, totalCompras) {
    return totalCompras ? totalGasto / totalCompras : 0;
}

// ============================================================
// Tags sugeridas
// ============================================================
function gerarTags(cliente, info) {
    const tags = [];
    if (cliente.tags && Array.isArray(cliente.tags)) tags.push(...cliente.tags);
    const totalCompras = info.totalCompras || 0;
    const saldo = info.pontosDisponiveis || 0;
    if (totalCompras >= 20) tags.push("VIP");
    else if (totalCompras >= 10) tags.push("Frequente");
    if (totalCompras === 1) tags.push("1ª compra");
    if (info.status === "RISCO") tags.push("Retenção");
    if (info.status === "INATIVO") tags.push("Reativar");
    if (saldo >= 500) tags.push("Alto saldo");
    if (info.proximoNivel && info.proximoNivel.pontosRestantes <= 100) tags.push("Perto do próximo nível");
    return [...new Set(tags)];
}

module.exports = {
    REGRAS,
    dataDe,
    diasEntre,
    adicionarMeses,
    formatarData,
    formatarMoeda,
    soDigitos,
    validarCPF,
    calcularPontos,
    calcularNivel,
    proximoNivel,
    calcularDesconto,
    calcularDataExpiracao,
    pontosProximosExpiracao,
    calcularDiasSemComprar,
    calcularStatusCliente,
    calcularTaxaSegundaCompra,
    calcularTempoMedioSegundaCompra,
    calcularRFM,
    calcularTicketMedio,
    gerarTags,
};