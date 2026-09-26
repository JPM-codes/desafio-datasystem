const express = require("express");
const router = express.Router();
const regras = require("../services/regras");
const store = require("../services/store");
const impacto = require("../services/impacto");

const DATA_REF = () => new Date();

// Injeta configurações/helpers em todas as views
router.use((req, res, next) => {
    res.locals.regrasCfg = regras.REGRAS;
    res.locals.fmt = {
        data: regras.formatarData,
        moeda: (v) => regras.formatarMoeda(v),
        desconto: (v) => regras.calcularDesconto(v),
        origem: (o) => impacto.rotuloOrigem(o),
        tipoAcao: (t) => impacto.rotuloTipo(t),
    };
    res.locals.impactoCfg = impacto.config();
    res.locals.impactoStatuses = impacto.VALIDACAO_STATUSES;
    res.locals.destinacaoStatuses = impacto.DESTINACAO_STATUSES;
    res.locals.destinosCaixa = impacto.DESTINOS_CAIXA;
    next();
});

// Aceita formulários (criação e transições de estado de impacto)
router.use(express.urlencoded({ extended: true }));

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
            origem_rotulo: m.origem ? impacto.rotuloOrigem(m.origem) : "—",
        }));

    res.render("clientes/perfil", {
        titulo: `Perfil de ${cliente.nome}`,
        rota: "/clientes",
        cliente,
        movimentacoes,
        impactoCliente: store.resumoImpactoDoCliente(base, id),
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
        titulo: "Vendas",
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
        titulo: "Registrar Venda",
        rota: "/compras",
        buscaClientes: store.enriquecerClientes(base, DATA_REF()).map((cliente) => ({
            id: cliente.id,
            nome: cliente.nome,
            documento: cliente.documento || "",
            tipo_documento: cliente.tipo_documento || "CPF",
            pontos: cliente.pontosDisponiveis,
            nivel: cliente.nivel.nome,
        })),
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
            descricao: p.origem ? impacto.rotuloOrigem(p.origem) : "acúmulo",
            pontos: p.pontos,
            cliente: nomes[p.cliente_id] || "Cliente",
            referencia: p.origem === "BONUS_DOACAO" || p.origem === "BONUS_CAIXA"
                ? `Campanha Impacto #${p.origem_id}`
                : `Compra #${p.compras_id}`,
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
        dashImpacto: store.dashboardImpacto(base, DATA_REF()),
        participantesImpacto: store.rankingImpacto(base, DATA_REF()),
    });
});

// ============================================================
// Impacto (campanha de logística reversa + ação social)
// ============================================================
function acoesParaView(base, q) {
    const nomes = baseNomes();
    let lista = [...(base.acoes_impacto || [])];
    const filtro = q || {};

    if (filtro.tipo_acao) lista = lista.filter((a) => a.tipo_acao === filtro.tipo_acao);
    if (filtro.status_validacao) lista = lista.filter((a) => a.status_validacao === filtro.status_validacao);
    if (filtro.status_destinacao) lista = lista.filter((a) => a.status_destinacao === filtro.status_destinacao);
    if (filtro.cliente_id) lista = lista.filter((a) => a.cliente_id === parseInt(filtro.cliente_id));
    if (filtro.ponto_coleta) {
        const termo = String(filtro.ponto_coleta).trim().toLowerCase();
        lista = lista.filter((a) => String(a.ponto_coleta || "").toLowerCase() === termo);
    }

    return lista
        .sort((a, b) => new Date(b.data_recebimento) - new Date(a.data_recebimento))
        .map((a) => {
            const nome = nomes[a.cliente_id] || "Cliente";
            const sv = impacto.statusValidacao(a.status_validacao);
            const sd = impacto.statusDestinacao(a.status_destinacao);
            return {
                id: a.id,
                cliente_id: a.cliente_id,
                cliente_nome: nome,
                iniciais: store.iniciaisDoNome(nome),
                tipo_acao: a.tipo_acao,
                tipo_rotulo: impacto.rotuloTipo(a.tipo_acao),
                icone: impacto.TIPOS[a.tipo_acao]
                    ? impacto.TIPOS[a.tipo_acao].icone
                    : "bi-box",
                quantidade: a.quantidade,
                ponto_coleta: a.ponto_coleta,
                data_recebimento: a.data_recebimento,
                data: regras.formatarData(a.data_recebimento),
                data_destinacao: regras.formatarData(a.data_destinacao),
                pontos_bonus: a.pontos_bonus,
                status_validacao: a.status_validacao,
                stv_rotulo: sv.rotulo,
                stv_classe: sv.classe,
                status_destinacao: a.status_destinacao,
                std_rotulo: sd.rotulo,
                std_classe: sd.classe,
                destino: a.destino,
                destino_rotulo: impacto.rotuloDestino(a.destino),
                observacao: a.observacao,
                responsavel_validacao: a.responsavel_validacao,
            };
        });
}

