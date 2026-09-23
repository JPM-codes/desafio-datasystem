const express = require("express");
const clientes = require("../public/database/cliente.json");

const router = express.Router();

router.get("/", (req, res) => {
    return res.json(clientes);
});

router.get("/busca", (req, res) => {
    const { nome, cpf, documento } = req.query;

    if (!nome && !cpf && !documento) {
        return res.status(400).json({ 
            message: "Informe ao menos um parâmetro para busca: 'nome', 'cpf' ou 'documento'." 
        });
    }

    const termoNome = nome ? nome.trim().toLowerCase() : null;
    const termoCpf = cpf ? String(cpf).replace(/\D/g, "") : null;
    const termoDocumento = documento ? documento.trim().toLowerCase() : null;

    const resultados = clientes.filter((cliente) => {
        // Filtro por Nome
        const bateuNome = termoNome 
            ? cliente.nome && cliente.nome.toLowerCase().includes(termoNome) 
            : true;

        // Correção: Lendo o campo "documento" do JSON em vez de "cpf"
        const documentoCadastrado = cliente.documento ? String(cliente.documento).replace(/\D/g, "") : "";
        
        // Filtro por CPF
        const bateuCpf = termoCpf 
            ? documentoCadastrado.includes(termoCpf) 
            : true;
        
        // Filtro por documento
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

    if (isNaN(idParam)) {
        return res.status(400).json({ message: "ID inválido. Forneça um número." });
    }

    const cliente = clientes.find((c) => c.id === idParam);

    if (!cliente) {
        return res.status(404).json({ message: "Cliente não encontrado." });
    }

    return res.json(cliente);
});

module.exports = router;