'use strict';

/**
 * Camada de acesso aos dados (JSON) e agregações do programa de fidelidade.
 * Toda leitura/escrita da "base" deve passar por aqui.
 */
const fs = require("fs");
const path = require("path");
const regras = require("./regras");

const DIR = path.join(__dirname, "..", "public", "database");

function ler(nome) {
    const caminho = path.join(DIR, `${nome}.json`);
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

function totaisPontos(pontos) {
    return pontos.reduce(
        (acc, m) => {
            const valor = m.pontos || 0;
            if (m.tipo === "acumulo") acc.acumulado += valor;
            else if (m.tipo === "resgate") acc.resgatado += Math.abs(valor);
            else if (m.tipo === "expiracao") acc.expirado += Math.abs(valor);
            return acc;
        },
        { acumulado: 0, resgatado: 0, expirado: 0 }
    );
}

function pontosDisponiveisCliente(pontos, clienteId) {
    let saldo = 0;
    pontos.forEach((m) => {
        if (m.cliente_id !== clienteId) return;
        if (m.tipo === "acumulo") saldo += m.pontos;
        else if (m.tipo === "resgate" || m.tipo === "expiracao") saldo -= Math.abs(m.pontos || 0);
        else if (m.tipo === "ajuste") saldo += m.pontos;
    });
    return Math.max(0, saldo);
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
    const ref = dataRef || new Date();
    const comprasC = comprasDoCliente(base.compras, cliente.id);
    const totalCompras = comprasC.length;
    const totalGasto = comprasC.reduce((s, c) => s + c.valor_total, 0);
    const primeiraCompra = totalCompras ? comprasC[0].data_compra : null;
    const ultimaCompra = totalCompras ? comprasC[totalCompras - 1].data_compra : null;

    const pontosAcumulados = base.pontos
        .filter((m) => m.cliente_id === cliente.id && m.tipo === "acumulo")
        .reduce((s, m) => s + m.pontos, 0);
    const pontosResgatados = base.pontos
        .filter((m) => m.cliente_id === cliente.id && m.tipo === "resgate")
        .reduce((s, m) => s + Math.abs(m.pontos), 0);
    const pontosDisponiveis = pontosDisponiveisCliente(base.pontos, cliente.id);

    const nivel = regras.calcularNivel(pontosAcumulados);
    const proximo = regras.proximoNivel(pontosAcumulados);
    const diasSemComprar = regras.calcularDiasSemComprar(ultimaCompra, ref);
    const status = regras.calcularStatusCliente(diasSemComprar);
    const ticketMedio = regras.calcularTicketMedio(totalGasto, totalCompras);
    const rfm = regras.calcularRFM({ totalCompras, totalGasto, ultimaCompra, dataRef: ref });

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
        proximoNivel: proximo,
        ticketMedio,
        rfm,
        pontosAcumulados,
        pontosResgatados,
        pontosDisponiveis,
        pontos: pontosDisponiveis,
        valorPotencial: regras.calcularDesconto(pontosDisponiveis),
        resgates: resgatesDoCliente(base.resgates, cliente.id),
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
function dashboard(base, dataRef) {
    const ref = dataRef || new Date();
    const clientes = enriquecerClientes(base, ref);

    const totais = totaisPontos(base.pontos);
    const totalValorResgates = base.resgates.reduce((s, r) => s + r.valor_desconto, 0);
    const totalGasto = base.compras.reduce((s, c) => s + c.valor_total, 0);
    const pontosDisponiveis = Math.max(0, totais.acumulado - totais.resgatado - totais.expirado);

    const porStatus = (nome) => clientes.filter((c) => c.status.nome === nome).length;
    const porNivel = (nome) => clientes.filter((c) => c.nivel.nome === nome).length;

    const quantidades = clientes.map((c) => c.totalCompras);
    const datasPorCliente = clientes.map((c) => (c.compras || []).map((c2) => c2.data_compra));

    const mesesEvolucao = mesesComMovimentacao(base.compras, base.resgates, 6);

    const evolucaoPontos = mesesEvolucao.map((mes) => ({
        label: mes.label,
        chave: mes.chave,
        gerados: base.pontos
            .filter((p) => p.tipo === "acumulo" && String(p.data_movimentacao).startsWith(mes.chave))
            .reduce((s, p) => s + p.pontos, 0),
        resgatados: base.pontos
            .filter((p) => p.tipo === "resgate" && String(p.data_movimentacao).startsWith(mes.chave))
            .reduce((s, p) => s + Math.abs(p.pontos), 0),
    }));

    const evolucaoClientes = mesesEvolucao.map((mes) => {
        const comprasMes = base.compras.filter((c) => String(c.data_compra).startsWith(mes.chave));
        const clientesAtivos = new Set(comprasMes.map((c) => c.cliente_id)).size;
        return {
            label: mes.label,
            chave: mes.chave,
            compras: comprasMes.length,
            ativos: clientesAtivos,
        };
    });

    const ranking = [...clientes].sort((a, b) => b.pontosDisponiveis - a.pontosDisponiveis);

    const alertas = gerarAlertas(clientes, base, ref, pontosDisponiveis);

    return {
        dataAtual: ref.toISOString(),
        totais: {
            clientes: base.clientes.length,
            compras: base.compras.length,
            resgates: base.resgates.length,
            pontosAcumulados: totais.acumulado,
            pontosResgatados: totais.resgatado,
            pontosExpirados: totais.expirado,
            pontosDisponiveis,
            valorResgates: totalValorResgates,
            valorPotencial: regras.calcularDesconto(pontosDisponiveis),
            totalGasto,
            ticketMedioGlobal: base.compras.length ? totalGasto / base.compras.length : 0,
        },
        niveis: {
            total: clientes.length,
            bronze: porNivel("Bronze"),
            prata: porNivel("Prata"),
            ouro: porNivel("Ouro"),
        },
        status: {
            ATIVO: porStatus("ATIVO"),
            ATENCAO: porStatus("ATENCAO"),
            RISCO: porStatus("RISCO"),
            INATIVO: porStatus("INATIVO"),
        },
        retencao: {
            taxaSegundaCompra: regras.calcularTaxaSegundaCompra(quantidades),
            tempoMedioSegundaCompra: regras.calcularTempoMedioSegundaCompra(datasPorCliente),
            clientesComCompra: quantidades.filter((n) => n >= 1).length,
            clientesComSegunda: quantidades.filter((n) => n >= 2).length,
        },
        evolucaoPontos,
        evolucaoClientes,
        ranking: ranking.slice(0, 5),
        alertas,
    };
}

function mesesComMovimentacao(compras, resgates, quantidade) {
    const chaves = new Set();
    compras.forEach((c) => chaves.add(String(c.data_compra).slice(0, 7)));
    resgates.forEach((r) => chaves.add(String(r.data_resgate).slice(0, 7)));
    const ordenadas = [...chaves].sort();
    const ultimas = ordenadas.slice(-quantidade);
    if (ultimas.length < quantidade && ordenadas.length < quantidade) {
        const inicio = ordenadas[0];
        const base = inicio ? new Date(`${inicio}-01T00:00:00`) : new Date();
        for (let i = 0; i < quantidade; i++) {
            const d = new Date(base.getTime());
            d.setMonth(d.getMonth() + i);
            const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            if (!ultimas.includes(chave)) ultimas.push(chave);
        }
        ultimas.sort();
    }
    return ultimas.slice(-quantidade).map((chave) => ({
        chave,
        label: new Date(`${chave}-01T00:00:00`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    }));
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
};