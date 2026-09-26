'use strict';

/**
 * FONTE ÚNICA DE VERDADE DOS INDICADORES DO PROGRAMA.
 *
 * Todas as telas (Dashboard, Clientes, Compras, Resgates, Ranking, Inteligência,
 * Impacto) e todos os endpoints /api/dashboard devem consumir os valores
 * calculados aqui. Nenhum número deve ser fixado no código ou na view.
 *
 * Regras contábeis aplicadas (ver services/regras.js):
 *   PONTOS DISPONÍVEIS = PONTOS GERADOS + AJUSTES - PONTOS RESGATADOS - PONTOS EXPIRADOS
 * onde PONTOS GERADOS = pontos de compra (base + bônus de nível) + bônus de impacto.
 */

const regras = require("./regras");
const impacto = require("./impacto");

const TIPOS_ACUMULO = "acumulo";

// ============================================================
// Helpers de leitura da base
// ============================================================
function movimentosDe(base) {
    return Array.isArray(base.pontos) ? base.pontos : [];
}

function comprasDe(base) {
    return Array.isArray(base.compras) ? base.compras : [];
}

function resgatesDe(base) {
    return Array.isArray(base.resgates) ? base.resgates : [];
}

function clientesDe(base) {
    return Array.isArray(base.clientes) ? base.clientes : [];
}

function acoesDe(base) {
    return Array.isArray(base.acoes_impacto) ? base.acoes_impacto : [];
}

function soma(lista,Fn) {
    return lista.reduce((acc, item) => acc + (Number(Fn(item)) || 0), 0);
}

// ============================================================
// Pontos
// ============================================================
/**
 * Uma movimentação de acúmulo está vencida quando passou da data_expiracao
 * (data de geração + validadeMeses). O saldo disponível nunca considera
 * pontos vencidos, mesmo antes de a rotina de expiração gravar o histórico.
 */
function acumuloVencido(movimento, dataRef) {
    if (!movimento || movimento.tipo !== TIPOS_ACUMULO) return false;
    const exp = regras.dataDe(movimento.data_expiracao);
    if (!exp) return false;
    return exp.getTime() <= dataRef.getTime();
}

function totaisDeMovimentos(movimentos, dataRef) {
    const ref = dataRef || new Date();
    const totais = {
        gerados: 0,
        geradosCompras: 0,
        bonusCompras: 0,
        geradosImpacto: 0,
        resgatados: 0,
        expirados: 0,
        ajustes: 0,
        vencidosNaoProcessados: 0,
    };

    movimentos.forEach((m) => {
        const valor = Number(m.pontos) || 0;
        const vencido = acumuloVencido(m, ref);
        switch (m.tipo) {
            case TIPOS_ACUMULO:
                totais.gerados += valor;
                if (m.origem === "BONUS_DOACAO" || m.origem === "BONUS_CAIXA") {
                    totais.geradosImpacto += valor;
                } else {
                    totais.geradosCompras += valor;
                }
                if (vencido) totais.vencidosNaoProcessados += valor;
                break;
            case "resgate":
                totais.resgatados += Math.abs(valor);
                break;
            case "expiracao":
                totais.expirados += Math.abs(valor);
                break;
            case "ajuste":
                totais.ajustes += valor;
                break;
            default:
                break;
        }
    });

    // Pontos vencidos que ainda não foram registrados como EXPIRAÇÃO no histórico
    // já não podem compor o saldo disponível.
    totais.expiradosEfetivos = totais.expirados + totais.vencidosNaoProcessados;
    totais.acumulados = totais.gerados;
    totais.disponiveis = Math.max(
        0,
        totais.gerados + totais.ajustes - totais.resgatados - totais.expiradosEfetivos
    );
    return totais;
}

