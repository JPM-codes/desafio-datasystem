const express = require("express");
const router = express.Router();
const store = require("../services/store");
const indicadores = require("../services/indicadores");

/**
 * GET /api/dashboard
 * Fonte única: services/indicadores.js. Todos os indicadores do painel
 * principal e o bloco de conferência contábil dos pontos.
 */
router.get("/", (req, res) => {
    const base = store.carregar();
    const ref = new Date();
    return res.json(Object.assign(store.dashboard(base, ref), {
        indicadores: indicadores.calcular(base, ref),
    }));
});

/** GET /api/dashboard/auditoria — auditoria de consistência (Prioridade 19). */
router.get("/auditoria", (req, res) => {
    const base = store.carregar();
    const resultado = indicadores.auditar(base, new Date());
    return res.status(resultado.ok ? 200 : 409).json(resultado);
});

module.exports = router;