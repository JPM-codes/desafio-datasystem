'use strict';

/**
 * Camada de acesso aos dados (JSON) e agregações do programa de fidelidade.
 * Toda leitura/escrita da "base" deve passar por aqui.
 */
const fs = require("fs");
const path = require("path");
const regras = require("./regras");
const impacto = require("./impacto");
const indicadores = require("./indicadores");
const expiracao = require("./expiracao");

const DIR = path.join(__dirname, "..", "public", "database");

function ler(nome) {
    const caminho = path.join(DIR, `${nome}.json`);
    return JSON.parse(fs.readFileSync(caminho, "utf8"));
}

function lerOuVazio(nome) {
    const caminho = path.join(DIR, `${nome}.json`);
    if (!fs.existsSync(caminho)) return [];
    return JSON.parse(fs.readFileSync(caminho, "utf8"));
}

function salvar(nome, dados) {
    const caminho = path.join(DIR, `${nome}.json`);
    fs.writeFileSync(caminho, `${JSON.stringify(dados, null, 4)}\n`, "utf8");
}

function proximoId(lista) {
    return lista.reduce((maior, item) => Math.max(maior, item.id || 0), 0) + 1;
}

function carregar() {
    return {
        clientes: ler("cliente"),
        compras: ler("compras"),
        pontos: ler("pontos"),
        resgates: ler("resgate"),
        acoes_impacto: lerOuVazio("acoes_impacto"),
    };
}

function agoraIso() {
    return new Date().toISOString();
}

// ============================================================
// Pontos por cliente
// ============================================================
function movimentacoesDoCliente(pontos, clienteId) {
    return pontos.filter((m) => m.cliente_id === clienteId);
}

function totaisPontos(pontos, dataRef) {
    return indicadores.totaisDeMovimentos(pontos, dataRef);
}

function pontosDisponiveisCliente(pontos, clienteId, dataRef) {
    return indicadores.saldoDisponivelDeMovimentos(
        pontos.filter((m) => m.cliente_id === clienteId),
        dataRef
    );
}

function resgatesDoCliente(resgates, clienteId) {
    return resgates.filter((r) => r.cliente_id === clienteId);
}

function comprasDoCliente(compras, clienteId) {
    return compras
        .filter((c) => c.cliente_id === clienteId)
        .sort((a, b) => new Date(a.data_compra) - new Date(b.data_compra));
}

function iniciaisDoNome(nome) {
    return String(nome || "")
        .split(" ")
        .filter((p) => p.length > 0)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join("");
}

// ============================================================
// Enriquecimento (cliente + indicadores)
// ============================================================
function enriquecerCliente(cliente, base, dataRef) {
    if (!cliente) return null;
    const ref = dataRef || new Date();
    const comprasC = comprasDoCliente(base.compras, cliente.id);
    const totalCompras = comprasC.length;
    const totalGasto = comprasC.reduce((s, c) => s + c.valor_total, 0);
    const primeiraCompra = totalCompras ? comprasC[0].data_compra : null;
    const ultimaCompra = totalCompras ? comprasC[totalCompras - 1].data_compra : null;

    const movs = movimentacoesDoCliente(base.pontos, cliente.id);
    const tot = indicadores.totaisDeMovimentos(movs, ref);

    const pontosAcumulados = tot.acumulados;
    const pontosResgatados = tot.resgatados;
    const pontosExpirados = tot.expiradosEfetivos;
    const pontosDisponiveis = tot.disponiveis;
    const pontosImpacto = tot.geradosImpacto;

    const nivel = regras.calcularNivel(pontosAcumulados);
    const proximo = regras.proximoNivel(pontosAcumulados);
    const diasSemComprar = regras.calcularDiasSemComprar(ultimaCompra, ref);
    const status = regras.calcularStatusCliente(diasSemComprar);
    const ticketMedio = regras.calcularTicketMedio(totalGasto, totalCompras);
    const rfm = regras.calcularRFM({ totalCompras, totalGasto, ultimaCompra, dataRef: ref });
    const impactoCliente = resumoImpactoDoCliente(base, cliente.id);

    const infosPorTags = { totalCompras, status: status.nome, pontosDisponiveis, proximoNivel: proximo };
    const tags = regras.gerarTags(cliente, infosPorTags);

    return {
        ...cliente,
        compras: comprasC,
        totalCompras,
        totalGasto,
        primeiraCompra,
        ultimaCompra,
        diasSemComprar,
        status,
        nivel,
        nivelBase: "PONTOS_ACUMULADOS",
        proximoNivel: proximo,
        ticketMedio,
        rfm,
        pontosAcumulados,
        pontosResgatados,
        pontosExpirados,
        pontosDisponiveis,
        pontosImpacto,
        pontos: pontosDisponiveis,
        valorPotencial: regras.calcularDesconto(pontosDisponiveis),
        resgates: resgatesDoCliente(base.resgates, cliente.id),
        impacto: impactoCliente,
        calcadosDoados: impactoCliente.calcados,
        caixasDevolvidas: impactoCliente.caixas,
        acoesImpacto: impactoCliente.totalAcoes,
        iniciais: iniciaisDoNome(cliente.nome),
        cpf: regras.soDigitos(cliente.documento),
        tags,
        preferencias: cliente.preferencias || {},
    };
}

