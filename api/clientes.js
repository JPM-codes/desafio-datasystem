const express = require("express");
const router = express.Router();
const store = require("../services/store");
const regras = require("../services/regras");

const CAMPOS_EDITAVEIS = [
    "nome",
    "tipo_documento",
    "documento",
    "email",
    "whatsapp",
    "data_nascimento",
    "numero_calcado",
    "cidade",
    "bairro",
    "consentimento_comunicacao",
    "preferencias",
    "tags",
];

function limparPreferencias(pref) {
    if (!pref || typeof pref !== "object") return {};
    const arr = (v) => (Array.isArray(v) ? v : String(v || "").split(",").map((s) => s.trim()).filter(Boolean));
    return {
        categorias: arr(pref.categorias),
        estilos: arr(pref.estilos),
        prioridades: arr(pref.prioridades),
        cores: arr(pref.cores),
        faixa_preco: typeof pref.faixa_preco === "string" ? pref.faixa_preco : "",
    };
}

router.get("/", (req, res) => {
    const base = store.carregar();
    return res.json(base.clientes);
});

router.post("/", (req, res) => {
    const body = req.body || {};
    const nome = String(body.nome || "").trim();
    const documento = String(body.documento || "").trim();
    const tipo = body.tipo_documento || "CPF";

    if (!nome) return res.status(422).json({ message: "Informe o nome completo." });
    if (!documento) return res.status(422).json({ message: "Informe o CPF/CNPJ." });

    if (tipo === "CPF" && !regras.validarCPF(documento)) {
        return res.status(422).json({ message: "CPF inválido." });
    }

    const base = store.carregar();
    const digitos = regras.soDigitos(documento);
    const duplicado = base.clientes.find(
        (c) => c.tipo_documento === tipo && regras.soDigitos(c.documento) === digitos
    );
    if (duplicado) {
        return res.status(409).json({ message: "Já existe um cliente cadastrado com esse documento.", cliente: duplicado });
    }

    const agora = store.agoraIso();
    const cliente = {
        id: store.proximoId(base.clientes),
        nome,
        tipo_documento: tipo,
        documento: documento,
        email: body.email || "",
        whatsapp: body.whatsapp || "",
        data_nascimento: body.data_nascimento || null,
        numero_calcado: body.numero_calcado ? Number(body.numero_calcado) : null,
        cidade: body.cidade || "",
        bairro: body.bairro || "",
        consentimento_comunicacao: !!body.consentimento_comunicacao,
        preferencias: limparPreferencias(body.preferencias),
        tags: Array.isArray(body.tags) ? body.tags : [],
        create_at: agora,
        update_at: agora,
    };

    base.clientes.push(cliente);
    store.salvar("cliente", base.clientes);
    return res.status(201).json(cliente);
});

router.put("/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const base = store.carregar();
    const cliente = base.clientes.find((c) => c.id === id);
    if (!cliente) return res.status(404).json({ message: "Cliente não encontrado." });

    const body = req.body || {};
    CAMPOS_EDITAVEIS.forEach((campo) => {
        if (campo === "preferencias") {
            cliente.preferencias = limparPreferencias(body.preferencias);
        } else if (campo === "tags") {
            if (Array.isArray(body.tags)) cliente.tags = body.tags;
        } else if (campo === "documento") {
            const documento = String(body.documento || "").trim();
            if (documento) {
                if (cliente.tipo_documento === "CPF" && !regras.validarCPF(documento)) {
                    return res.status(422).json({ message: "CPF inválido." });
                }
                cliente.documento = documento;
            }
        } else if (campo === "nome") {
            const nome = String(body.nome || "").trim();
            if (nome) cliente.nome = nome;
        } else if (body[campo] !== undefined && body[campo] !== null) {
            cliente[campo] = body[campo];
        }
    });

    cliente.update_at = store.agoraIso();
    store.salvar("cliente", base.clientes);
    return res.json(cliente);
});

router.get("/busca", (req, res) => {
    const base = store.carregar();
    const { nome, cpf, documento } = req.query;

    if (!nome && !cpf && !documento) {
        return res.status(400).json({
            message: "Informe ao menos um parâmetro para busca: 'nome', 'cpf' ou 'documento'.",
        });
    }

    const termoNome = nome ? nome.trim().toLowerCase() : null;
    const termoCpf = cpf ? String(cpf).replace(/\D/g, "") : null;
    const termoDocumento = documento ? documento.trim().toLowerCase() : null;

    const resultados = base.clientes.filter((cliente) => {
        const bateuNome = termoNome
            ? cliente.nome && cliente.nome.toLowerCase().includes(termoNome)
            : true;
        const documentoCadastrado = cliente.documento ? String(cliente.documento).replace(/\D/g, "") : "";
        const bateuCpf = termoCpf ? documentoCadastrado.includes(termoCpf) : true;
        const docBateu = termoDocumento
            ? cliente.tipo_documento && cliente.tipo_documento.toLowerCase().includes(termoDocumento)
            : true;
        return bateuNome && bateuCpf && docBateu;
    });

    if (resultados.length === 0) {
        return res.status(404).json({ message: "Nenhum cliente encontrado." });
    }
    return res.json(resultados);
});

router.get("/:id", (req, res) => {
    const idParam = parseInt(req.params.id);
    if (isNaN(idParam)) return res.status(400).json({ message: "ID inválido. Forneça um número." });

    const base = store.carregar();
    const cliente = base.clientes.find((c) => c.id === idParam);
    if (!cliente) return res.status(404).json({ message: "Cliente não encontrado." });
    return res.json(cliente);
});

module.exports = router;