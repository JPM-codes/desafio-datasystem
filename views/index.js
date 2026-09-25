const express = require("express");
const router = express.Router();
const regras = require("../services/regras");
const store = require("../services/store");

const DATA_REF = () => new Date();

// Injeta configurações/helpers em todas as views
router.use((req, res, next) => {
    res.locals.regrasCfg = regras.REGRAS;
    res.locals.fmt = {
        data: regras.formatarData,
        moeda: (v) => regras.formatarMoeda(v),
        desconto: (v) => regras.calcularDesconto(v),
    };
    next();
});

const baseNomes = () => {
    const b = store.carregar();
    const mapa = {};
    b.clientes.forEach((c) => (mapa[c.id] = c.nome));
    return mapa;
};

// ============================================================
// Dashboard
// ============================================================
router.get("/", (req, res) => {
    const base = store.carregar();
    const dash = store.dashboard(base, DATA_REF());

    res.render("dashboard", {
        titulo: "Painel de Controle",
        rota: "/",
        dash,
    });
});

// ============================================================
// Clientes
// ============================================================
function filtrarClientes(lista, q) {
    let result = lista;

    const status = q.status;
    if (status) result = result.filter((c) => c.status.nome === String(status).toUpperCase());

    const nivel = q.nivel;
    if (nivel) result = result.filter((c) => c.nivel.nome === nivel);

    const numeracao = q.numeracao;
    if (numeracao) result = result.filter((c) => Number(c.numero_calcado) === Number(numeracao));

    const categoria = q.categoria;
    if (categoria) result = result.filter((c) => (c.preferencias.categorias || []).includes(categoria));

    const estilo = q.estilo;
    if (estilo) result = result.filter((c) => (c.preferencias.estilos || []).includes(estilo));

    const faixa = q.faixa_preco;
    if (faixa) result = result.filter((c) => c.preferencias.faixa_preco === faixa);

    const minCompras = Number(q.min_compras);
    if (minCompras) result = result.filter((c) => c.totalCompras >= minCompras);

    const maxCompras = Number(q.max_compras);
    if (maxCompras) result = result.filter((c) => c.totalCompras <= maxCompras);

    const minGasto = Number(q.min_gasto);
    if (minGasto) result = result.filter((c) => c.totalGasto >= minGasto);

    const minPontos = Number(q.min_pontos);
    if (minPontos) result = result.filter((c) => c.pontosDisponiveis >= minPontos);

    const minDias = Number(q.min_dias);
    if (minDias) result = result.filter((c) => (c.diasSemComprar ?? Number.MAX_SAFE_INTEGER) >= minDias);

    return result;
}

function opcoesDeFiltro(clientes) {
    const unicos = (arr) => [...new Set(arr)].filter(Boolean).sort();
    return {
        niveis: regras.REGRAS.niveis.map((n) => n.nome),
        statuses: regras.REGRAS.status.map((s) => s.nome),
        numeracoes: unicos(clientes.map((c) => c.numero_calcado)),
        categorias: unicos(clientes.flatMap((c) => c.preferencias.categorias || [])),
        estilos: unicos(clientes.flatMap((c) => c.preferencias.estilos || [])),
    };
}

router.get("/clientes", (req, res) => {
    const base = store.carregar();
    const todos = store.enriquecerClientes(base, DATA_REF());
    const clientes = filtrarClientes(todos, req.query);

    res.render("clientes/index", {
        titulo: "Clientes",
        rota: "/clientes",
        clientes,
        totalClientes: todos.length,
        opcoes: opcoesDeFiltro(todos),
        filtrosAtivos: req.query,
        niveisConfig: regras.REGRAS.niveis,
        statusConfig: regras.REGRAS.status,
    });
});

router.get("/clientes/add", (req, res) => {
    const base = store.carregar();
    const todos = store.enriquecerClientes(base, DATA_REF());
    res.render("clientes/adicionar_cliente", {
        titulo: "Adicionar Cliente",
        rota: "/clientes",
        opcoes: opcoesDeFiltro(todos),
    });
});

router.get("/clientes/edit/:id", (req, res) => {
    const id = Number(req.params.id);
    const base = store.carregar();
    const cliente = store.enriquecerCliente(base.clientes.find((c) => c.id === id), base, DATA_REF());

    if (!cliente.id) {
        return res.redirect("/clientes");
    }

    const todos = store.enriquecerClientes(base, DATA_REF());
    res.render("clientes/editar_cliente", {
        titulo: "Editar Cliente",
        rota: "/clientes",
        cliente,
        opcoes: opcoesDeFiltro(todos),
    });
});

router.get("/clientes/:id", (req, res) => {
    const id = Number(req.params.id);
    const base = store.carregar();
    const cliente = store.enriquecerCliente(base.clientes.find((c) => c.id === id), base, DATA_REF());

    if (!cliente.id) {
        return res.redirect("/clientes");
    }

    const movimentacoes = store
        .movimentacoesDoCliente(base.pontos, id)
        .sort((a, b) => new Date(b.data_movimentacao) - new Date(a.data_movimentacao))
        .map((m) => ({
            ...m,
            data: regras.formatarData(m.data_movimentacao),
            expiracao: regras.formatarData(m.data_expiracao),
            pontos: m.tipo === "acumulo" ? m.pontos : -Math.abs(m.pontos),
        }));

    res.render("clientes/perfil", {
        titulo: `Perfil de ${cliente.nome}`,
        rota: "/clientes",
        cliente,
        movimentacoes,
        opcoes: opcoesDeFiltro(store.enriquecerClientes(base, DATA_REF())),
    });
});

