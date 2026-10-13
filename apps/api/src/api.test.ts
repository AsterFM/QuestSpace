import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.ts";
import type { Quest } from "@questspace/story";

type Doc = { quest: Quest; version: number; published: boolean };
async function runApi(filename = ":memory:") {
  const { app, close } = createApp(filename);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(url + path, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    return { status: response.status, body: await response.json() };
  };
  return {
    request,
    stop: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      close();
    },
  };
}

test("draft creation, revision conflict, publication and snapshot isolation", async (t) => {
  const { request, stop } = await runApi();
  t.after(stop);
  const created = await request("/studio/quests", "POST", {});
  assert.equal(created.status, 201);
  let doc = created.body as Doc;
  const id = doc.quest.id;
  assert.equal((await request(`/quests/${id}`)).status, 404);
  doc.quest.title = "Новая публикация";
  const saved = await request(`/studio/quests/${id}`, "PUT", doc);
  assert.equal(saved.status, 200);
  assert.equal((await request(`/studio/quests/${id}`, "PUT", doc)).status, 409);
  doc = saved.body;
  assert.equal(
    (
      await request(`/studio/quests/${id}/publish`, "POST", {
        version: doc.version - 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/studio/quests/${id}/publish`, "POST", {
        version: doc.version,
      })
    ).status,
    200,
  );
  const published = await request(`/quests/${id}`);
  assert.equal(published.body.quest.title, "Новая публикация");
  assert.match(published.body.revision, /^[a-f0-9]{64}$/);
  doc.quest.title = "Неопубликованная правка";
  doc = (await request(`/studio/quests/${id}`, "PUT", doc)).body;
  assert.equal(
    (await request(`/quests/${id}`)).body.quest.title,
    "Новая публикация",
  );
  doc.quest.nodes[0].choices[0].targetId = null;
  doc = (await request(`/studio/quests/${id}`, "PUT", doc)).body;
  const failed = await request(`/studio/quests/${id}/publish`, "POST", {
    version: doc.version,
  });
  assert.equal(failed.status, 400);
  assert.match(failed.body.error, /соедините/);
  assert.equal(
    (await request(`/quests/${id}`)).body.revision,
    published.body.revision,
  );
});
test("server validates schema, route identity and dangling transitions", async (t) => {
  const { request, stop } = await runApi();
  t.after(stop);
  const doc: Doc = (await request("/studio/quests", "POST", {})).body;
  const id = doc.quest.id;
  assert.equal((await request(`/studio/quests/${id}`, "PUT", {})).status, 400);
  const badId = structuredClone(doc);
  badId.quest.id = "other";
  assert.equal(
    (await request(`/studio/quests/${id}`, "PUT", badId)).status,
    400,
  );
  doc.quest.nodes[0].choices[0].targetId = "missing";
  assert.equal((await request(`/studio/quests/${id}`, "PUT", doc)).status, 400);
  assert.equal((await request("/quests/nonexistent")).status, 404);
});
test("SQLite retains author edits and published quests across a restart", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "questspace-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, "test.sqlite");
  const first = await runApi(filename);
  const doc: Doc = (await first.request("/studio/quests", "POST", {})).body;
  await first.request(`/studio/quests/${doc.quest.id}/publish`, "POST", {
    version: doc.version,
  });
  await first.stop();
  const second = await runApi(filename);
  t.after(second.stop);
  assert.equal(
    (await second.request(`/quests/${doc.quest.id}`)).body.quest.id,
    doc.quest.id,
  );
  assert.equal(
    (await second.request(`/studio/quests/${doc.quest.id}`)).body.version,
    1,
  );
});
