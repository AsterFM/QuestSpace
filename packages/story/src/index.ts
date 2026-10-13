import { z } from "zod";

export const questSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(500),
  author: z.string().trim().min(1).max(80),
  character: z.string().trim().min(1).max(80),
  genre: z.string().max(40),
  startNodeId: z.string().min(1),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        label: z.string().max(80),
        messages: z.array(z.string().trim().min(1).max(4000)).min(1).max(30),
        choices: z
          .array(
            z.object({
              id: z.string().min(1).max(100),
              text: z.string().trim().min(1).max(300),
              targetId: z.string().nullable(),
            }),
          )
          .max(6),
        ending: z.boolean(),
        position: z.object({ x: z.number().finite(), y: z.number().finite() }),
      }),
    )
    .min(1)
    .max(300),
});

export type Quest = z.infer<typeof questSchema>;
export type StoryNode = Quest["nodes"][number];
export type Choice = StoryNode["choices"][number];
export type QuestSummary = Pick<
  Quest,
  "id" | "title" | "description" | "author" | "character" | "genre"
>;
export type Message = {
  id: string;
  role: "character" | "player";
  text: string;
};
export type Progress = {
  questId: string;
  revision: string;
  choiceIds: string[];
};

export function validateQuest(quest: Quest, publishing = false): string[] {
  const errors: string[] = [];
  const ids = new Set(quest.nodes.map((n) => n.id));
  if (ids.size !== quest.nodes.length)
    errors.push("У блоков должны быть уникальные идентификаторы.");
  if (!ids.has(quest.startNodeId))
    errors.push("Выберите существующий стартовый блок.");
  for (const node of quest.nodes) {
    const choiceIds = node.choices.map((c) => c.id);
    if (new Set(choiceIds).size !== choiceIds.length)
      errors.push(
        `«${node.label}»: ответы должны иметь уникальные идентификаторы.`,
      );
    if (node.ending && node.choices.length)
      errors.push(`«${node.label}»: у финала не должно быть ответов.`);
    if (publishing && !node.ending && !node.choices.length)
      errors.push(
        `«${node.label}»: добавьте ответы или отметьте блок как финал.`,
      );
    for (const choice of node.choices) {
      if (choice.targetId && !ids.has(choice.targetId))
        errors.push(`«${node.label}»: ответ ведёт в удалённый блок.`);
      if (publishing && !choice.targetId)
        errors.push(
          `«${node.label}»: соедините ответ «${choice.text}» со следующим блоком.`,
        );
    }
  }
  if (publishing && ids.has(quest.startNodeId)) {
    const visited = new Set<string>();
    const queue = [quest.startNodeId];
    while (queue.length) {
      const id = queue.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      quest.nodes
        .find((n) => n.id === id)
        ?.choices.forEach((c) => {
          if (c.targetId) queue.push(c.targetId);
        });
    }
    for (const node of quest.nodes) {
      if (!visited.has(node.id))
        errors.push(`«${node.label}»: блок недоступен из начала истории.`);
    }
    if (!quest.nodes.some((n) => n.ending && visited.has(n.id)))
      errors.push("Добавьте хотя бы один доступный финал.");
    // Every reachable branch must allow reaching an ending, including loops with an exit.
    const canEnd = new Set(
      quest.nodes.filter((n) => n.ending).map((n) => n.id),
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of quest.nodes) {
        if (
          !canEnd.has(node.id) &&
          node.choices.some((c) => c.targetId && canEnd.has(c.targetId))
        ) {
          canEnd.add(node.id);
          changed = true;
        }
      }
    }
    for (const node of quest.nodes) {
      if (visited.has(node.id) && !canEnd.has(node.id))
        errors.push(`«${node.label}»: из этой ветки нельзя попасть в финал.`);
    }
  }
  return [...new Set(errors)];
}

// Replay choices instead of trusting a persisted current node or transcript.
export function play(quest: Quest, choiceIds: string[]) {
  const start = quest.nodes.find((n) => n.id === quest.startNodeId);
  if (!start) throw new Error("Начало истории не найдено.");
  let node: StoryNode = start;
  const messages: Message[] = node.messages.map((text, i) => ({
    id: `0-${i}`,
    role: "character",
    text,
  }));
  const accepted: string[] = [];
  for (const id of choiceIds) {
    if (node.ending) break;
    const choice: Choice | undefined = node.choices.find((c) => c.id === id);
    const next: StoryNode | undefined = quest.nodes.find(
      (n) => n.id === choice?.targetId,
    );
    if (!choice || !next) break;
    messages.push({
      id: `${accepted.length}-reply`,
      role: "player",
      text: choice.text,
    });
    accepted.push(id);
    node = next;
    messages.push(
      ...node.messages.map((text, i) => ({
        id: `${accepted.length}-${i}`,
        role: "character" as const,
        text,
      })),
    );
  }
  return { node, messages, choiceIds: accepted };
}