function pontosDeColeta(base) {
    const existentes = [...new Set((base.acoes_impacto || []).map((a) => a.ponto_coleta))].filter(Boolean);
    const padrao = [
        "Loja Franca - Centro",
        "Loja Franca - Shopping",
        "Loja Ribeirão Preto",
        "Hub Logístico Cajuru",
    ];
    return [...new Set([...existentes, ...padrao])];
}

router.get("/impacto", (req, res) => {
    const base = store.carregar();
    const dash = store.dashboardImpacto(base, DATA_REF());
    res.render("impacto/dashboard", {
        titulo: "Impacto",
        rota: "/impacto",
        dash,
        pontosColeta: pontosDeColeta(base),
    });
});

router.get("/impacto/acoes", (req, res) => {
    const base = store.carregar();
    const lista = acoesParaView(base, req.query);
    res.render("impacto/acoes", {
        titulo: "Acompanhamento de Impacto",
        rota: "/impacto",
        acoes: lista,
        filtrosAtivos: req.query,
        pontosColeta: pontosDeColeta(base),
    });
});

router.get("/impacto/registrar", (req, res) => {
    const base = store.carregar();
    const q = String(req.query.q || "").trim();
    const busca = Boolean(q);

    const hoje = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const regrasFormatoDataHoje =
        hoje.getFullYear() + "-" + pad(hoje.getMonth() + 1) + "-" + pad(hoje.getDate());

    let result = [];
    let clienteSelecionado = null;

    if (busca) {
        const digitos = regras.soDigitos(q);
        const candidatos = store
            .enriquecerClientes(base, DATA_REF())
            .filter((c) => regras.soDigitos(c.documento).includes(digitos))
            .map((c) => ({
                id: c.id,
                nome: c.nome,
                sobrenome: c.sobrenome,
                cpf: c.documento,
                iniciais: store.iniciaisDoNome(c.nome),
                status: c.status,
            }));
        result = candidatos.slice(0, 5);
        if (candidatos.length === 1) clienteSelecionado = candidatos[0];
    }

    if (!clienteSelecionado && req.query.cliente_id) {
        const c = base.clientes.find((x) => x.id === parseInt(req.query.cliente_id));
        if (c) {
            clienteSelecionado = {
                id: c.id,
                nome: c.nome,
                sobrenome: c.sobrenome,
                cpf: c.documento,
            };
        }
    }

    res.render("impacto/registrar", {
        titulo: "Registrar Ação de Impacto",
        rota: "/impacto",
        pontosColeta: pontosDeColeta(base),
        q,
        busca,
        clientes: result,
        clienteSelecionado,
        regrasFormatoDataHoje,
    });
});

// ============================================================
// Transições de estado (web, via formulário simples)
// ============================================================
function findAcaoWeb(base, idParam) {
    const id = parseInt(idParam);
    if (isNaN(id)) return null;
    return base.acoes_impacto.find((a) => a.id === id);
}

function redirErro(res, msg) {
    return res.redirect("/impacto/acoes?erro=" + encodeURIComponent(msg));
}

