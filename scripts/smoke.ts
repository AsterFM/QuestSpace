import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { questSchema, validateQuest, play, type QuestSummary } from '@questspace/story';

const api = 'http://127.0.0.1:3001';
const web = 'http://127.0.0.1:5173';
async function ready(url: string): Promise<Response> {
  const deadline = Date.now() + 30000;
  do {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return response;
    } catch { /* The development process may still be starting. */ }
    await setTimeout(500);
  } while (Date.now() < deadline);
  throw new Error(`Service did not become ready: ${url}`);
}
assert.equal((await (await ready(`${api}/api/health`)).json()).status, 'ok');
const catalog: QuestSummary[] = await (await ready(`${api}/api/quests`)).json();
assert.ok(catalog.length, 'The seeded catalog must include a published quest.');
const published = await (await ready(`${api}/api/quests/${encodeURIComponent(catalog[0].id)}`)).json();
const quest = questSchema.parse(published.quest);
assert.deepEqual(validateQuest(quest, true), []);
assert.match(published.revision, /^[a-f0-9]{64}$/);
const queue = [{ id: quest.startNodeId, path: [] as string[] }];
const visited = new Set<string>();
let endingPath: string[] | undefined;
while (queue.length) {
  const next = queue.shift()!;
  if (visited.has(next.id)) continue;
  visited.add(next.id);
  const node = quest.nodes.find(n => n.id === next.id)!;
  if (node.ending) { endingPath = next.path; break; }
  node.choices.forEach(c => { if (c.targetId) queue.push({ id: c.targetId, path: [...next.path, c.id] }); });
}
assert.ok(endingPath, 'The published story must have a reachable ending.');
assert.equal(play(quest, endingPath).node.ending, true);
const studio: QuestSummary[] = await (await ready(`${api}/api/studio/quests`)).json();
assert.ok(studio.some(q => q.id === quest.id));
assert.match(await (await ready(web)).text(), /id="root"/);
console.log('Smoke passed: API, catalog, published story, playable ending, studio and web entry.');
