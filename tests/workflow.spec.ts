import { test, expect } from "@playwright/test";

test("a reader reaches one ending, resumes and can replay another branch", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Начать переписку" }).first().click();
  await page
    .getByRole("button", { name: "Я здесь. Что ты видишь вокруг?" })
    .click();
  await page
    .getByRole("button", { name: "Иди в щитовую. Восстановим питание." })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Включи аварийный выход." }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Включи аварийный выход." }).click();
  await expect(
    page.getByRole("heading", { name: "Аварийный выход" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Начать заново", exact: true })
    .click();
  await page.getByRole("button", { name: "Попробуй вызвать помощь." }).click();
  await page
    .getByRole("button", { name: "Доверься голосу. Иди на крышу." })
    .click();
  await expect(
    page.getByRole("heading", { name: "Крыша", exact: true }),
  ).toBeVisible();
});
test("an author edits graph branches, previews, saves and publishes a playable quest", async ({
  page,
}) => {
  await page.goto("/#studio");
  await page
    .getByRole("button", { name: "Новая история", exact: true })
    .click();
  await page.getByRole("button", { name: "Об истории", exact: true }).click();
  const title = `Письмо из будущего ${Date.now()}`;
  await page.getByLabel("Название", { exact: true }).fill(title);
  await page.getByLabel("Имя персонажа").fill("Алекс");
  await page.getByRole("button", { name: "Об истории", exact: true }).click();
  await page
    .getByLabel("Сообщение 1", { exact: true })
    .fill("Я пишу тебе из завтрашнего дня.");
  await page
    .getByRole("button", { name: "Добавить блок", exact: true })
    .click();
  await page.getByLabel("Название блока").fill("Другой финал");
  await page
    .getByLabel("Сообщение 1", { exact: true })
    .fill("Будущее изменилось. Спасибо.");
  await page.getByRole("checkbox", { name: "Это финал истории" }).check();
  await page
    .locator(".react-flow__node")
    .filter({ hasText: "Первое сообщение" })
    .click();
  await page
    .getByRole("button", { name: "Добавить ответ", exact: true })
    .click();
  await page
    .getByLabel("Ответ 2", { exact: true })
    .fill("Давай изменим будущее.");
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("соедините");
  await page.getByRole("button", { name: "Закрыть уведомление" }).click();
  const source = await page.locator('.react-flow__node[data-id="start"] .react-flow__handle.source').nth(1).boundingBox();
  const target = await page.locator('.react-flow__node').filter({ hasText: 'Другой финал' }).locator('.react-flow__handle.target').boundingBox();
  expect(source).not.toBeNull(); expect(target).not.toBeNull();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByLabel('Переход для ответа 2')).toHaveValue(/.+/);
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await page.getByRole("button", { name: "Предпросмотр", exact: true }).click();
  await page.getByRole("button", { name: "Давай изменим будущее." }).click();
  await expect(
    page.getByRole("heading", { name: "Другой финал", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть предпросмотр" }).click();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Черновик сохранён");
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("доступна в каталоге");
  await page.getByRole("button", { name: "В мои истории" }).click();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  const card = page.locator(".quest-card").filter({ hasText: title });
  await card.getByRole("button", { name: "Начать переписку" }).click();
  await page.getByRole("button", { name: "Давай изменим будущее." }).click();
  await expect(
    page.getByRole("heading", { name: "Другой финал", exact: true }),
  ).toBeVisible();
});
test("catalog and chat fit a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Кто-то ждёт вашего ответа." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.goto("/#play/last-signal");
  await expect(
    page.getByRole("button", { name: "Я здесь. Что ты видишь вокруг?" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("Expo client loads the same catalog, follows choices and restores progress", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:8081");
  await page
    .getByRole("button", {
      name: "Начать переписку: Последний сигнал",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Я здесь. Что ты видишь вокруг? ↗" })
    .click();
  await page
    .getByRole("button", { name: "Иди в щитовую. Восстановим питание. ↗" })
    .click();
  await page.reload();
  await page
    .getByRole("button", {
      name: "Начать переписку: Последний сигнал",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Включи аварийный выход. ↗" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Включи аварийный выход. ↗" })
    .click();
  await expect(
    page.getByText("ПЕРЕПИСКА ЗАВЕРШЕНА", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Аварийный выход", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
