'use strict';

/**
 * Validação automática da massa de dados e das regras de negócio.
 * Uso: node scripts/validacao.js
 * Retorna código de saída 0 (ok) ou 1 (falhou).
 */
const store = require("../services/store");
const regras = require("../services/regras");

const base = store.carregar();
const refer = new Date("2026-09-24T12:00:00Z");
let falhas = 0;
let avisos = 0;

function erro(msg) {
    falhas++;
    console.log(`  [FALHA] ${msg}`);
}

function aviso(msg) {
    avisos++;
    console.log(`  [AVISO] ${msg}`);
}

function ok(msg) {
    console.log(`  [ok] ${msg}`);
}

function teste(nome, condicao) {
    if (condicao) {
        console.log(`  [ok] ${nome}`);
    } else {
        erro(nome);
    }
}

// ============================================================
// 1. Regras de negócio (unit)
// ============================================================
console.log("\n1) Regras centralizadas (services/regras.js)");
const prata = regras.calcularNivel(1001);
const pts = regras.calcularPontos(100, prata);
teste("calcularPontos(100, Prata) → base 100, bônus 10, total 110", pts.base === 100 && pts.bonus === 10 && pts.total === 110);
teste("calcularNivel(500) → Bronze", regras.calcularNivel(500).nome === "Bronze");
teste("calcularNivel(1000) → Prata", regras.calcularNivel(1000).nome === "Prata");
teste("calcularNivel(5000) → Ouro", regras.calcularNivel(5000).nome === "Ouro");
teste("calcularDesconto(2000) → R$ 100", Math.abs(regras.calcularDesconto(2000) - 100) < 0.001);
teste("calcularDataExpiracao adiciona 12 meses", regras.adicionarMeses(new Date("2026-06-01T00:00:00Z"), 12).toISOString().startsWith("2027-06-01"));
teste("validarCPF(529.982.247-25) → true", regras.validarCPF("529.982.247-25") === true);
teste("validarCPF(111.111.111-11) → false", regras.validarCPF("111.111.111-11") === false);
teste("calcularStatusCliente(15) → ATIVO", regras.calcularStatusCliente(15).nome === "ATIVO");
teste("calcularStatusCliente(45) → ATENCAO", regras.calcularStatusCliente(45).nome === "ATENCAO");
teste("calcularStatusCliente(75) → RISCO", regras.calcularStatusCliente(75).nome === "RISCO");
teste("calcularStatusCliente(120) → INATIVO", regras.calcularStatusCliente(120).nome === "INATIVO");
teste("calcularTaxaSegundaCompra([1,2,3,1]) → 50%", regras.calcularTaxaSegundaCompra([1, 2, 3, 1]) === 50);

// ============================================================
// 2. Quantidades mínimas
// ============================================================
console.log("\n2) Quantidades da demonstração");
teste(`Clientes >= 20 (atual: ${base.clientes.length})`, base.clientes.length >= 20);
teste(`Compras >= 200 (atual: ${base.compras.length})`, base.compras.length >= 200);
teste(`Clientes >= 30 (recomendado): ${base.clientes.length}`, base.clientes.length >= 30);
teste(`Compras >= 300 (recomendado): ${base.compras.length}`, base.compras.length >= 300);

// ============================================================
// 3. Integridade de dados
// ============================================================
console.log("\n3) Integridade de dados");

const idsClientes = new Set(base.clientes.map((c) => c.id));
if (idsClientes.size !== base.clientes.length) erro("IDs de clientes duplicados.");

const idsCompras = new Set(base.compras.map((c) => c.id));
if (idsCompras.size !== base.compras.length) erro("IDs de compras duplicados.");

const idsResgates = new Set(base.resgates.map((r) => r.id));
if (idsResgates.size !== base.resgates.length) erro("IDs de resgates duplicados.");

base.clientes
    .filter((c) => c.tipo_documento === "CPF")
    .forEach((c) => {
        if (!regras.validarCPF(c.documento)) erro(`CPF inválido do cliente ${c.id} (${c.nome}).`);
    });
ok("CPFs verificados.");

const comprasOrfas = base.compras.filter((c) => !idsClientes.has(c.cliente_id));
if (comprasOrfas.length) erro(`${comprasOrfas.length} compra(s) sem cliente válido.`);
else ok("Todas as compras possuem cliente.");

const resgatesOrfaos = base.resgates.filter((r) => !idsClientes.has(r.cliente_id));
if (resgatesOrfaos.length) erro(`${resgatesOrfaos.length} resgate(s) sem cliente válido.`);
else ok("Todos os resgates possuem cliente.");

