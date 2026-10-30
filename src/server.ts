import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import routes from "./routes";

const app = express();

app.use(express.json());
app.use(routes);

// Qualquer rota que não existe cai aqui
app.use((req, res) => {
  res.status(404).json({ message: "Rota não encontrada" });
});

// JSON malformado no corpo da requisição é erro do cliente (400), não nosso
app.use((err: { status?: number }, req: Request, res: Response, next: NextFunction) => {
  if (err.status === 400) {
    return res.status(400).json({ message: "JSON inválido no corpo da requisição." });
  }
  console.error(err);
  return res.status(500).json({ message: "Erro interno." });
});

const port = process.env.SERVER_PORT || 3001;

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
