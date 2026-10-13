import express from "express";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
  demoQuest,
  freshQuest,
  questSchema,
  summary,
  validateQuest,
  type Quest,
} from "@questspace/story";

type Row = {
  id: string;
  draft: string;
  published: string | null;
  version: number;
};
const revision = (json: string) =>
  createHash("sha256").update(json).digest("hex");

export function createApp(filename: string) {
  const db = new DatabaseSync(filename);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS quests (id TEXT PRIMARY KEY, draft TEXT NOT NULL, published TEXT, version INTEGER NOT NULL DEFAULT 1)",
  );
  const seed = JSON.stringify(demoQuest);
  db.prepare(
    "INSERT OR IGNORE INTO quests (id,draft,published) VALUES (?,?,?)",
  ).run(demoQuest.id, seed, seed);
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const configured = (process.env.CORS_ORIGINS ?? "")
      .split(",")
      .filter(Boolean);
    if (
      origin &&
      (/^http:\/\/(localhost|127\.0\.0\.1):(5173|8081|8082)$/.test(origin) ||
        configured.includes(origin))
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  const get = (id: string) =>
    db.prepare("SELECT * FROM quests WHERE id=?").get(id) as Row | undefined;
  const document = (row: Row) => ({
    quest: JSON.parse(row.draft) as Quest,
    version: row.version,
    published: !!row.published,
    hasChanges: row.draft !== row.published,
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/api/quests", (_req, res) => {
    const rows = db
      .prepare(
        "SELECT published FROM quests WHERE published IS NOT NULL ORDER BY rowid DESC",
      )
      .all() as { published: string }[];
    res.json(rows.map((row) => summary(JSON.parse(row.published))));
  });
  app.get("/api/quests/:id", (req, res) => {
    const row = get(req.params.id);
    if (!row?.published) {
      res.status(404).json({ error: "История не найдена." });
      return;
    }
    res.json({
      quest: JSON.parse(row.published),
      revision: revision(row.published),
    });
  });
  // Local, single-author prototype. Add authentication and ownership before public deployment.
  app.get("/api/studio/quests", (_req, res) => {
    const rows = db
      .prepare("SELECT * FROM quests ORDER BY rowid DESC")
      .all() as Row[];
    res.json(
      rows.map((row) => ({
        ...summary(JSON.parse(row.draft)),
        version: row.version,
        published: !!row.published,
        hasChanges: row.draft !== row.published,
      })),
    );
  });
  app.post("/api/studio/quests", (_req, res) => {
    const quest = freshQuest(randomUUID());
    db.prepare("INSERT INTO quests (id,draft) VALUES (?,?)").run(
      quest.id,
      JSON.stringify(quest),
    );
    res.status(201).json(document(get(quest.id)!));
  });
  app.get("/api/studio/quests/:id", (req, res) => {
    const row = get(req.params.id);
    if (!row) {
      res.status(404).json({ error: "История не найдена." });
      return;
    }
    res.json(document(row));
  });
  app.put("/api/studio/quests/:id", (req, res) => {
    const row = get(req.params.id);
    if (!row) {
      res.status(404).json({ error: "История не найдена." });
      return;
    }
    const parsed = questSchema.safeParse(req.body?.quest);
    if (!parsed.success) {
      res
        .status(400)
        .json({
          error:
            "Проверьте название, сообщения и ответы: обязательные поля не могут быть пустыми.",
          issues: parsed.error.issues,
        });
      return;
    }
    if (parsed.data.id !== req.params.id) {
      res.status(400).json({ error: "Идентификатор истории не совпадает." });
      return;
    }
    if (req.body.version !== row.version) {
      res
        .status(409)
        .json({
          error:
            "История изменена в другом окне. Скопируйте свои правки и откройте редактор заново.",
        });
      return;
    }
    const errors = validateQuest(parsed.data);
    if (errors.length) {
      res.status(400).json({ error: errors.join("\n") });
      return;
    }
    db.prepare("UPDATE quests SET draft=?, version=version+1 WHERE id=?").run(
      JSON.stringify(parsed.data),
      row.id,
    );
    res.json(document(get(row.id)!));
  });
  app.post("/api/studio/quests/:id/publish", (req, res) => {
    const row = get(req.params.id);
    if (!row) {
      res.status(404).json({ error: "История не найдена." });
      return;
    }
    if (req.body?.version !== row.version) {
      res
        .status(409)
        .json({ error: "Сначала сохраните актуальную версию истории." });
      return;
    }
    const errors = validateQuest(JSON.parse(row.draft), true);
    if (errors.length) {
      res.status(400).json({ error: errors.join("\n") });
      return;
    }
    db.prepare("UPDATE quests SET published=draft WHERE id=?").run(row.id);
    res.json(document(get(row.id)!));
  });
  app.use(
    (
      error: Error & { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status =
        error.status && error.status >= 400 && error.status < 500
          ? error.status
          : 500;
      res
        .status(status)
        .json({
          error:
            status === 413
              ? "История слишком большая (максимум 1 МБ)."
              : status < 500
                ? "Некорректный запрос."
                : "Не удалось обработать запрос.",
        });
    },
  );
  return { app, close: () => db.close() };
}
