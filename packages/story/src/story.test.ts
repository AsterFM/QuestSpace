import { test } from "node:test";
import assert from "node:assert/strict";
import {
  demoQuest,
  freshQuest,
  play,
  questSchema,
  validateQuest,
} from "./index.ts";

test("demo parses and every branch can reach a valid ending", () => {
  assert.ok(questSchema.safeParse(demoQuest).success);
  assert.deepEqual(validateQuest(demoQuest, true), []);
  for (const [path, ending] of [
    [["ask", "power", "emergency"], "safe"],
    [["ask", "power", "main"], "dark"],
    [["help", "radio-roof"], "roof"],
  ] as const) {
    const state = play(demoQuest, [...path]);
    assert.equal(state.node.id, ending);
    assert.equal(state.node.ending, true);
    assert.equal(
      state.messages.filter((m) => m.role === "player").length,
      path.length,
    );
  }
});
test("replay stops at stale or forged choices and does not jump branches", () => {
  const state = play(demoQuest, ["ask", "not-a-choice", "radio-roof"]);
  assert.equal(state.node.id, "room");
  assert.deepEqual(state.choiceIds, ["ask"]);
  assert.equal(
    play(demoQuest, ["ask", "power", "emergency", "main"]).node.id,
    "safe",
  );
});
test("draft permits an unfinished connection; publication rejects it", () => {
  const quest = freshQuest("test");
  quest.nodes[0].choices[0].targetId = null;
  assert.deepEqual(validateQuest(quest), []);
  assert.ok(validateQuest(quest, true).some((e) => e.includes("соедините")));
});
test("missing target, duplicate IDs, unreachable nodes and dead ends are rejected", () => {
  const broken = freshQuest("broken");
  broken.nodes[0].choices[0].targetId = "missing";
  assert.ok(validateQuest(broken).some((e) => e.includes("удалённый")));
  const duplicate = freshQuest("duplicate");
  duplicate.nodes.push(structuredClone(duplicate.nodes[0]));
  assert.ok(validateQuest(duplicate).some((e) => e.includes("уникальные")));
  const detached = freshQuest("detached");
  detached.nodes.push({
    ...structuredClone(detached.nodes[1]),
    id: "unreachable",
  });
  assert.ok(
    validateQuest(detached, true).some((e) => e.includes("недоступен")),
  );
  const dead = freshQuest("dead");
  dead.nodes[1].ending = false;
  assert.ok(
    validateQuest(dead, true).some((e) => e.includes("добавьте ответы")),
  );
});
test("closed cycles are rejected; loops with an exit are allowed", () => {
  const quest = freshQuest("loop");
  quest.nodes[0].choices[0].targetId = "start";
  assert.ok(
    validateQuest(quest, true).some((e) => e.includes("нельзя попасть")),
  );
  quest.nodes[0].choices.push({ id: "exit", text: "Выйти", targetId: "end" });
  assert.deepEqual(validateQuest(quest, true), []);
});
test("schema rejects blank messages and non-finite coordinates", () => {
  const quest = freshQuest("invalid");
  quest.nodes[0].messages = ["  "];
  assert.equal(questSchema.safeParse(quest).success, false);
  quest.nodes[0].messages = ["Привет"];
  quest.nodes[0].position.x = Infinity;
  assert.equal(questSchema.safeParse(quest).success, false);
});