function enriquecerClientes(base, dataRef) {
    return base.clientes.map((cliente) => enriquecerCliente(cliente, base, dataRef));
}

// ============================================================
// Agregações do Dashboard
// ============================================================
/**
 * Dashboard principal. Todos os números vêm de services/indicadores.js
 * (fonte única de verdade). Nenhum valor é fixado aqui.
 */
function dashboard(base, dataRef) {
    const ref = dataRef || new Date();
    const ind = indicadores.calcular(base, ref);
    const clientes = enriquecerClientes(base, ref);

    // Ranking: ordenado por PONTOS ACUMULADOS (conceito diferente de saldo disponível)
    const rankingAcumulados = [...clientes].sort(
        (a, b) => b.pontosAcumulados - a.pontosAcumulados || b.pontosDisponiveis - a.pontosDisponiveis
    );
    const rankingSaldo = [...clientes].sort(
        (a, b) => b.pontosDisponiveis - a.pontosDisponiveis || b.pontosAcumulados - a.pontosAcumulados
    );

    const alertas = gerarAlertas(clientes, base, ref, ind.pontos.disponiveis);

    return {
        dataAtual: ref.toISOString(),
        indicadores: ind,
        totais: {
            clientes: ind.base.clientes,
            compras: ind.base.compras,
            resgates: ind.base.resgates,
            acoesImpacto: ind.base.acoesImpacto,
            movimentacoes: ind.base.movimentacoes,

            faturamento: ind.compras.faturamento,
            ticketMedioGlobal: ind.compras.ticketMedio,

            pontosGeradosCompras: ind.pontos.geradosCompras,
            bonusCompras: ind.pontos.bonusCompras,
            pontosImpacto: ind.pontos.geradosImpacto,
            pontosAcumulados: ind.pontos.acumulados,
            pontosResgatados: ind.pontos.resgatados,
            pontosExpirados: ind.pontos.expirados,
            pontosDisponiveis: ind.pontos.disponiveis,
            pontosAExpirar: expiracao
                .calcularLancamentos(base, ref).totalPontos,

            valorResgates: ind.resgates.valorDescontos,
            custoPrograma: ind.resgates.custoPrograma,
            valorPotencial: regras.calcularDesconto(ind.pontos.disponiveis),
        },
        niveis: ind.niveis,
        status: ind.status,
        retencao: ind.retencao,
        reconciliacao: ind.reconciliacao,
        evolucaoPontos: ind.evolucao.pontos,
        evolucaoClientes: ind.evolucao.clientes,
        ranking: rankingAcumulados.slice(0, 5),
        rankingSaldo: rankingSaldo.slice(0, 5),
        alertas,
    };
}

/** Mantido por compatibilidade: meses com movimentação (compras/resgates). */
function mesesComMovimentacao(compras, resgates, quantidade) {
    const movimentos = [
        ...compras.map((c) => ({ data_movimentacao: c.data_compra })),
        ...resgates.map((r) => ({ data_movimentacao: r.data_resgate })),
    ];
    return indicadores.mesesComMovimentacaoPontos(movimentos, quantidade);
}

