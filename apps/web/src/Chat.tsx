import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  RotateCcw,
  Signal,
  Wifi,
} from "lucide-react";
import { play, type Progress, type Quest } from "@questspace/story";

function readProgress(key: string, quest: Quest, revision: string): string[] {
  try {
    const saved: Progress = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      saved?.questId === quest.id &&
      saved.revision === revision &&
      Array.isArray(saved.choiceIds) &&
      saved.choiceIds.length <= 1000 &&
      saved.choiceIds.every((c) => typeof c === "string")
    )
      return play(quest, saved.choiceIds).choiceIds;
  } catch {
    /* Fresh start if the device storage is unavailable or malformed. */
  }
  return [];
}

export function Chat({
  quest,
  revision,
  preview = false,
  onBack,
}: {
  quest: Quest;
  revision: string;
  preview?: boolean;
  onBack: () => void;
}) {
  const key = `questspace:progress:${quest.id}`;
  const [choices, setChoices] = useState<string[]>(() =>
    preview ? [] : readProgress(key, quest, revision),
  );
  const [visible, setVisible] = useState(() =>
    choices.length ? play(quest, choices).messages.length : 0,
  );
  const [storageError, setStorageError] = useState(false);
  const transcript = play(quest, choices);
  const bottom = useRef<HTMLDivElement>(null);
  const total = transcript.messages.length;
  const typing = visible < total;

  useEffect(() => {
    if (!preview) {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            questId: quest.id,
            revision,
            choiceIds: transcript.choiceIds,
          } satisfies Progress),
        );
      } catch {
        setStorageError(true);
      }
    }
  }, [choices, key, preview, quest.id, revision]);
  useEffect(() => {
    if (!typing) return;
    const next = transcript.messages[visible];
    const timeout = window.setTimeout(
      () => setVisible((v) => v + 1),
      next?.role === "player" ? 80 : 650,
    );
    return () => clearTimeout(timeout);
  }, [visible, total, typing]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [visible]);

  function restart() {
    setChoices([]);
    setVisible(0);
  }
  return (
    <div className={`chat-layout ${preview ? "preview-chat" : ""}`}>
      {!preview && (
        <aside className="story-context">
          <span className="eyebrow">
            НА ЛИНИИ · {quest.genre.toUpperCase()}
          </span>
          <h1>{quest.title}</h1>
          <p>{quest.description}</p>
          <div className="context-rule" />
          <span className="muted">Автор</span>
          <strong>{quest.author}</strong>
          <div className="context-note">
            <Signal size={20} />
            <p>
              У каждой реплики есть последствия.
              <br />
              Ваша история начинается с ответа.
            </p>
          </div>
        </aside>
      )}
      <section className="chat-phone" aria-label="Переписка с персонажем">
        <header className="chat-header">
          <button
            className="icon-button"
            aria-label={
              preview ? "Закрыть предпросмотр" : "Вернуться в каталог"
            }
            onClick={onBack}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="avatar">{quest.character.slice(0, 1)}</div>
          <div className="contact">
            <strong>{quest.character}</strong>
            <span>
              <i />
              на связи
            </span>
          </div>
          <Wifi size={18} className="muted" />
        </header>
        {preview && (
          <div className="preview-label">
            ПРЕДПРОСМОТР · прогресс не сохраняется
          </div>
        )}
        <div
          className="chat-messages"
          role="log"
          aria-live="polite"
          aria-label="Сообщения"
        >
          <div className="chat-date">НАЧАЛО ПЕРЕПИСКИ</div>
          {transcript.messages.slice(0, visible).map((m) => (
            <div key={m.id} className={`bubble ${m.role}`}>
              <p>{m.text}</p>
              {m.role === "player" && <Check size={13} />}
            </div>
          ))}
          {typing && (
            <div className="typing" aria-label="Персонаж печатает">
              <span />
              <span />
              <span />
            </div>
          )}
          {!typing && transcript.node.ending && (
            <div className="ending">
              <span className="eyebrow">ПЕРЕПИСКА ЗАВЕРШЕНА</span>
              <h3>{transcript.node.label}</h3>
              <p>Другой ответ может изменить всё.</p>
              <button className="secondary" onClick={restart}>
                <RotateCcw size={16} />
                Начать заново
              </button>
            </div>
          )}
          <div ref={bottom} />
        </div>
        <footer className="chat-replies">
          {storageError && (
            <p role="alert" className="storage-warning">
              Не удалось сохранить прогресс на этом устройстве.
            </p>
          )}
          {!transcript.node.ending && (
            <>
              <span className="eyebrow">
                {typing
                  ? `${quest.character.toUpperCase()} ПЕЧАТАЕТ…`
                  : "ВАШ ОТВЕТ"}
              </span>
              {transcript.node.choices.map((c) => (
                <button
                  className="reply"
                  key={c.id}
                  disabled={typing || !c.targetId || choices.length >= 1000}
                  onClick={() => setChoices((old) => [...old, c.id])}
                >
                  {c.text}
                  <ArrowUpRight size={17} />
                </button>
              ))}
              {!transcript.node.choices.length && !typing && (
                <p className="muted">В этом черновике ещё нет ответов.</p>
              )}
              {choices.length >= 1000 && (
                <p role="alert">Достигнут лимит шагов. Начните заново.</p>
              )}
            </>
          )}
          <button className="chat-reset" onClick={restart}>
            <RotateCcw size={12} />
            Сбросить прохождение
          </button>
        </footer>
      </section>
    </div>
  );
}