function saldoDisponivelDeMovimentos(movimentos, dataRef) {
    const ref = dataRef || new Date();
    let saldo = 0;
    movimentos.forEach((m) => {
        if (m.tipo === TIPOS_ACUMULO) {
            if (!acumuloVencido(m, ref)) saldo += Number(m.pontos) || 0;
        } else if (m.tipo === "resgate" || m.tipo === "expiracao") {
            saldo -= Math.abs(Number(m.pontos) || 0);
        } else if (m.tipo === "ajuste") {
            saldo += Number(m.pontos) || 0;
        }
    });
    return Math.max(0, saldo);
}

// ============================================================
// Evolução mensal (agrupamento real pelas movimentações)
// ============================================================
/** Chave YYYY-MM em horário local, evitando deslocamento de fuso do ISO string. */
function chaveMes(valor) {
    const d = regras.dataDe(valor);
    if (!d) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function rotuloMes(chave) {
    const [ano, mes] = chave.split("-");
    const d = new Date(Number(ano), Number(mes) - 1, 1);
    return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

function proximaChave(chave, passo) {
    const [ano, mes] = chave.split("-").map(Number);
    const d = new Date(ano, mes - 1 + (passo || 1), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Últimos N meses que possuem movimentação de pontos de qualquer tipo
 * (acúmulo, resgate ou expiração). Se houver menos de N meses com dados,
 * completa com os meses anteriores para o gráfico nunca "sumir" séries.
 */
function mesesComMovimentacaoPontos(movimentos, quantidade) {
    const chaves = new Set();
    movimentos.forEach((m) => {
        const c = chaveMes(m.data_movimentacao);
        if (c) chaves.add(c);
    });

    const ordenadas = [...chaves].sort();
    if (!ordenadas.length) return [];

    let ultimas = ordenadas.slice(-quantidade);
    while (ultimas.length < quantidade) {
        const primeira = ultimas[0];
        const anterior = proximaChave(primeira, -1);
        if (ordenadas.includes(anterior)) {
            ultimas = [anterior, ...ultimas];
        } else {
            const maisAntiga = ordenadas[0];
            const anterior = proximaChave(maisAntiga, -1);
            ultimas = [anterior, ...ultimas];
            ordenadas.push(anterior);
        }
    }
    return ultimas.slice(-quantidade).map((chave) => ({ chave, label: rotuloMes(chave) }));
}

function evolucaoMensal(base, dataRef, meses) {
    const movimentos = movimentosDe(base);
    const janela = mesesComMovimentacaoPontos(movimentos, meses || 6);

    return janela.map((mes) => {
        const doMes = movimentos.filter((m) => chaveMes(m.data_movimentacao) === mes.chave);
        const gerados = soma(
            doMes.filter((m) => m.tipo === TIPOS_ACUMULO && m.origem !== "BONUS_DOACAO" && m.origem !== "BONUS_CAIXA"),
            (m) => m.pontos
        );
        const impactoMes = soma(
            doMes.filter((m) => m.tipo === TIPOS_ACUMULO && (m.origem === "BONUS_DOACAO" || m.origem === "BONUS_CAIXA")),
            (m) => m.pontos
        );
        const resgatados = soma(
            doMes.filter((m) => m.tipo === "resgate"),
            (m) => Math.abs(m.pontos)
        );
        const expirados = soma(
            doMes.filter((m) => m.tipo === "expiracao"),
            (m) => Math.abs(m.pontos)
        );
        return {
            label: mes.label,
            chave: mes.chave,
            gerados,
            impacto: impactoMes,
            totalGerados: gerados + impactoMes,
            resgatados,
            expirados,
        };
    });
}

function evolucaoMensalClientes(base, meses) {
    const compras = comprasDe(base);
    const chaves = new Set();
    compras.forEach((c) => {
        const k = chaveMes(c.data_compra);
        if (k) chaves.add(k);
    });
    const ordenadas = [...chaves].sort();
    if (!ordenadas.length) return [];

    let ultimas = ordenadas.slice(-meses);
    while (ultimas.length < meses) {
        const anterior = proximaChave(ultimas[0], -1);
        ultimas = [anterior, ...ultimas];
        ordenadas.push(anterior);
    }
    return ultimas.slice(-meses).map((chave) => {
        const doMes = compras.filter((c) => chaveMes(c.data_compra) === chave);
        return {
            label: rotuloMes(chave),
            chave,
            compras: doMes.length,
            ativos: new Set(doMes.map((c) => c.cliente_id)).size,
        };
    });
}

// ============================================================
// Indicadores completos
// ============================================================
function calcular(base, dataRef) {
    const ref = dataRef || new Date();
    const clientes = clientesDe(base);
    const compras = comprasDe(base);
    const resgates = resgatesDe(base);
    const movimentos = movimentosDe(base);
    const acoes = acoesDe(base);

    const totais = totaisDeMovimentos(movimentos, ref);

    const enriched = clientes.map((c) => {
        const movs = movimentos.filter((m) => m.cliente_id === c.id);
        const t = totaisDeMovimentos(movs, ref);
        return { cliente: c, movimentos: movs, totais: t };
    });

    const saldoPorCliente = enriched.reduce((s, e) => s + e.totais.disponiveis, 0);

    const porNivel = (nome) => enriched.filter((e) => regras.calcularNivel(e.totais.acumulados).nome === nome).length;

    const datasPorCliente = compras.reduce((mapa, c) => {
        (mapa[c.cliente_id] = mapa[c.cliente_id] || []).push(c.data_compra);
        return mapa;
    }, {});
    const quantidades = clientes.map((c) => (datasPorCliente[c.id] || []).length);
    const listasOrdenadas = clientes.map((c) =>
        [...(datasPorCliente[c.id] || [])].sort((a, b) => new Date(a) - new Date(b))
    );

    const valorDescontos = soma(resgates, (r) => r.valor_desconto);
    const pontosResgatadosRegistros = soma(resgates, (r) => r.pontos_utilizados);
    const faturamento = soma(compras, (c) => c.valor_total);

    const acoesAprovadas = acoes.filter((a) => a.status_validacao === "APROVADO");
    const acoesDestinadas = acoes.filter(
        (a) => a.status_destinacao === "DESTINADO" || a.status_destinacao === "ENTREGUE"
    );
    const acoesAguardando = acoes.filter(
        (a) => a.status_validacao === "APROVADO" && a.status_destinacao === "PENDENTE"
    );
    const qtd = (lista) => soma(lista, (a) => a.quantidade);

    const statusContagem = (nome) => clientes.filter((c) => {
        const lista = (datasPorCliente[c.id] || []).slice().sort((a, b) => new Date(a) - new Date(b));
        return regras.calcularStatusCliente(regras.calcularDiasSemComprar(lista[lista.length - 1] || null, ref)).nome === nome;
    }).length;

    return {
        dataReferencia: ref.toISOString(),

        base: {
            clientes: clientes.length,
            compras: compras.length,
            resgates: resgates.length,
            acoesImpacto: acoes.length,
            movimentacoes: movimentos.length,
        },

        compras: {
            total: compras.length,
            faturamento,
            ticketMedio: compras.length ? faturamento / compras.length : 0,
            ticketMedioPorCliente: clientes.filter((c) => (datasPorCliente[c.id] || []).length > 0).length
                ? faturamento / clientes.filter((c) => (datasPorCliente[c.id] || []).length > 0).length
                : 0,
        },

        pontos: {
            geradosCompras: totais.geradosCompras,
            bonusCompras: compras.reduce((s, c) => s + (Number(c.cliente_pontos_bonus) || 0), 0),
            geradosImpacto: totais.geradosImpacto,
            acumulados: totais.acumulados,
            resgatados: totais.resgatados,
            expirados: totais.expiradosEfetivos,
            expiradosLancados: totais.expirados,
            vencidosNaoProcessados: totais.vencidosNaoProcessados,
            ajustes: totais.ajustes,
            disponiveis: totais.disponiveis,
            saldoPorCliente,
        },

        resgates: {
            total: resgates.length,
            pontosUtilizados: pontosResgatadosRegistros,
            valorDescontos,
            ticketMedio: resgates.length ? valorDescontos / resgates.length : 0,
            custoPrograma: valorDescontos,
        },

        niveis: {
            total: clientes.length,
            bronze: porNivel("Bronze"),
            prata: porNivel("Prata"),
            ouro: porNivel("Ouro"),
            base: "PONTOS_ACUMULADOS",
        },

        status: {
            ATIVO: statusContagem("ATIVO"),
            ATENCAO: statusContagem("ATENCAO"),
            RISCO: statusContagem("RISCO"),
            INATIVO: statusContagem("INATIVO"),
            base: "DIAS_SEM_COMPRA",
        },

        retencao: {
            clientesComCompra: quantidades.filter((n) => n >= 1).length,
            clientesComSegunda: quantidades.filter((n) => n >= 2).length,
            taxaSegundaCompra: regras.calcularTaxaSegundaCompra(quantidades),
            tempoMedioSegundaCompra: regras.calcularTempoMedioSegundaCompra(listasOrdenadas),
            clientesUmaCompra: quantidades.filter((n) => n === 1).length,
        },

        evolucao: {
            pontos: evolucaoMensal(base, ref, 6),
            clientes: evolucaoMensalClientes(base, 6),
        },

        impacto: {
            acoes: acoes.length,
            acoesAprovadas: acoesAprovadas.length,
            itensArrecadados: qtd(acoes),
            itensDestinados: qtd(acoesDestinadas),
            acoesDestinadas: acoesDestinadas.length,
            aguardandoDestinacao: qtd(acoesAguardando),
            acoesAguardandoDestinacao: acoesAguardando.length,
            calcados: qtd(acoes.filter((a) => a.tipo_acao === "DOACAO_CALCADO")),
            caixas: qtd(acoes.filter((a) => a.tipo_acao === "DEVOLUCAO_CAIXA")),
            participantes: new Set(acoes.map((a) => a.cliente_id)).size,
            pontosConcedidos: totais.geradosImpacto,
        },

        regras: {
            reaisPorPonto: regras.REGRAS.pontos.reaisPorPonto,
            validadeMeses: regras.REGRAS.validadeMeses,
            conversao: { ...regras.REGRAS.conversao },
            bonusNiveis: regras.REGRAS.niveis.map((n) => ({
                nome: n.nome,
                minimo: n.minimo,
                bonus: n.bonus,
            })),
            bonusImpacto: impacto.config(),
        },

        reconciliacao: reconciliar(totais, saldoPorCliente, compras, resgates),
    };
}

/**
 * Conferência contábil: o saldo disponível calculado deve ser igual à
 * soma dos saldos individuais dos clientes e nunca negativo.
 */
function reconciliar(totais, saldoPorCliente, compras, resgates) {
    const esperado = totais.gerados + totais.ajustes - totais.resgatados - totais.expiradosEfetivos;
    const disponivel = totais.disponiveis;
    const somaClientes = saldoPorCliente;
    const diferenca = disponivel - somaClientes;
    const pontosResgatadosRegistros = soma(resgates, (r) => r.pontos_utilizados);
    const bonusBaseCompras = soma(compras, (c) => c.pontos_base);

    return {
        formula: "disponiveis = gerados + ajustes - resgatados - expirados",
        pontosGerados: totais.gerados,
        pontosBaseCompras: bonusBaseCompras,
        bonusValidos: totais.geradosCompras - bonusBaseCompras,
        pontosResgatados: totais.resgatados,
        pontosExpirados: totais.expiradosEfetivos,
        ajustes: totais.ajustes,
        esperado,
        disponivel,
        saldoPorCliente: somaClientes,
        diferenca,
        saldoNegativo: disponivel < 0 || somaClientes < 0,
        resgatesConsistentes: pontosResgatadosRegistros === totais.resgatados,
        pontosResgatadosRegistros,
        coerente:
            diferenca === 0 &&
            disponivel >= 0 &&
            somaClientes >= 0 &&
            pontosResgatadosRegistros === totais.resgatados,
    };
}

// ============================================================
// Auditoria de consistência (Prioridade 19)
// ============================================================
function auditar(base, dataRef) {
    const ref = dataRef || new Date();
    const problemas = [];
    const adicionar = (codigo, mensagem, contexto) =>
        problemas.push({ codigo, mensagem, contexto: contexto || null });

    const clientes = clientesDe(base);
    const compras = comprasDe(base);
    const resgates = resgatesDe(base);
    const movimentos = movimentosDe(base);
    const acoes = acoesDe(base);

    // 1. Cliente duplicado por documento
    const porDocumento = new Map();
    clientes.forEach((c) => {
        const doc = regras.soDigitos(c.documento);
        if (!doc) {
            adicionar("CLIENTE_SEM_DOCUMENTO", `Cliente ${c.id} (${c.nome}) não possui documento.`, c.id);
            return;
        }
        const chave = `${c.tipo_documento || "CPF"}:${doc}`;
        if (porDocumento.has(chave)) {
            adicionar(
                "CLIENTE_DUPLICADO",
                `Documento ${c.documento} cadastrado para ${c.nome} e ${porDocumento.get(chave).nome}.`,
                c.id
            );
        } else {
            porDocumento.set(chave, c);
        }
        if ((c.tipo_documento || "CPF") === "CPF" && !regras.validarCPF(c.documento)) {
            adicionar("CPF_INVALIDO", `CPF inválido no cliente ${c.id} (${c.nome}).`, c.id);
        }
    });

    const idsClientes = new Set(clientes.map((c) => c.id));
    const idsCompras = new Set(compras.map((c) => c.id));
    const idsResgates = new Set(resgates.map((r) => r.id));
    const idsAcoes = new Set(acoes.map((a) => a.id));

    // 2. Compra sem cliente
    compras.forEach((c) => {
        if (!idsClientes.has(c.cliente_id)) {
            adicionar("COMPRA_SEM_CLIENTE", `Compra ${c.id} referencia cliente inexistente (${c.cliente_id}).`, c.id);
        }
        if (idsCompras.size !== compras.length) {
            /* tratado abaixo */
        }
        const soma = (Number(c.pontos_base) || 0) + (Number(c.cliente_pontos_bonus) || 0);
        if (soma !== (Number(c.pontos_total) || 0)) {
            adicionar(
                "PONTOS_COMPRA_INCOERENTE",
                `Compra ${c.id}: pontos_total (${c.pontos_total}) ≠ base + bônus (${soma}).`,
                c.id
            );
        }
        const mov = movimentos.find((m) => m.compras_id === c.id && m.origem === "COMPRA");
        if (!mov) {
            adicionar("COMPRA_SEM_MOVIMENTACAO", `Compra ${c.id} não possui movimentação de pontos vinculada.`, c.id);
        } else if ((Number(mov.pontos) || 0) !== (Number(c.pontos_total) || 0)) {
            adicionar(
                "PONTOS_COMPRA_DIVERGENTE",
                `Compra ${c.id} gerou ${mov.pontos} pontos na movimentação e ${c.pontos_total} na compra.`,
                c.id
            );
        }
    });

    if (idsCompras.size !== compras.length) adicionar("ID_COMPRA_DUPLICADO", "Há compras com o mesmo id.");

    // 3. Movimentação sem origem
    movimentos.forEach((m) => {
        if (!idsClientes.has(m.cliente_id)) {
            adicionar("MOVIMENTACAO_SEM_CLIENTE", `Movimentação ${m.id} referencia cliente inexistente.`, m.id);
        }
        if (m.tipo === "acumulo") {
            const origemCompra = m.origem === "COMPRA" || !m.origem;
            const origemImpacto = m.origem === "BONUS_DOACAO" || m.origem === "BONUS_CAIXA";
            if (origemCompra && m.compras_id && !idsCompras.has(m.compras_id)) {
                adicionar("MOVIMENTACAO_SEM_COMPRA", `Movimentação ${m.id} referencia compra ${m.compras_id} inexistente.`, m.id);
            }
            if (origemImpacto && !idsAcoes.has(m.origem_id)) {
                adicionar("MOVIMENTACAO_SEM_ACAO", `Bônus de impacto ${m.id} referencia ação ${m.origem_id} inexistente.`, m.id);
            }
        }
        if (m.tipo === "resgate" && m.resgates_id && !idsResgates.has(m.resgates_id)) {
            adicionar("MOVIMENTACAO_SEM_RESGATE", `Resgate ${m.id} referencia registro ${m.resgates_id} inexistente.`, m.id);
        }
        if (m.tipo === "acumulo") {
            const vencida = acumuloVencido(m, ref);
            if (vencida) {
                const jaLancada = movimentos.some(
                    (o) =>
                        o.tipo === "expiracao" &&
                        o.origem_id === m.id &&
                        (o.origem === "EXPIRACAO" || !o.origem)
                );
                if (!jaLancada) {
                    adicionar(
                        "PONTOS_EXPIRADOS_NAO_LANCADOS",
                        `Acúmulo ${m.id} do cliente ${m.cliente_id} venceu em ${String(m.data_expiracao).slice(0, 10)} e ainda não foi lançado como EXPIRAÇÃO.`,
                        m.id
                    );
                }
            }
        }
    });

    // 4. Resgate sem saldo suficiente / pontos negativos / resgate duplicado
    const resgatesPorMovimento = new Map();
    movimentos
        .filter((m) => m.tipo === "resgate")
        .forEach((m) => {
            const chave = `${m.cliente_id}:${m.resgates_id}`;
            if (resgatesPorMovimento.has(chave)) {
                adicionar("RESGATE_DUPLICADO", `Resgate ${m.resgates_id} do cliente ${m.cliente_id} possui mais de uma movimentação.`, m.id);
            }
            resgatesPorMovimento.set(chave, m);
        });

    const valorEsperado = (pontos) =>
        Math.round((pontos / regras.REGRAS.conversao.pontos) * regras.REGRAS.conversao.valorReal * 100) / 100;
    resgates.forEach((r) => {
        if (!idsClientes.has(r.cliente_id)) {
            adicionar("RESGATE_SEM_CLIENTE", `Resgate ${r.id} referencia cliente inexistente.`, r.id);
        }
        const esperado = valorEsperado(r.pontos_utilizados);
        if (Math.abs((Number(r.valor_desconto) || 0) - esperado) > 0.001) {
            adicionar(
                "DESCONTO_INCORRETO",
                `Resgate ${r.id}: valor_desconto (${r.valor_desconto}) ≠ ${regras.REGRAS.conversao.pontos} pts → R$ ${esperado}.`,
                r.id
            );
        }
    });

    // Saldo nunca negativo e resgates sempre dentro do saldo
    clientes.forEach((c) => {
        const movs = movimentos.filter((m) => m.cliente_id === c.id);
        const saldo = saldoDisponivelDeMovimentos(movs, ref);
        if (saldo < 0) {
            adicionar("SALDO_NEGATIVO", `Cliente ${c.id} (${c.nome}) possui saldo negativo (${saldo}).`, c.id);
        }
        const totalResgatado = soma(
            movs.filter((m) => m.tipo === "resgate"),
            (m) => Math.abs(m.pontos)
        );
        if (totalResgatado > totaisDeMovimentos(movs, ref).gerados) {
            adicionar("RESGATE_ACIMA_DO_ACUMULO", `Cliente ${c.id} resgatou mais do que acumulou.`, c.id);
        }
    });

    // 5. Ação de impacto pontuada duas vezes
    acoes.forEach((a) => {
        const movs = movimentos.filter(
            (m) => m.origem_id === a.id && (m.origem === "BONUS_DOACAO" || m.origem === "BONUS_CAIXA")
        );
        if (movs.length > 1) {
            adicionar(
                "IMPACTO_PONTUADO_DUAS_VEZES",
                `Ação de impacto ${a.id} possui ${movs.length} movimentações de bônus.`,
                a.id
            );
        }
        if (a.status_validacao === "APROVADO" && movs.length === 0) {
            adicionar("IMPACTO_APROVADO_SEM_PONTOS", `Ação de impacto ${a.id} aprovada sem movimentação de bônus.`, a.id);
        }
        if (a.status_validacao !== "APROVADO" && movs.length > 0) {
            adicionar(
                "IMPACTO_NAO_APROVADO_COM_PONTOS",
                `Ação de impacto ${a.id} (${a.status_validacao}) possui bônus concedido.`,
                a.id
            );
        }
        if (["DESTINADO", "ENTREGUE"].includes(a.status_destinacao) && !a.destino) {
            adicionar("DESTINACAO_SEM_DESTINO", `Ação de impacto ${a.id} destinada sem informar o destino.`, a.id);
        }
    });

    // 6. Nível incompatível com a regra
    clientes.forEach((c) => {
        const movs = movimentos.filter((m) => m.cliente_id === c.id);
        const acumulados = soma(movs.filter((m) => m.tipo === "acumulo"), (m) => m.pontos);
        const esperado = regras.calcularNivel(acumulados);
        const pctBônus = soma(
            compras.filter((x) => x.cliente_id === c.id),
            (x) => x.cliente_pontos_bonus
        );
        if (pctBônus > acumulados) {
            adicionar(
                "BONUS_MAIOR_QUE_ACUMULO",
                `Cliente ${c.id} recebeu ${pctBônus} pontos de bônus e acumulou ${acumulados}.`,
                c.id
            );
        }
        if (nivelIncompativel(esperado, acumulados)) {
            adicionar("NIVEL_INCOMPATIVEL", `Cliente ${c.id} (${c.nome}) com nível inconsistente.`, c.id);
        }
    });

    // 7. Conference do dashboard x base
    const ind = calcular(base, ref);
    if (!ind.reconciliacao.coerente) {
        adicionar(
            "DASHBOARD_DIVERGENTE_DA_BASE",
            `Saldo global (${ind.pontos.disponiveis}) difere da soma dos clientes (${ind.pontos.saldoPorCliente}) em ${ind.reconciliacao.diferenca}.`
        );
    }
    if (ind.niveis.bronze + ind.niveis.prata + ind.niveis.ouro !== clientes.length) {
        adicionar("NIVEIS_NAO_FECHAM", "A soma dos níveis difere do total de clientes.");
    }
    if (ind.status.ATIVO + ind.status.ATENCAO + ind.status.RISCO + ind.status.INATIVO !== clientes.length) {
        adicionar("STATUS_NAO_FECHAM", "A soma dos status difere do total de clientes.");
    }
    const somaImpacto = ind.impacto.calcados + ind.impacto.caixas;
    if (somaImpacto !== ind.impacto.itensArrecadados) {
        adicionar("IMPACTO_NAO_FECHA", "Calçados + caixas difere do total de itens arrecadados.");
    }

    return {
        dataReferencia: ref.toISOString(),
        totalProblemas: problemas.length,
        problemas,
        ok: problemas.length === 0,
    };
}

function nivelIncompativel(nivel, pontos) {
    if (pontos < 0) return true;
    const ordenados = [...regras.REGRAS.niveis].sort((a, b) => b.minimo - a.minimo);
    const correto = ordenados.find((n) => pontos >= n.minimo) || ordenados[ordenados.length - 1];
    return correto.nome !== nivel.nome;
}

module.exports = {
    TIPOS_ACUMULO,
    chaveMes,
    rotuloMes,
    proximaChave,
    acumuloVencido,
    totaisDeMovimentos,
    saldoDisponivelDeMovimentos,
    mesesComMovimentacaoPontos,
    evolucaoMensal,
    evolucaoMensalClientes,
    calcular,
    auditar,
};
