import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";

const directory =
  process.env.DATA_DIR ??
  fileURLToPath(new URL("../../../.data", import.meta.url));
mkdirSync(directory, { recursive: true });
const { app, close } = createApp(resolve(directory, "questspace.sqlite"));
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3001);
const server = app.listen(port, host, () =>
  console.log(`QuestSpace API listening on ${host}:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      close();
      process.exit(0);
    }),
  );