router.post("/impacto", (req, res) => {
    const base = store.carregar();
    const body = req.body || {};
    const tipo = body.tipo_acao;
    if (!impacto.tipoValido(tipo)) return redirErro(res, "Tipo de ação inválido.");

    const quantidade = Math.max(1, Math.round(Number(body.quantidade) || 1));
    const pontoColeta = String(body.ponto_coleta || "").trim();
    if (!pontoColeta) return redirErro(res, "Informe o ponto de coleta.");

    const idCliente = parseInt(body.idCliente || body.selId || 0);
    const cliente = base.clientes.find((c) => c.id === idCliente);
    if (!cliente) return redirErro(res, "Selecione um cliente na busca por CPF.");

    const { utilizado, limite } = store.limiteMensalDoCliente(base, cliente.id, tipo);
    const novoUso = utilizado + 1;
    if (limite !== null && limite >= 0 && novoUso > limite) {
        return redirErro(
            res,
            `Limite mensal atingido para ${impacto.rotuloTipo(tipo).toLowerCase()} (${limite}/mês, usado ${utilizado}).`
        );
    }

    const agora = store.agoraIso();
    const acao = {
        id: store.proximoId(base.acoes_impacto),
        cliente_id: cliente.id,
        tipo_acao: tipo,
        quantidade,
        data_recebimento: body.data_recebimento ? new Date(body.data_recebimento).toISOString() : agora,
        ponto_coleta: pontoColeta,
        pontos_bonus: impacto.bonusDe(tipo),
        status_validacao: "RECEBIDO",
        status_destinacao: "PENDENTE",
        destino: null,
        data_destinacao: null,
        observacao: body.observacao ? String(body.observacao).trim() : "",
        responsavel_validacao: null,
        created_at: agora,
        updated_at: agora,
    };

    base.acoes_impacto.push(acao);
    store.salvar("acoes_impacto", base.acoes_impacto);
    return res.redirect(
        "/impacto/acoes?ponto_coleta=" + encodeURIComponent(pontoColeta) +
        "&ok=" + encodeURIComponent(`Ação #${acao.id} registrada para ${cliente.nome}.`)
    );
});

router.post("/impacto/acoes/:id/validar", (req, res) => {
    const base = store.carregar();
    const acao = findAcaoWeb(base, req.params.id);
    if (!acao) return redirErro(res, "Ação não encontrada.");
    if (acao.status_validacao === "APROVADO" || acao.status_validacao === "RECUSADO") {
        return redirErro(res, `Ação já encerrada como ${acao.status_validacao}.`);
    }
    acao.status_validacao = "EM_TRIAGEM";
    acao.responsavel_validacao = acao.responsavel_validacao || "Sistema";
    acao.updated_at = store.agoraIso();
    store.salvar("acoes_impacto", base.acoes_impacto);
    return res.redirect("/impacto/acoes?ok=" + encodeURIComponent("Triagem iniciada."));
});

