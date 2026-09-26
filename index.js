const express = require("express");
const path = require("path");
const app = express();

// Importação dos módulos de rotas
const clientesRoutes = require("./api/clientes");
const comprasRoutes = require("./api/compras");
const pontosRoutes = require("./api/pontos");
const resgatesRoutes = require("./api/resgates");
const dashboardRoutes = require("./api/dashboard");
const impactoRoutes = require("./api/impacto");
const dashboardWebRoutes = require("./views/index");


// Configuração do motor de visualização (EJS) e pasta das views
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Middlewares para ficheiros estáticos e parsing de JSON
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Consumo das rotas (Registar apenas O PREFIXO BASE de cada rota)
app.use("/api/clientes", clientesRoutes);
app.use("/api/compras", comprasRoutes);
app.use("/api/pontos", pontosRoutes);
app.use("/api/resgates", resgatesRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/impacto", impactoRoutes);
app.use("/", dashboardWebRoutes);

const PORTA = process.env.PORT || 3000;

// Exporta o app para permitir testes de integração (scripts/testes-e2e.js).
// O servidor só sobe quando este arquivo é executado diretamente.
if (require.main === module) {
    app.listen(PORTA, () => {
        console.log("Server is running on port " + PORTA);
    });
}

module.exports = app;