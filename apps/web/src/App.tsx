import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  BookOpen,
  GitBranch,
  MessageCircle,
  Plus,
  Radio,
  Sparkles,
} from "lucide-react";
import { type Quest, type QuestSummary } from "@questspace/story";
import { api } from "./api";
import { Chat } from "./Chat";
import { Editor } from "./Editor";

type StudioSummary = QuestSummary & { published: boolean; hasChanges: boolean };
export function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || "catalog");
  const [items, setItems] = useState<StudioSummary[]>([]);
  const [story, setStory] = useState<{ quest: Quest; revision: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const dirty = useRef(false);
  const activeRoute = useRef(route);
  const studio = route === "studio";
  function navigate(next: string) {
    location.hash = next;
  }

  useEffect(() => {
    const change = () => {
      const next = location.hash.slice(1) || "catalog";
      if (next === activeRoute.current) return;
      if (
        dirty.current &&
        !window.confirm(
          "У вас есть несохранённые изменения. Выйти из редактора?",
        )
      ) {
        history.replaceState(null, "", `#${activeRoute.current}`);
        return;
      }
      dirty.current = false;
      activeRoute.current = next;
      setRoute(next);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    let live = true;
    setError("");
    setLoading(true);
    setStory(null);
    const operation = route.startsWith("play/")
      ? api<{ quest: Quest; revision: string }>(
          `/quests/${encodeURIComponent(route.slice(5))}`,
        ).then((data) => {
          if (live) setStory(data);
        })
      : route.startsWith("edit/")
        ? Promise.resolve()
        : api<StudioSummary[]>(studio ? "/studio/quests" : "/quests").then(
            (data) => {
              if (live) setItems(data);
            },
          );
    operation
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [route, studio]);
  async function create() {
    setCreating(true);
    setError("");
    try {
      const doc = await api<{ quest: Quest }>("/studio/quests", "POST", {});
      navigate(`edit/${doc.quest.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }
  if (route.startsWith("edit/"))
    return (
      <Editor
        key={route}
        id={route.slice(5)}
        onBack={() => navigate("studio")}
        onDirty={(value) => {
          dirty.current = value;
        }}
      />
    );
  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => navigate("catalog")}>
          <span className="brand-icon">
            <MessageCircle size={23} />
          </span>
          quest<span>space</span>
          <span className="alpha">ALPHA</span>
        </button>
        <nav aria-label="Главная навигация">
          <button
            className={!studio ? "active" : ""}
            onClick={() => navigate("catalog")}
          >
            <BookOpen size={16} />
            Каталог
          </button>
          <button
            className={studio ? "active" : ""}
            onClick={() => navigate("studio")}
          >
            <GitBranch size={16} />
            Мои истории
          </button>
        </nav>
        <button className="create-link" onClick={create} disabled={creating}>
          <Plus size={17} />
          Создать историю
        </button>
      </header>
      <main>
        {error ? (
          <div className="error-state" role="alert">
            <h2>Не удалось загрузить историю</h2>
            <p>{error}</p>
            <button className="secondary" onClick={() => location.reload()}>
              Повторить
            </button>
          </div>
        ) : loading ? (
          <p className="loading">Устанавливаем связь…</p>
        ) : story ? (
          <Chat
            key={`${story.quest.id}:${story.revision}`}
            {...story}
            onBack={() => navigate("catalog")}
          />
        ) : (
          <>
            <section className="hero">
              <div>
                <div className="eyebrow hero-tag">
                  <span className="live-dot" />
                  {studio ? "АВТОРСКАЯ МАСТЕРСКАЯ" : "ИНТЕРАКТИВНЫЕ ИСТОРИИ"}
                </div>
                <h1>
                  {studio ? (
                    <>
                      Любая история
                      <br />
                      начинается <em>с вас.</em>
                    </>
                  ) : (
                    <>
                      Кто-то ждёт
                      <br />
                      <em>вашего ответа.</em>
                    </>
                  )}
                </h1>
                <p>
                  {studio
                    ? "Соединяйте сообщения, придумывайте развилки и создавайте миры, в которых каждое слово имеет значение."
                    : "Один разговор. Десятки возможных судеб. Выбирайте реплики и меняйте ход истории — сообщение за сообщением."}
                </p>
                <button
                  className="primary"
                  onClick={
                    studio
                      ? create
                      : () =>
                          document
                            .getElementById("stories")
                            ?.scrollIntoView({ behavior: "smooth" })
                  }
                  disabled={creating}
                >
                  {studio ? (
                    <>
                      <Plus size={17} />
                      Новая история
                    </>
                  ) : (
                    <>
                      Найти свою историю
                      <ArrowDown size={17} />
                    </>
                  )}
                </button>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="art-cross cross-one">+</div>
                <div className="art-cross cross-two">+</div>
                <div className="art-coordinate">
                  CONNECTING STORIES
                  <br />
                  EST. 2026 / QS—01
                </div>
                <div className="floating-message first">
                  <div className="message-meta">
                    <span className="small-avatar">Н</span>НИКА
                    <span className="small-dot" />
                  </div>
                  <p>Есть кто-нибудь на связи?</p>
                  <span className="art-time">23:47</span>
                </div>
                <div className="floating-message second">
                  <p>Я здесь. Что случилось?</p>
                  <span className="art-time">23:48 ✓✓</span>
                </div>
                <div className="art-caption">
                  <Radio size={15} />
                  <span>ВАШ ВЫБОР МЕНЯЕТ ИСТОРИЮ</span>
                </div>
              </div>
            </section>
            <section className="catalog-section" id="stories">
              <div className="section-title">
                <div>
                  <span className="eyebrow">
                    {studio
                      ? "СОЗДАВАЙТЕ И ДЕЛИТЕСЬ"
                      : "ВЫБЕРИТЕ ПЕРВЫЙ РАЗГОВОР"}
                  </span>
                  <h2>
                    {studio ? "Мои истории" : "На другой стороне экрана"}
                    <span className="count">
                      {items.length.toString().padStart(2, "0")}
                    </span>
                  </h2>
                </div>
                <span className="catalog-note">
                  {studio
                    ? "Черновики и опубликованные истории"
                    : "Только текст. Всё остальное — воображение."}
                </span>
              </div>
              <div className="quest-grid">
                {items.map((quest, i) => (
                  <article className="quest-card" key={quest.id}>
                    <div className={`quest-cover color-${i % 3}`}>
                      <span className="cover-index">
                        QS / {String(i + 1).padStart(3, "0")}
                      </span>
                      <div className="signal-lines">
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                      <MessageCircle
                        className="cover-icon"
                        size={65}
                        strokeWidth={1}
                      />
                      <span className="cover-caption">
                        {quest.character}
                        <span className="live-dot" />
                      </span>
                      <span className="genre">{quest.genre}</span>
                    </div>
                    <div className="quest-info">
                      <div className="card-heading">
                        <h3>{quest.title}</h3>
                        <ArrowUpRight size={22} />
                      </div>
                      <p>{quest.description}</p>
                      <div className="card-footer">
                        <span>{quest.author}</span>
                        {studio && (
                          <span className="status">
                            {quest.published
                              ? quest.hasChanges
                                ? "Есть правки"
                                : "Опубликовано"
                              : "Черновик"}
                          </span>
                        )}
                      </div>
                      <button
                        className="card-action"
                        onClick={() =>
                          navigate(`${studio ? "edit" : "play"}/${quest.id}`)
                        }
                      >
                        {studio ? "Открыть редактор" : "Начать переписку"}
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                  </article>
                ))}
                {studio && (
                  <button
                    className="new-story-card"
                    onClick={create}
                    disabled={creating}
                  >
                    <span>
                      <Plus size={30} />
                    </span>
                    <h3>Ваша следующая история</h3>
                    <p>
                      Начните с одного сообщения.
                      <br />
                      Посмотрите, куда оно приведёт.
                    </p>
                  </button>
                )}
                {!studio && !items.length && (
                  <p className="muted">
                    Историй пока нет. Создайте первую в мастерской.
                  </p>
                )}
              </div>
            </section>
            {!studio && (
              <section className="author-banner">
                <div className="banner-icon">
                  <GitBranch size={30} />
                </div>
                <div>
                  <span className="eyebrow">ПО ДРУГУЮ СТОРОНУ ИСТОРИИ</span>
                  <h2>А что, если автор — вы?</h2>
                  <p>
                    Превратите идею в переписку. Редактор поможет связать всё
                    воедино.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => navigate("studio")}
                >
                  В авторскую мастерскую
                  <ArrowUpRight size={17} />
                </button>
              </section>
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>
          questspace <span className="muted">/ истории на связи</span>
        </span>
        <span>
          <Sparkles size={13} />У каждого выбора есть продолжение.
        </span>
      </footer>
    </div>
  );
}
