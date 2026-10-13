import type { Quest } from "@questspace/story";

export type Document = {
  quest: Quest;
  version: number;
  published: boolean;
  hasChanges: boolean;
};
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Не удалось связаться с сервером.");
  return data as T;
}
