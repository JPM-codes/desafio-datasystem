'use strict';

/**
 * Gera a massa de dados fictícia do programa de fidelidade FATECalçados.
 * - 30 clientes distribuídos em 7 perfis comportamentais;
 * - 300 compras (2026-01 a 2026-09);
 * - Movimentações de pontos (acúmulo + resgate) com validade de 12 meses;
 * - Resgates dentro do saldo disponível.
 *
 * Uso: node scripts/seed.js
 * Os arquivos em public/database/*.json são reescritos.
 */
const fs = require("fs");
const path = require("path");
const regras = require("../services/regras");

const DIR = path.join(__dirname, "..", "public", "database");
const HOJE = new Date("2026-09-24T12:00:00Z");
const SEED = 20260924;

// ============================================================
// RNG determinístico (mulberry32)
// ============================================================
function mulberry32(semente) {
    return function () {
        semente |= 0;
        semente = (semente + 0x6d2b79f5) | 0;
        let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rng = mulberry32(SEED);

function entre(min, max) {
    return min + rng() * (max - min);
}
function inteiro(min, max) {
    return Math.round(entre(min, max));
}
function amostrar(lista) {
    return lista[Math.floor(rng() * lista.length)];
}
function amostrarN(lista, n) {
    const copia = [...lista];
    const saida = [];
    while (saida.length < n && copia.length) {
        const idx = Math.floor(rng() * copia.length);
        saida.push(copia.splice(idx, 1)[0]);
    }
    return saida;
}

function isoDiasAtras(dias) {
    const d = new Date(HOJE.getTime() - dias * 86400000);
    d.setHours(9 + Math.floor(rng() * 10), Math.floor(rng() * 60), 0, 0);
    return d.toISOString();
}

// ============================================================
// CPF válido
// ============================================================
function digitoVerificador(digitos) {
    let soma = 0;
    for (let i = 0, peso = digitos.length + 1; i < digitos.length; i++, peso--) {
        soma += digitos[i] * peso;
    }
    let resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
}
function gerarCpf() {
    const n = Array.from({ length: 9 }, () => Math.floor(rng() * 10));
    const d1 = digitoVerificador(n);
    const d2 = digitoVerificador([...n, d1]);
    const digitos = [...n, d1, d2].join("");
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}
function mascararDoc(digitos) {
    return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

// ============================================================
// Catálogo e preferências
// ============================================================
const CATALOGO = [
    { produto: "Tênis Esportivo", categoria: "Tênis", preco: 150 },
    { produto: "Tênis Casual", categoria: "Tênis", preco: 180 },
    { produto: "Tênis Lazer", categoria: "Tênis", preco: 140 },
    { produto: "Tênis Corrida", categoria: "Tênis", preco: 320 },
    { produto: "Sandália Conforto", categoria: "Sandália", preco: 120 },
    { produto: "Sandália Elegante", categoria: "Sandália", preco: 170 },
    { produto: "Chinelo Premium", categoria: "Chinelo", preco: 80 },
    { produto: "Scarpin Salto", categoria: "Social", preco: 220 },
    { produto: "Sapatilha Básica", categoria: "Conforto", preco: 90 },
    { produto: "Mocassim Clássico", categoria: "Clássico", preco: 190 },
    { produto: "Bota Adventure", categoria: "Bota", preco: 250 },
    { produto: "Social Couro", categoria: "Social", preco: 280 },
];

const ESTILOS = ["Casual", "Esportivo", "Social", "Conforto", "Básico", "Clássico"];
const CORES = ["Preto", "Branco", "Cinza", "Azul", "Bege", "Marinho", "Vermelho", "Rosa"];
const PRIORIDADES = ["Conforto", "Preço", "Qualidade", "Durabilidade", "Design", "Tendência"];
const FAIXAS_PRECO = ["Até R$ 90", "R$ 90 – R$ 150", "R$ 150 – R$ 250", "Acima de R$ 250"];
const CIDADES = ["São Paulo", "Guarulhos", "Osasco", "Santo André", "Campinas", "São Bernardo do Campo"];
const BAIRROS = [
    "Centro", "Vila Mariana", "Tatuapé", "Moema", "Pinheiros", "Santana",
    "Penha", "Ipiranga", "Itaquera", "Jabaquara", "Saúde", "Freguesia do Ó",
];

const NOMES = [
    "Ana Beatriz Souza", "Bruno Carvalho", "Camila Ferreira", "Diego Almeida",
    "Elisa Martins", "Felipe Rocha", "Gabriela Nunes", "Henrique Pires",
    "Isabela Costa", "João Henrique Ramos", "Karen Dias", "Leonardo Moura",
    "Mariana Castro", "Nicolas Barbosa", "Olívia Teixeira", "Paulo Henrique Lopes",
    "Raquel Monteiro", "Samuel Andrade", "Tatiane Freitas", "Ubiratan Cardoso",
    "Vitória Santana", "Wesley Pinto", "Yasmin Moraes", "Zeca Ribeiro",
    "Alice Duarte", "Breno Fontes", "Carla Menezes", "Daniela Siqueira",
    "Eduardo Vasconcelos", "Fernanda Goulart",
];

// ============================================================
// Perfis comportamentais (comportamento → status esperado)
// ============================================================
const PERFIS = [
    { nome: "recorrente", qtd: 4, compras: 16, ultimaDia: [5, 22], inicioDia: 240 },
    { nome: "unica", qtd: 4, compras: 1, ultimaDia: [20, 170] },
    { nome: "risco", qtd: 4, compras: 9, ultimaDia: [62, 88], inicioDia: 195 },
    { nome: "inativo", qtd: 6, compras: 6, ultimaDia: [95, 160], inicioDia: 220 },
    { nome: "parado", qtd: 4, compras: 10, ultimaDia: [70, 120], inicioDia: 205 },
    { nome: "fiel", qtd: 4, compras: 23, ultimaDia: [3, 12], inicioDia: 245 },
    { nome: "proximo", qtd: 4, compras: 10, ultimaDia: [3, 20], inicioDia: 235, alvos: [960, 985, 4805, 4890] },
];

// ============================================================
// Geração de compras
// ============================================================
function gerarDatas(perfil) {
    const n = perfil.compras;
    if (n === 1) return [isoDiasAtras(inteiro(perfil.ultimaDia[0], perfil.ultimaDia[1]))];

    const ultima = entre(perfil.ultimaDia[0], perfil.ultimaDia[1]);
    const inicio = perfil.inicioDia;
    const offsets = [];
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const o = inicio - t * (inicio - ultima) + (rng() - 0.5) * 3;
        offsets.push(Math.max(1, Math.round(o)));
    }
    offsets.sort((a, b) => b - a);
    return offsets.map((o) => isoDiasAtras(o));
}

function montarCompra(valor) {
    const produto = amostrar(CATALOGO);
    const qtd = inteiro(1, 3);
    const total = Math.max(40, Math.round(valor));
    return {
        produto: produto.produto,
        quantidade: qtd,
        valor_unitario: Math.round(total / qtd),
        valor_total: total,
    };
}

function gerarValores(perfil) {
    const n = perfil.compras;
    if (perfil.alvos) {
        const alvo = amostrar(perfil.alvos);
        const valores = Array.from({ length: n }, () => Math.round(entre(140, 430) / 10) * 10);
        const soma = valores.reduce((a, b) => a + b, 0);
        valores[n - 1] = Math.max(60, valores[n - 1] + (alvo - soma));
        return { valores, alvo };
    }
    return { valores: Array.from({ length: n }, () => Math.round(entre(90, 460) / 10) * 10), alvo: null };
}

function simTotalPontos(compras) {
    let total = 0;
    for (const c of compras) {
        const nivel = regras.calcularNivel(total);
        total += regras.calcularPontos(c.valor_total, nivel).total;
    }
    return total;
}

function ajustarParaAlvo(compras, alvo) {
    for (let iter = 0; iter < 8; iter++) {
        const total = simTotalPontos(compras);
        const diff = alvo - total;
        if (Math.abs(diff) < 20) break;
        const antes = compras.slice(0, -1);
        const nivel = regras.calcularNivel(simTotalPontos(antes));
        const mult = 1 + (nivel.bonus || 0);
        const ultima = compras[compras.length - 1];
        ultima.valor_total = Math.max(40, Math.round((ultima.valor_total + diff / mult)));
    }
}

function computarPontos(compras) {
    let total = 0;
    return compras.map((c) => {
        const nivel = regras.calcularNivel(total);
        const pts = regras.calcularPontos(c.valor_total, nivel);
        total += pts.total;
        return {
            ...c,
            pontos_base: pts.base,
            cliente_pontos_bonus: pts.bonus,
            pontos_total: pts.total,
            bonus_percentual: pts.bonusPercentual,
        };
    });
}

function gerarComprasCliente(perfil) {
    const datas = gerarDatas(perfil);
    const { valores, alvo } = gerarValores(perfil);

    const compras = valores.map((valor, i) => ({
        data_compra: datas[i],
        ...montarCompra(valor),
    }));

    if (perfil.alvos) {
        ajustarParaAlvo(compras, alvo);
    }

    return computarPontos(compras);
}

// ============================================================
// Geração de resgates (apenas dentro do saldo)
// ============================================================
function gerarResgates(clienteId, compras, perfil) {
    if (!compras || compras.length < 2) return { resgates: [], movimentos: [] };
    if (perfil.nome === "unica" || perfil.nome === "parado") return { resgates: [], movimentos: [] };

    const quantidade = perfil.nome === "fiel" ? inteiro(2, 4) : inteiro(1, 3);
    if (rng() < 0.1) return { resgates: [], movimentos: [] };

    const resgates = [];
    const movimentos = [];
    let saldo = 0;
    let usado = 0;

    compras.forEach((compra, idx) => {
        saldo += compra.pontos_total;

        const fazResgate =
            idx > 0 &&
            idx < compras.length - 1 &&
            resgates.length < quantidade &&
            rng() < 0.55;

        if (!fazResgate) return;

        const disponivel = saldo - usado;
        if (disponivel < 100) return;

        const pontos = Math.floor((disponivel * entre(0.3, 0.65)) / 100) * 100;
        if (pontos < 100) return;

        const resgateId = resgates.length + 1;
        usado += pontos;
        resgates.push({
            id: resgateId,
            cliente_id: clienteId,
            pontos_utilizados: pontos,
            valor_desconto: Math.round((pontos / 100) * 5 * 100) / 100,
            data_resgate: compra.data_compra,
            create_at: compra.data_compra,
        });
        movimentos.push({
            cliente_id: clienteId,
            tipo: "resgate",
            pontos: -pontos,
            data_movimentacao: compra.data_compra,
            data_expiracao: null,
            compras_id: 0,
            resgates_id: resgateId,
            create_at: compra.data_compra,
        });
    });

    return { resgates, movimentos };
}

// ============================================================
// Geração de clientes
// ============================================================
function gerarCliente(id, nome, perfil) {
    const cpf = gerarCpf();
    const ePessoaJuridica = id % 15 === 0;
    const documento = ePessoaJuridica
        ? mascararDoc(String(12000000000000 + id * 137).slice(0, 14).padStart(14, "0"))
        : cpf;

    const categorias = amostrarN(["Tênis", "Sandália", "Chinelo", "Social", "Conforto", "Clássico", "Bota"], inteiro(1, 3));
    const faixa = amostrar(FAIXAS_PRECO);

    return {
        id,
        nome,
        tipo_documento: ePessoaJuridica ? "CNPJ" : "CPF",
        documento,
        email: `${nome.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/).join(".")}@fatecalcados.com.br`,
        whatsapp: `(11) 9${inteiro(1000, 9999)}-${inteiro(1000, 9999)}`,
        data_nascimento: new Date(`${inteiro(1962, 2005)}-${String(inteiro(1, 12)).padStart(2, "0")}-${String(inteiro(1, 28)).padStart(2, "0")}T00:00:00Z`).toISOString(),
        numero_calcado: amostrar([34, 35, 36, 36, 37, 37, 38, 38, 39, 39, 40, 40, 41, 42, 43, 44]),
        cidade: amostrar(CIDADES),
        bairro: amostrar(BAIRROS),
        consentimento_comunicacao: rng() < 0.72,
        preferencias: {
            categorias,
            estilos: amostrarN(ESTILOS, inteiro(1, 2)),
            prioridades: amostrarN(PRIORIDADES, inteiro(1, 2)),
            cores: amostrarN(CORES, inteiro(1, 2)),
            faixa_preco: faixa,
        },
        tags: [],
        create_at: null,
        update_at: null,
    };
}

// ============================================================
// Principal
// ============================================================
function main() {
    const clientes = [];
    const compras = [];
    const pontos = [];
    const resgates = [];
    let idCliente = 1;
    let idCompra = 1;
    let idPonto = 1;
    let idResgate = 1;
    let indiceNome = 0;

    for (const perfil of PERFIS) {
        for (let i = 0; i < perfil.qtd; i++) {
            const cliente = gerarCliente(idCliente, NOMES[indiceNome++ % NOMES.length], perfil);
            const comprasCliente = gerarComprasCliente(perfil);

            // data_cadastro ~ 15–45 dias antes da primeira compra
            const primeira = new Date(comprasCliente[0].data_compra);
            const cadastro = new Date(primeira.getTime() - inteiro(15, 45) * 86400000);
            if (cadastro < new Date("2026-01-01T00:00:00Z")) {
                cadastro.setTime(new Date("2026-01-04T00:00:00Z").getTime());
            }
            const createAt = cadastro.toISOString();
            cliente.create_at = createAt;
            cliente.update_at = comprasCliente[comprasCliente.length - 1].data_compra;

            comprasCliente.forEach((c) => {
                compras.push({
                    id: idCompra,
                    cliente_id: cliente.id,
                    produto: c.produto,
                    quantidade: c.quantidade,
                    valor_unitario: c.valor_unitario,
                    valor_total: c.valor_total,
                    pontos_base: c.pontos_base,
                    cliente_pontos_bonus: c.cliente_pontos_bonus,
                    pontos_total: c.pontos_total,
                    data_compra: c.data_compra,
                    create_at: c.data_compra,
                });
                const expiracao = regras.calcularDataExpiracao(c.data_compra, regras.REGRAS.validadeMeses);
                pontos.push({
                    id: idPonto++,
                    cliente_id: cliente.id,
                    tipo: "acumulo",
                    pontos: c.pontos_total,
                    data_movimentacao: c.data_compra,
                    data_expiracao: expiracao ? expiracao.toISOString() : null,
                    compras_id: idCompra,
                    resgates_id: 0,
                    create_at: c.data_compra,
                });
                idCompra++;
            });

            const { resgates: resgClientes, movimentos: movResgates } = gerarResgates(cliente.id, comprasCliente, perfil);
            resgClientes.forEach((r) => {
                resgates.push({ ...r, id: idResgate++ });
            });
            movResgates.forEach((m) => {
                const expRef = pontos[pontos.length - 1];
                pontos.push({
                    id: idPonto++,
                    cliente_id: cliente.id,
                    tipo: m.tipo,
                    pontos: m.pontos,
                    data_movimentacao: m.data_movimentacao,
                    data_expiracao: null,
                    compras_id: 0,
                    resgates_id: m.resgates_id,
                    create_at: m.create_at,
                });
            });

            cliente.create_at = createAt;
            clientes.push(cliente);
            idCliente++;
        }
    }

    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, "cliente.json"), `${JSON.stringify(clientes, null, 4)}\n`, "utf8");
    fs.writeFileSync(path.join(DIR, "compras.json"), `${JSON.stringify(compras, null, 4)}\n`, "utf8");
    fs.writeFileSync(path.join(DIR, "pontos.json"), `${JSON.stringify(pontos, null, 4)}\n`, "utf8");
    fs.writeFileSync(path.join(DIR, "resgate.json"), `${JSON.stringify(resgates, null, 4)}\n`, "utf8");

    const resgateTotal = resgates.reduce((s, r) => s + r.pontos_utilizados, 0);
    console.log("Massa de dados gerada:");
    console.log(`  clientes : ${clientes.length}`);
    console.log(`  compras  : ${compras.length}`);
    console.log(`  pontos   : ${pontos.length} movimentações`);
    console.log(`  resgates : ${resgates.length} (${resgateTotal.toLocaleString("pt-BR")} pts)`);
    console.log(`  janela   : ${compras[0].data_compra.slice(0, 10)} a ${compras[compras.length - 1].data_compra.slice(0, 10)}`);
}

main();