function gerarAlertas(clientes, base, dataRef, pontosDisponiveis) {
    const alertas = [];
    const emRisco = clientes.filter((c) => c.status.nome === "RISCO" || c.status.nome === "INATIVO");
    const comSaldoParado = clientes.filter(
        (c) => (c.status.nome === "RISCO" || c.status.nome === "INATIVO") && c.pontosDisponiveis > 0
    );
    const umaCompra = clientes.filter((c) => c.totalCompras === 1);
    const aExpirar = regras.pontosProximosExpiracao(base.pontos, dataRef);
    const pontosAExpirar = aExpirar.reduce((s, m) => s + Math.abs(m.pontos), 0);

    if (emRisco.length) {
        alertas.push({
            icone: "bi-exclamation-triangle",
            tom: "danger",
            texto: `${emRisco.length} cliente(s) há mais de 60 dias sem comprar.`,
            link: "/clientes?status=RISCO",
            rotulo: "Ver clientes",
        });
    }
    if (comSaldoParado.length) {
        alertas.push({
            icone: "bi-piggy-bank",
            tom: "warning",
            texto: `${comSaldoParado.length} cliente(s) com pontos disponíveis parados (sem comprar há 60+ dias).`,
            link: "/clientes?status=RISCO&min_pontos=1",
            rotulo: "Oportunidade",
        });
    }
    if (umaCompra.length) {
        alertas.push({
            icone: "bi-person-check",
            tom: "info",
            texto: `${umaCompra.length} cliente(s) fizeram apenas uma compra — foco de recompra.`,
            link: "/clientes?min_compras=1&max_compras=1",
            rotulo: "Ver clientes",
        });
    }
    const taxa = regras.calcularTaxaSegundaCompra(clientes.map((c) => c.totalCompras));
    alertas.push({
        icone: "bi-graph-up",
        tom: "primary",
        texto: `Taxa de segunda compra em ${taxa.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%.`,
        link: "/inteligencia",
        rotulo: "Inteligência",
    });
    if (pontosAExpirar > 0) {
        alertas.push({
            icone: "bi-hourglass-split",
            tom: "warning",
            texto: `${pontosAExpirar.toLocaleString("pt-BR")} pontos a vencer nos próximos ${regras.REGRAS.alertaExpiracaoDias} dias.`,
            link: "/inteligencia",
            rotulo: "Ver",
        });
    }
    return alertas;
}

// ============================================================
// Campanha de Impacto (doações + devolução de caixas)
// ============================================================
function acoesDoCliente(base, clienteId) {
    return (base.acoes_impacto || []).filter((a) => a.cliente_id === clienteId);
}

function movimentosImpactoDoCliente(base, clienteId) {
    return (base.pontos || []).filter(
        (m) =>
            m.cliente_id === clienteId &&
            (m.origem === "BONUS_DOACAO" || m.origem === "BONUS_CAIXA")
    );
}

function resumoImpactoDoCliente(base, clienteId, dataRef) {
    const ref = dataRef || new Date();
    const acoes = acoesDoCliente(base, clienteId);
    const calcados = acoes
        .filter((a) => a.tipo_acao === "DOACAO_CALCADO")
        .reduce((s, a) => s + (Number(a.quantidade) || 0), 0);
    const caixas = acoes
        .filter((a) => a.tipo_acao === "DEVOLUCAO_CAIXA")
        .reduce((s, a) => s + (Number(a.quantidade) || 0), 0);
    const movimentos = movimentosImpactoDoCliente(base, clienteId);
    const pontosBonus = movimentos
        .filter((m) => indicadores.totaisDeMovimentos([m], ref).gerados > 0)
        .reduce((s, m) => s + (Number(m.pontos) || 0), 0);
    const acoesPontuadas = new Set(movimentos.map((m) => m.origem_id));
    const ultimaParticipacao = acoes.length
        ? [...acoes].sort(
              (a, b) => new Date(b.data_recebimento) - new Date(a.data_recebimento)
          )[0].data_recebimento
        : null;
    return {
        acoes,
        calcados,
        caixas,
        totalAcoes: acoes.length,
        pontosBonus,
        acoesPontuadas: acoesPontuadas.size,
        ultimaParticipacao,
    };
}

