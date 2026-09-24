const express = require("express");
const path = require("path");
const app = express();

// Importação dos módulos de rotas
const clientesRoutes = require("./api/clientes");
const comprasRoutes = require("./api/compras");
const dashboardRoutes = require("./app/views/index");


// Configuração do motor de visualização (EJS) e pasta das views
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Middlewares para ficheiros estáticos e parsing de JSON
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Consumo das rotas (Registar apenas O PREFIXO BASE de cada rota)
app.use("/api/clientes", clientesRoutes);
app.use("/api/compras", comprasRoutes);
app.use("/", dashboardRoutes);

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});