for (const cliente of base.clientes) {
    const compras = store.comprasDoCliente(base.compras, cliente.id);
    compras.forEach((c) => {
        if (c.pontos_base + c.cliente_pontos_bonus !== c.pontos_total) {
            erro(`Compra ${c.id}: pontos_total != base + bônus.`);
        }
    });
}
ok("pontos_total = pontos_base + bônus em todas as compras.");

// ============================================================
// 4. Níveis e pontos (recalculados)
// ============================================================
console.log("\n4) Níveis e pontos");

const enriquecidos = store.enriquecerClientes(base, refer);
for (const c of enriquecidos) {
    const esperado = regras.calcularNivel(c.pontosAcumulados);
    if (esperado.nome !== c.nivel.nome) {
        erro(`Nível do cliente ${c.id} divergente: ${c.nivel.nome} != ${esperado.nome}.`);
    }
}
ok("Níveis condizem com os pontos acumulados.");

for (const c of enriquecidos) {
    if (c.pontosDisponiveis < 0) erro(`Cliente ${c.id} com saldo negativo.`);
}
ok("Nenhum saldo negativo.");

for (const c of enriquecidos) {
    const esperado = regras.calcularStatusCliente(c.diasSemComprar);
    if (esperado.nome !== c.status.nome) {
        erro(`Status do cliente ${c.id} fora do esperado.`);
    }
}
ok("Status dentro das faixas configuradas.");

for (const c of enriquecidos) {
    const movs = store.movimentacoesDoCliente(base.pontos, c.id);
    movs
        .filter((m) => m.tipo === "acumulo")
        .forEach((m) => {
            const esperado = regras.adicionarMeses(m.data_movimentacao, regras.REGRAS.validadeMeses);
            if (!esperado || String(m.data_expiracao).slice(0, 7) !== esperado.toISOString().slice(0, 7)) {
                erro(`Expiração da movimentação ${m.id} diverge de +${regras.REGRAS.validadeMeses} meses.`);
            }
        });
}
ok("Expiração dos pontos = +12 meses.");

// ============================================================
// 5. Resgates dentro do saldo (serie temporal)
// ============================================================
console.log("\n5) Resgates dentro do saldo");

for (const cliente of base.clientes) {
    const eventos = [];
    base.pontos
        .filter((m) => m.cliente_id === cliente.id)
        .forEach((m) => {
            const valor = m.tipo === "acumulo" ? m.pontos : -Math.abs(m.pontos);
            eventos.push({ data: new Date(m.data_movimentacao), valor });
        });
    eventos.sort((a, b) => a.data - b.data);
    let saldo = 0;
    for (const ev of eventos) {
        saldo += ev.valor;
        if (saldo < -0.01) {
            erro(`Cliente ${cliente.id}: saldo negativo em ${ev.data.toISOString().slice(0, 10)}.`);
            break;
        }
    }
    const totalResgates = base.resgates
        .filter((r) => r.cliente_id === cliente.id)
        .reduce((s, r) => s + r.pontos_utilizados, 0);
    if (totalResgates > store.totaisPontos(store.movimentacoesDoCliente(base.pontos, cliente.id)).acumulado) {
        erro(`Cliente ${cliente.id}: resgates > pontos acumulados.`);
    }
}
ok("Todos os resgates respeitam o saldo disponível em cada data.");

// ============================================================
// 6. Indicadores do dashboard
// ============================================================
console.log("\n6) Indicadores do dashboard");
const dash = store.dashboard(base, refer);
teste("Taxa de 2ª compra entre 0 e 100", dash.retencao.taxaSegundaCompra >= 0 && dash.retencao.taxaSegundaCompra <= 100);
teste("Tempo médio até 2ª compra definido (>= 0)", dash.retencao.tempoMedioSegundaCompra !== null && dash.retencao.tempoMedioSegundaCompra >= 0);
teste("Soma dos status = total de clientes", dash.status.ATIVO + dash.status.ATENCAO + dash.status.RISCO + dash.status.INATIVO === base.clientes.length);
teste("Soma dos níveis = total de clientes", dash.niveis.bronze + dash.niveis.prata + dash.niveis.ouro === base.clientes.length);
teste("Evolução de pontos possui dados (6 meses)", dash.evolucaoPontos.length === 6);
const temGerados = dash.evolucaoPontos.some((m) => m.gerados > 0);
teste("Evolução de pontos possui pontos gerados", temGerados);

// ============================================================
// Fim
// ============================================================
console.log("\n=========================================");
console.log(`Total: ${falhas} falha(s), ${avisos} aviso(s).`);
console.log("=========================================");
process.exit(falhas ? 1 : 0);