function mesesDeAcoes(acoes, quantidade) {
    return indicadores.mesesComMovimentacaoPontos(
        acoes.map((a) => ({ data_movimentacao: a.data_recebimento })),
        quantidade
    );
}

function dashboardImpacto(base, dataRef) {
    const acoes = base.acoes_impacto || [];
    const ref = dataRef || new Date();
    const qtde = (lista) => lista.reduce((s, a) => s + (Number(a.quantidade) || 0), 0);
    const acoesCalcado = acoes.filter((a) => a.tipo_acao === "DOACAO_CALCADO");
    const acoesCaixa = acoes.filter((a) => a.tipo_acao === "DEVOLUCAO_CAIXA");
    const participantesSet = new Set(acoes.map((a) => a.cliente_id));
    const participantes = participantesSet.size;
    const pontosBonus = (base.pontos || [])
        .filter((m) => m.origem === "BONUS_DOACAO" || m.origem === "BONUS_CAIXA")
        .reduce((s, m) => s + (m.pontos || 0), 0);

    const porStatus = (nome) => acoes.filter((a) => a.status_validacao === nome);
    const porDest = (nome) => acoes.filter((a) => a.status_destinacao === nome);
    const destinados = acoes.filter((a) => a.status_destinacao === "DESTINADO");
    const entregues = acoes.filter((a) => a.status_destinacao === "ENTREGUE");
    const comDestinacao = [...destinados, ...entregues];

    // Semântica dos indicadores (Prioridade 7):
    //  ITENS ARRECADADOS        = todos os itens recebidos (qualquer status)
    //  ITENS DESTINADOS         = itens que já possuem destinação registrada (DESTINADO/ENTREGUE)
    //  AGUARDANDO DESTINAÇÃO    = itens aprovados e ainda não destinados (recorte operacional)
    //  AGUARDANDO SEM REGISTRO  = itens recebidos/em triagem que ainda não tiveram destinação
    //  SEM DESTINAÇÃO           = soma dos dois anteriores (fecha com ARRECADADOS)
    const pendentesDest = acoes.filter((a) => a.status_destinacao === "PENDENTE");
    const aguardandoAcoes = pendentesDest.filter((a) => a.status_validacao === "APROVADO");
    const semRegistroAcoes = pendentesDest.filter((a) => a.status_validacao !== "APROVADO");
    const aguardandoItens = qtde(aguardandoAcoes);
    const semRegistroItens = qtde(semRegistroAcoes);
    const naoAprovadosItens = qtde(acoes.filter((a) => a.status_validacao !== "APROVADO"));

    const porTipo = (tipo, lista) => {
        const daquele = lista.filter((a) => a.tipo_acao === tipo);
        return {
            acoes: daquele.length,
            quantidade: qtde(daquele),
            aprovadas: daquele.filter((a) => a.status_validacao === "APROVADO").length,
            aprovadasQuantidade: qtde(daquele.filter((a) => a.status_validacao === "APROVADO")),
        };
    };

    const evolucao = mesesDeAcoes(acoes, 6).map((mes) => {
        const doMes = acoes.filter((a) => indicadores.chaveMes(a.data_recebimento) === mes.chave);
        return {
            label: mes.label,
            chave: mes.chave,
            calcados: qtde(doMes.filter((a) => a.tipo_acao === "DOACAO_CALCADO")),
            caixas: qtde(doMes.filter((a) => a.tipo_acao === "DEVOLUCAO_CAIXA")),
            participantes: new Set(doMes.map((a) => a.cliente_id)).size,
        };
    });

    const ranking = rankingImpacto(base, ref, 5);

    return {
        dataAtual: ref.toISOString(),
        totais: {
            calcados: qtde(acoesCalcado),
            caixas: qtde(acoesCaixa),
            itens: qtde(acoes),
            clientesParticipantes: participantes,
            totalClientes: base.clientes.length,
            taxaParticipacao: base.clientes.length ? (participantes / base.clientes.length) * 100 : 0,
            pontosBonusConcedidos: pontosBonus,
            acoesTotal: acoes.length,
        },
        validacao: {
            RECEBIDO: porStatus("RECEBIDO").length,
            EM_TRIAGEM: porStatus("EM_TRIAGEM").length,
            APROVADO: porStatus("APROVADO").length,
            RECUSADO: porStatus("RECUSADO").length,
            aguardandoTriagem: porStatus("RECEBIDO").length,
        },
        itens: {
            arrecadados: qtde(acoes),
            destinados: qtde(comDestinacao),
            aguardandoDestinacao: aguardandoItens,
            aguardandoAprovados: aguardandoItens,
            aguardandoSemRegistro: semRegistroItens,
            aguardandoTotal: aguardandoItens + semRegistroItens,
            semDestinacao: aguardandoItens + semRegistroItens,
            itensNaoAprovados: naoAprovadosItens,
            acoesDestinadas: comDestinacao.length,
            acoesAguardandoDestinacao: aguardandoAcoes.length,
            acoesSemDestinacao: pendentesDest.length,
            fecha: qtde(acoes) === qtde(comDestinacao) + aguardandoItens + semRegistroItens,
        },
        destinacao: {
            PENDENTE: pendentesDest.length,
            DESTINADO: destinados.length,
            ENTREGUE: entregues.length,
            itensDestinados: qtde(comDestinacao),
            itensArrecadados: qtde(acoes),
            aguardandoDestinacao: aguardandoItens,
            aguardandoSemRegistro: semRegistroItens,
            aguardandoTotal: aguardandoItens + semRegistroItens,
        },
        porTipo: {
            DOACAO_CALCADO: porTipo("DOACAO_CALCADO", acoes),
            DEVOLUCAO_CAIXA: porTipo("DEVOLUCAO_CAIXA", acoes),
        },
        evolucao,
        ranking,
        configuraveis: {
            bonusDoacao: impacto.CONFIG.bonusDoacao,
            bonusCaixa: impacto.CONFIG.bonusCaixa,
            modoBonusCalcado: impacto.CONFIG.modoBonusCalcado,
            modoBonusCaixa: impacto.CONFIG.modoBonusCaixa,
            limiteDoacaoMes: impacto.CONFIG.limiteDoacaoMes,
            limiteCaixaMes: impacto.CONFIG.limiteCaixaMes,
            textoCalcado: impacto.regraTextoDe("DOACAO_CALCADO"),
            textoCaixa: impacto.regraTextoDe("DEVOLUCAO_CAIXA"),
        },
    };
}