export function summary(quest: Quest): QuestSummary {
  const { id, title, description, author, character, genre } = quest;
  return { id, title, description, author, character, genre };
}

export function freshQuest(id: string): Quest {
  return {
    id,
    title: "Новая история",
    description: "О чём ваша история?",
    author: "Автор",
    character: "Персонаж",
    genre: "Приключение",
    startNodeId: "start",
    nodes: [
      {
        id: "start",
        label: "Первое сообщение",
        messages: ["Привет. Ты меня слышишь?"],
        choices: [{ id: "reply", text: "Да. Что случилось?", targetId: "end" }],
        ending: false,
        position: { x: 70, y: 100 },
      },
      {
        id: "end",
        label: "Начало дружбы",
        messages: ["Хорошо, что ты здесь. Продолжение следует…"],
        choices: [],
        ending: true,
        position: { x: 430, y: 100 },
      },
    ],
  };
}

export const demoQuest: Quest = {
  id: "last-signal",
  title: "Последний сигнал",
  description:
    "Незнакомка пишет с заброшенной станции. Связь нестабильна. Только ваши решения помогут ей выбраться.",
  author: "QuestSpace",
  character: "Ника",
  genre: "Триллер",
  startNodeId: "start",
  nodes: [
    {
      id: "start",
      label: "Неизвестный контакт",
      position: { x: 50, y: 160 },
      ending: false,
      messages: [
        "Есть кто-нибудь на связи?",
        "Меня зовут Ника. Я на станции «Север-7». Тут погас свет, а дверь не открывается.",
        "Пожалуйста, не отключайся.",
      ],
      choices: [
        { id: "ask", text: "Я здесь. Что ты видишь вокруг?", targetId: "room" },
        { id: "help", text: "Попробуй вызвать помощь.", targetId: "radio" },
      ],
    },
    {
      id: "room",
      label: "Служебный коридор",
      position: { x: 400, y: 40 },
      ending: false,
      messages: [
        "На стене план станции. Справа — щитовая, слева — лестница на крышу.",
        "Из щитовой слышен стук. На крыше мигает красный огонь. Куда идти?",
      ],
      choices: [
        {
          id: "power",
          text: "Иди в щитовую. Восстановим питание.",
          targetId: "power",
        },
        {
          id: "roof",
          text: "Поднимайся на крышу. Там может быть связь.",
          targetId: "roof",
        },
      ],
    },
    {
      id: "radio",
      label: "Радиопередатчик",
      position: { x: 400, y: 360 },
      ending: false,
      messages: [
        "Телефон молчит. Но у охраны есть рация.",
        "Она шипит. Я слышу голос: «Не включайте основной рубильник».",
        "Теперь на плане вижу лестницу на крышу.",
      ],
      choices: [
        {
          id: "radio-roof",
          text: "Доверься голосу. Иди на крышу.",
          targetId: "roof",
        },
        {
          id: "radio-power",
          text: "Сначала проверь щитовую.",
          targetId: "power",
        },
      ],
    },
    {
      id: "power",
      label: "Щитовая",
      position: { x: 780, y: 40 },
      ending: false,
      messages: [
        "В щитовой никого. Стук — от вентилятора.",
        "На пульте два переключателя: «Основная сеть» и «Аварийный выход».",
      ],
      choices: [
        { id: "emergency", text: "Включи аварийный выход.", targetId: "safe" },
        { id: "main", text: "Включи основную сеть.", targetId: "dark" },
      ],
    },
    {
      id: "roof",
      label: "Крыша",
      position: { x: 780, y: 360 },
      ending: true,
      messages: [
        "Я на крыше. Красный огонь — маяк спасателей!",
        "Они увидели фонарик и идут ко мне. Я выбралась.",
        "Спасибо, что был рядом. Без тебя я бы не решилась.",
      ],
    },
    {
      id: "safe",
      label: "Аварийный выход",
      position: { x: 1140, y: -30 },
      ending: true,
      messages: [
        "Загорелись зелёные стрелки. Дверь открылась!",
        "Я на улице. Вижу машину спасателей.",
        "Ты помог мне выбраться. Я сохраню твой номер.",
      ],
    },
    {
      id: "dark",
      label: "Связь потеряна",
      position: { x: 1140, y: 220 },
      ending: true,
      messages: [
        "Включаю…",
        "Что-то не так. Свет слишком яркий. Двери снова заблокированы.",
        "Если получишь это сообщение, передай спасателям: станция «Север-7»…",
      ],
    },
  ].map((n) => ({ ...n, choices: "choices" in n ? n.choices! : [] })),
};
