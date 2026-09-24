const express = require("express");
const router = express.Router();

const clientes = require("../public/database/cliente.json");
const compras = require("../public/database/compras.json");
const pontos = require("../public/database/pontos.json");
const resgates = require("../public/database/resgate.json");



const NIVEL_BRONZE = 0;
const NIVEL_PRATA = 1000;
const NIVEL_OURO = 5000;

function nivelDePontos(totalPontos) {
    if (totalPontos >= NIVEL_OURO) {
        return { nome: "Ouro", classe: "gold" };
    }
    if (totalPontos >= NIVEL_PRATA) {
        return { nome: "Prata", classe: "silver" };
    }
    return { nome: "Bronze", classe: "bronze" };
}

function iniciaisDoNome(nome) {
    return nome
        .split(" ")
        .filter((p) => p.length > 0)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join("");
}

function pontosAcumuladosPorCliente() {
    const mapa = {};
    pontos.forEach((mov) => {
        if (mov.tipo === "acumulo") {
            mapa[mov.cliente_id] = (mapa[mov.cliente_id] || 0) + mov.pontos;
        }
    });
    return mapa;
}

const pontosPorCliente = pontosAcumuladosPorCliente();

function listaClientesComSaldo() {
    return clientes.map((cliente) => {
        const total = pontosPorCliente[cliente.id] || 0;
        return {
            ...cliente,
            pontos: total,
            nivel: nivelDePontos(total),
            iniciais: iniciaisDoNome(cliente.nome),
        };
    });
}

function formatarData(iso) {
    if (!iso) return "—";
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return "—";
    return data.toLocaleDateString("pt-BR");
}

// ============================================================
// Rota principal do Dashboard
// ============================================================
router.get("/", (req, res) => {
    const clientesComSaldo = listaClientesComSaldo();

    const totalPontosAcumulados = pontos
        .filter((p) => p.tipo === "acumulo")
        .reduce((soma, p) => soma + p.pontos, 0);
    const totalPontosResgatados = resgates.reduce(
        (soma, r) => soma + r.pontos_utilizados,
        0
    );
    const totalValorResgates = resgates.reduce(
        (soma, r) => soma + r.valor_desconto,
        0
    );
    const pontosDisponiveis = totalPontosAcumulados - totalPontosResgatados;
    const valorPotencial = pontosDisponiveis * 0.05;

    const topos = [...clientesComSaldo]
        .sort((a, b) => b.pontos - a.pontos);

    const distribuicao = {
        bronze: clientesComSaldo.filter((c) => c.nivel.nome === "Bronze").length,
        prata: clientesComSaldo.filter((c) => c.nivel.nome === "Prata").length,
        ouro: clientesComSaldo.filter((c) => c.nivel.nome === "Ouro").length,
        total: clientesComSaldo.length,
    };

    const mesLabel = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    };

    const evolucaoMensal = [];
    const ultimosMeses = [
        ["2026-04", "Abr"],
        ["2026-05", "Mai"],
        ["2026-06", "Jun"],
        ["2026-07", "Jul"],
        ["2026-08", "Ago"],
        ["2026-09", "Set"],
    ];
    ultimosMeses.forEach(([chave, label]) => {
        const soma = pontos
            .filter((p) => p.tipo === "acumulo" && p.data_movimentacao.startsWith(chave))
            .reduce((acc, p) => acc + p.pontos, 0);
        evolucaoMensal.push({ label, pontos: soma });
    });

    res.render("dashboard", {
        titulo: "Painel de Controle",
        rota: "/",
        kpis: {
            clientes: clientesComSaldo.length,
            pontosAcumulados: totalPontosAcumulados,
            pontosResgatados: totalPontosResgatados,
            valorResgates: totalValorResgates,
        },
        distribuicao,
        topos: topos.slice(0, 3),
        valorPotencial,
        pontosDisponiveis,
        evolucaoMensal,
    });
});

// ============================================================
// Clientes
// ============================================================
router.get("/clientes", (req, res) => {
    res.render("clientes/index", {
        titulo: "Clientes",
        rota: "/clientes",
        clientes: listaClientesComSaldo(),
    });
});

router.get("/clientes/add", (req, res) => {
    res.render("clientes/adicionar_cliente", {
        titulo: "Adicionar Cliente",
        rota: "/clientes",
    });
});

router.get("/clientes/edit/:id", (req, res) => {
    const id = Number(req.params.id);
    const clienteBase = clientes.find((c) => c.id === id);

    if (!clienteBase) {
        return res.redirect("/clientes");
    }

    const total = pontosPorCliente[id] || 0;
    const cliente = {
        ...clienteBase,
        pontos: total,
        nivel: nivelDePontos(total),
        iniciais: iniciaisDoNome(clienteBase.nome),
    };

    res.render("clientes/editar_cliente", {
        titulo: "Editar Cliente",
        rota: "/clientes",
        cliente,
    });
});

// ============================================================
// Compras
// ============================================================
router.get("/compras", (req, res) => {
    res.render("compras/registrar_compras", {
        titulo: "Registrar Compra",
        rota: "/compras",
        clientes: listaClientesComSaldo(),
    });
});

// ============================================================
// Resgates
// ============================================================
router.get("/resgates", (req, res) => {
    res.render("resgate/registrar_resgate", {
        titulo: "Registrar Resgate",
        rota: "/resgates",
        clientes: listaClientesComSaldo(),
    });
});

// ============================================================
// Ranking
// ============================================================
router.get("/ranking", (req, res) => {
    const ranking = [...listaClientesComSaldo()].sort((a, b) => b.pontos - a.pontos);

    res.render("ranking/ranking", {
        titulo: "Ranking de Clientes",
        rota: "/ranking",
        podio: ranking.slice(0, 3),
        demais: ranking.slice(3),
    });
});

// ============================================================
// Histórico de movimentações
// ============================================================
router.get("/historico", (req, res) => {
    const nomeCliente = (id) => {
        const c = clientes.find((x) => x.id === id);
        return c ? c.nome : "Cliente";
    };

    const acumulos = pontos
        .filter((p) => p.tipo === "acumulo")
        .map((p) => ({
            data: p.data_movimentacao,
            tipo: "acumulo",
            descricao: "acúmulo",
            pontos: p.pontos,
            cliente: nomeCliente(p.cliente_id),
            referencia: `Compra #${p.compras_id}`,
            expiracao: p.data_expiracao,
        }));

    const resgatesMov = resgates.map((r) => ({
        data: r.data_resgate,
        tipo: "resgate",
        descricao: "resgate",
        pontos: -r.pontos_utilizados,
        cliente: nomeCliente(r.cliente_id),
        referencia: `Resgate #${r.id}`,
        expiracao: null,
    }));

    const movimentacoes = [...acumulos, ...resgatesMov]
        .sort((a, b) => new Date(b.data) - new Date(a.data))
        .map((m) => ({ ...m, data: formatarData(m.data), expiracao: formatarData(m.expiracao) }));

    res.render("history/historico_movimentacoes", {
        titulo: "Histórico de Movimentações",
        rota: "/historico",
        movimentacoes: movimentacoes.slice(0, 25),
        totalPontos: pontos.reduce((soma, p) => soma + p.pontos, 0),
        totalResgates: resgates.length,
        totalCompras: compras.length,
    });
});

// ============================================================
// Documentação da API
// ============================================================
router.get("/api", (req, res) => {
    res.render("api/documentacao_api", {
        titulo: "Documentação da API",
        rota: "/api",
    });
});

module.exports = router;