function rankingImpacto(base, dataRef, limite) {
    const ref = dataRef || new Date();
    const resumos = base.clientes.map((cliente) => {
        const r = resumoImpactoDoCliente(base, cliente.id, ref);
        return {
            cliente_id: cliente.id,
            nome: cliente.nome,
            iniciais: iniciaisDoNome(cliente.nome),
            calcados: r.calcados,
            caixas: r.caixas,
            acoes: r.totalAcoes,
            pontosBonus: r.pontosBonus,
            ultimaParticipacao: r.ultimaParticipacao,
        };
    });
    const participantes = resumos
        .filter((r) => r.acoes > 0)
        .sort((a, b) => b.pontosBonus - a.pontosBonus || b.acoes - a.acoes);
    return limite ? participantes.slice(0, limite) : participantes;
}

/**
 * PROTEÇÃO DE IDEMPOTÊNCIA DA CAMPANHA DE IMPACTO.
 * Uma ação aprovada gera pontos UMA única vez. A verificação é feita por
 * origem_id (movimentação vinculada à ação) e pelo marcador
 * pontuacao_processada na própria ação.
 */
function movimentoDeBonusDaAcao(base, acaoId) {
    return (base.pontos || []).find(
        (m) => m.origem_id === acaoId && (m.origem === "BONUS_DOACAO" || m.origem === "BONUS_CAIXA")
    );
}

function acaoJaPontuada(base, acao) {
    if (acao.pontuacao_processada === true) return true;
    if (acao.pontuacao_processada_at) return true;
    return Boolean(movimentoDeBonusDaAcao(base, acao.id));
}

/**
 * Concede o bônus de uma ação de impacto exatamente uma vez.
 * Retorna { concedido, movimento, motivo }.
 */
