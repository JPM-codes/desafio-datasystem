const express = require("express");
const router = express.Router();
const store = require("../services/store");

router.get("/", (req, res) => {
    const base = store.carregar();
    return res.json(store.dashboard(base, new Date()));
});

module.exports = router;