router.post("/impacto/acoes/:id/aprovar", (req, res) => {
    const base = store.carregar();
    const acao = findAcaoWeb(base, req.params.id);
    if (!acao) return redirErro(res, "Ação não encontrada.");

    const jaPontuada = base.pontos.find(
        (m) => m.origem_id === acao.id && (m.origem === "BONUS_DOACAO" || m.origem === "BONUS_CAIXA")
    );
    if (jaPontuada || acao.status_validacao === "APROVADO") {
        return redirErro(res, "Pontos já concedidos para esta ação.");
    }
    if (acao.status_validacao === "RECUSADO") {
        return redirErro(res, "Ação recusada não pode ser aprovada.");
    }

    const agora = store.agoraIso();
    const bonus = Number(acao.pontos_bonus) || impacto.bonusDe(acao.tipo_acao);
    const expiracao = regras.calcularDataExpiracao(agora, regras.REGRAS.validadeMeses);
    const movimento = {
        id: store.proximoId(base.pontos),
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

    acao.status_validacao = "APROVADO";
    acao.responsavel_validacao = acao.responsavel_validacao || "Sistema";
    acao.pontos_bonus = bonus;
    acao.updated_at = agora;

    base.pontos.push(movimento);
    store.salvar("pontos", base.pontos);
    store.salvar("acoes_impacto", base.acoes_impacto);

    return res.redirect(
        "/impacto/acoes?ok=" +
        encodeURIComponent(`${bonus} pontos de bônus concedidos (${impacto.rotuloOrigem(movimento.origem)}).`)
    );
});

router.post("/impacto/acoes/:id/recusar", (req, res) => {
    const base = store.carregar();
    const acao = findAcaoWeb(base, req.params.id);
    if (!acao) return redirErro(res, "Ação não encontrada.");
    if (acao.status_validacao === "APROVADO") {
        return redirErro(res, "Não é possível recusar após a concessão de pontos.");
    }
    if (acao.status_validacao === "RECUSADO") return redirErro(res, "Ação já recusada.");
    acao.status_validacao = "RECUSADO";
    acao.responsavel_validacao = acao.responsavel_validacao || "Sistema";
    acao.updated_at = store.agoraIso();
    store.salvar("acoes_impacto", base.acoes_impacto);
    return res.redirect("/impacto/acoes?ok=" + encodeURIComponent("Ação recusada. Nenhum ponto concedido."));
});

router.post("/impacto/acoes/:id/destinar", (req, res) => {
    const base = store.carregar();
    const acao = findAcaoWeb(base, req.params.id);
    if (!acao) return redirErro(res, "Ação não encontrada.");
    if (acao.status_validacao !== "APROVADO" && acao.status_validacao !== "RECUSADO") {
        return redirErro(res, "Destinação só após aprovação ou recusa do item.");
    }
    const destino = String((req.body && req.body.destino) || "").trim();
    if (!destino) return redirErro(res, "Informe o destino.");
    if (acao.tipo_acao === "DEVOLUCAO_CAIXA" && !impacto.destinoCaixaValido(destino)) {
        return redirErro(res, "Destino inválido para caixa.");
    }
    acao.destino = destino;
    acao.status_destinacao = "DESTINADO";
    acao.data_destinacao = store.agoraIso();
    acao.updated_at = store.agoraIso();
    store.salvar("acoes_impacto", base.acoes_impacto);
    return res.redirect("/impacto/acoes?ok=" + encodeURIComponent("Destino registrado."));
});

router.post("/impacto/acoes/:id/entregar", (req, res) => {
    const base = store.carregar();
    const acao = findAcaoWeb(base, req.params.id);
    if (!acao) return redirErro(res, "Ação não encontrada.");
    acao.status_destinacao = "ENTREGUE";
    acao.data_destinacao = acao.data_destinacao || store.agoraIso();
    acao.updated_at = store.agoraIso();
    store.salvar("acoes_impacto", base.acoes_impacto);
    return res.redirect("/impacto/acoes?ok=" + encodeURIComponent("Ação marcada como entregue."));
});

router.get("/impacto/ranking", (req, res) => {
    const base = store.carregar();
    const ranking = store.rankingImpacto(base, DATA_REF());
    res.render("impacto/ranking", {
        titulo: "Ranking de Impacto",
        rota: "/impacto",
        podio: ranking.slice(0, 3),
        demais: ranking.slice(3),
    });
});

router.get("/impacto/relatorio", (req, res) => {
    const base = store.carregar();
    const rel = store.relatorioImpacto(
        base,
        {
            data_inicio: req.query.data_inicio || null,
            data_fim: req.query.data_fim || null,
            ponto_coleta: req.query.ponto_coleta || null,
        },
        DATA_REF()
    );
    res.render("impacto/relatorio", {
        titulo: "Relatório da Campanha Impacto",
        rota: "/impacto",
        rel,
        filtrosAtivos: req.query,
        pontosColeta: pontosDeColeta(base),
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