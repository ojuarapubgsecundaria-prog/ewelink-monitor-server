require("dotenv").config();
const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const { getSession, getSettings } = require("./database");
const { startMonitor } = require("./monitor");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Rotas ───────────────────────────────────────────────────────────────────
app.use("/api", routes);

// ─── Rota raiz ───────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    app: "eWeLink Monitor",
    version: "1.0.0",
    status: "running",
    docs: "/api/healthz",
  });
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 eWeLink Monitor Server rodando na porta ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/healthz\n`);

  // Retomar monitoramento se havia sessão ativa
  try {
    const session = getSession();
    const settings = getSettings();
    if (session?.access_token && settings?.monitoring_enabled === 1) {
      console.log("[Startup] Sessão encontrada, retomando monitoramento...");
      startMonitor(session.session_id);
    }
  } catch (err) {
    console.error("[Startup] Erro ao verificar sessão:", err.message);
  }
});