function concederBonusImpacto(base, acao, bonus, dataRef) {
    if (acaoJaPontuada(base, acao)) {
        return { concedido: false, motivo: "JA_PONTUADA", movimento: movimentoDeBonusDaAcao(base, acao.id) };
    }
    const ref = dataRef || new Date();
    const agora = ref.toISOString();
    const expiracao = regras.calcularDataExpiracao(agora, regras.REGRAS.validadeMeses);
    const movimento = {
        id: proximoId(base.pontos),
        cliente_id: acao.cliente_id,
        tipo: "acumulo",
        pontos: bonus,
        data_movimentacao: agora,
        data_expiracao: expiracao ? expiracao.toISOString() : null,
        compras_id: 0,
        resgates_id: 0,
        origem: impacto.origemDe(acao.tipo_acao),
        origem_id: acao.id,
        create_at: agora,
    };
    base.pontos.push(movimento);
    acao.pontuacao_processada = true;
    acao.pontuacao_processada_at = agora;
    acao.pontos_bonus = bonus;
    return { concedido: true, movimento, motivo: null };
}

function limiteMensalDoCliente(base, clienteId, tipo, dataRef) {
    const ref = dataRef || new Date();
    const chave = ref.toISOString().slice(0, 7);
    const limite = impacto.limiteDe(tipo);
    const emAberto = (base.acoes_impacto || []).filter(
        (a) =>
            a.cliente_id === clienteId &&
            a.tipo_acao === tipo &&
            a.status_validacao !== "RECUSADO" &&
            String(a.data_recebimento).startsWith(chave)
    ).length;
    return { utilizado: emAberto, limite };
}

function relatorioImpacto(base, filtro, dataRef) {
    const f = filtro || {};
    const inicio = f.data_inicio ? new Date(f.data_inicio) : null;
    const fim = f.data_fim ? new Date(f.data_fim) : null;
    const ponto = String(f.ponto_coleta || "").trim().toLowerCase();

    const acoes = (base.acoes_impacto || []).filter((a) => {
        const data = new Date(a.data_recebimento);
        if (inicio && data < inicio) return false;
        if (fim) {
            const fimFim = new Date(fim);
            fimFim.setHours(23, 59, 59, 999);
            if (data > fimFim) return false;
        }
        if (ponto && String(a.ponto_coleta || "").toLowerCase() !== ponto) return false;
        return true;
    });

    const qtde = (lista) => lista.reduce((s, a) => s + (Number(a.quantidade) || 0), 0);
    const aprovadas = acoes.filter((a) => a.status_validacao === "APROVADO");
    const destinadas = acoes.filter((a) => ["DESTINADO", "ENTREGUE"].includes(a.status_destinacao));

    return {
        periodo: {
            inicio: f.data_inicio || null,
            fim: f.data_fim || null,
            ponto_coleta: f.ponto_coleta || null,
        },
        calcados: qtde(acoes.filter((a) => a.tipo_acao === "DOACAO_CALCADO")),
        caixas: qtde(acoes.filter((a) => a.tipo_acao === "DEVOLUCAO_CAIXA")),
        participantes: new Set(acoes.map((a) => a.cliente_id)).size,
        pontosConcedidos: aprovadas.reduce((s, a) => s + (Number(a.pontos_bonus) || 0), 0),
        itensDestinados: qtde(destinadas),
        aguardandoDestinacao: qtde(acoes.filter((a) => a.status_destinacao === "PENDENTE")),
        acoesTotal: acoes.length,
    };
}

module.exports = {
    DIR,
    ler,
    salvar,
    proximoId,
    carregar,
    agoraIso,
    movimentacoesDoCliente,
    totaisPontos,
    pontosDisponiveisCliente,
    resgatesDoCliente,
    comprasDoCliente,
    iniciaisDoNome,
    enriquecerCliente,
    enriquecerClientes,
    dashboard,
    mesesComMovimentacao,
    acoesDoCliente,
    movimentosImpactoDoCliente,
    resumoImpactoDoCliente,
    dashboardImpacto,
    rankingImpacto,
    limiteMensalDoCliente,
    relatorioImpacto,
    movimentoDeBonusDaAcao,
    acaoJaPontuada,
    concederBonusImpacto,
    indicadores,
    expiracao,
};