// ============================================================
// Compras
// ============================================================
router.get("/compras", (req, res) => {
    const base = store.carregar();
    const nomes = baseNomes();
    const lista = [...base.compras]
        .sort((a, b) => new Date(b.data_compra) - new Date(a.data_compra))
        .map((c) => {
            const nome = nomes[c.cliente_id] || "Cliente";
            return {
                id: c.id,
                cliente: nome,
                clienteIniciais: store.iniciaisDoNome(nome),
                produto: c.produto,
                quantidade: c.quantidade,
                valor_total: c.valor_total,
                pontos_total: c.pontos_total,
                data: regras.formatarData(c.data_compra),
                dataIso: String(c.data_compra).slice(0, 10),
            };
        });

    const valorTotal = base.compras.reduce((soma, c) => soma + c.valor_total, 0);
    const pontosGerados = base.compras.reduce((soma, c) => soma + c.pontos_total, 0);

    res.render("compras/index", {
        titulo: "Compras",
        rota: "/compras",
        compras: lista,
        clientes: store.enriquecerClientes(base, DATA_REF()),
        resumo: {
            total: base.compras.length,
            valorTotal,
            pontosGerados,
            ticketMedio: base.compras.length ? valorTotal / base.compras.length : 0,
        },
    });
});

router.get("/compras/add", (req, res) => {
    const base = store.carregar();
    res.render("compras/registrar_compras", {
        titulo: "Registrar Compra",
        rota: "/compras",
        clientes: store.enriquecerClientes(base, DATA_REF()),
    });
});

// ============================================================
// Resgates
// ============================================================
router.get("/resgates", (req, res) => {
    const base = store.carregar();
    const nomes = baseNomes();
    const lista = [...base.resgates]
        .sort((a, b) => new Date(b.data_resgate) - new Date(a.data_resgate))
        .map((r) => {
            const nome = nomes[r.cliente_id] || "Cliente";
            return {
                id: r.id,
                cliente: nome,
                clienteIniciais: store.iniciaisDoNome(nome),
                pontos: r.pontos_utilizados,
                desconto: r.valor_desconto,
                data: regras.formatarData(r.data_resgate),
                dataIso: String(r.data_resgate).slice(0, 10),
            };
        });

    const pontosResgatados = base.resgates.reduce((soma, r) => soma + r.pontos_utilizados, 0);
    const valorDesconto = base.resgates.reduce((soma, r) => soma + r.valor_desconto, 0);

    res.render("resgate/index", {
        titulo: "Resgates",
        rota: "/resgates",
        resgates: lista,
        clientes: store.enriquecerClientes(base, DATA_REF()),
        resumo: {
            total: base.resgates.length,
            pontosResgatados,
            valorDesconto,
            mediaPontos: base.resgates.length ? Math.round(pontosResgatados / base.resgates.length) : 0,
        },
    });
});

router.get("/resgates/add", (req, res) => {
    const base = store.carregar();
    res.render("resgate/registrar_resgate", {
        titulo: "Registrar Resgate",
        rota: "/resgates",
        clientes: store.enriquecerClientes(base, DATA_REF()),
    });
});

router.get("/resgates/remove", (req, res) => {
    res.redirect("/resgates");
});

// ============================================================
// Ranking
// ============================================================
router.get("/ranking", (req, res) => {
    const base = store.carregar();
    const ranking = store
        .enriquecerClientes(base, DATA_REF())
        .sort((a, b) => b.pontosDisponiveis - a.pontosDisponiveis);

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
    const base = store.carregar();
    const nomes = baseNomes();

    const acumulos = base.pontos
        .filter((p) => p.tipo === "acumulo")
        .map((p) => ({
            data: p.data_movimentacao,
            tipo: "acumulo",
            descricao: "acúmulo",
            pontos: p.pontos,
            cliente: nomes[p.cliente_id] || "Cliente",
            referencia: `Compra #${p.compras_id}`,
            expiracao: p.data_expiracao,
        }));

    const resgatesMov = base.pontos
        .filter((p) => p.tipo === "resgate")
        .map((p) => ({
            data: p.data_movimentacao,
            tipo: "resgate",
            descricao: "resgate",
            pontos: -Math.abs(p.pontos),
            cliente: nomes[p.cliente_id] || "Cliente",
            referencia: `Resgate #${p.resgates_id}`,
            expiracao: null,
        }));

    const movimentacoes = [...acumulos, ...resgatesMov]
        .sort((a, b) => new Date(b.data) - new Date(a.data))
        .slice(0, 100)
        .map((m) => ({
            ...m,
            data: regras.formatarData(m.data),
            expiracao: regras.formatarData(m.expiracao),
        }));

    const totais = store.totaisPontos(base.pontos);

    res.render("history/historico_movimentacoes", {
        titulo: "Histórico de Movimentações",
        rota: "/historico",
        movimentacoes,
        totalPontos: totais.acumulado,
        totalResgates: base.resgates.length,
        totalCompras: base.compras.length,
    });
});

// ============================================================
// Inteligência (RFM + clientes em risco + alertas)
// ============================================================
router.get("/inteligencia", (req, res) => {
    const base = store.carregar();
    const dash = store.dashboard(base, DATA_REF());
    const clientes = store.enriquecerClientes(base, DATA_REF());
    const emRisco = clientes
        .filter((c) => c.status.nome === "RISCO" || c.status.nome === "INATIVO")
        .sort((a, b) => b.pontosDisponiveis - a.pontosDisponiveis);
    const porRfm = [...clientes].sort((a, b) => b.rfm.monetario - a.rfm.monetario);

    res.render("inteligencia", {
        titulo: "Inteligência",
        rota: "/inteligencia",
        clientes: [...clientes].sort((a, b) => b.pontosDisponiveis - a.pontosDisponiveis),
        emRisco,
        porRfm,
        dash,
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