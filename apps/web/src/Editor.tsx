import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Check,
  Flag,
  GitBranch,
  MessageCircle,
  Play,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  questSchema,
  validateQuest,
  type Quest,
  type StoryNode,
} from "@questspace/story";
import { api, type Document } from "./api";
import { Chat } from "./Chat";

type Dialogue = Node<{ node: StoryNode; start: boolean }, "dialogue">;
function DialogueNode({ data, selected }: NodeProps<Dialogue>) {
  const { node, start } = data;
  return (
    <div
      className={`dialogue-node ${selected ? "selected" : ""} ${node.ending ? "final-node" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="node-title">
        <span>
          {node.ending ? <Flag size={14} /> : <MessageCircle size={14} />}
        </span>
        {node.label || "Сообщение"}
        {start && <span className="start-tag">СТАРТ</span>}
      </div>
      <div className="node-messages">
        {node.messages[0] || "Напишите сообщение…"}
        {node.messages.length > 1 && (
          <span>+{node.messages.length - 1} сообщ.</span>
        )}
      </div>
      {node.choices.map((choice, i) => (
        <div className="node-choice" key={choice.id}>
          <span className="choice-number">{i + 1}</span>
          <span>{choice.text || "Вариант ответа"}</span>
          <Handle type="source" position={Position.Right} id={choice.id} />
        </div>
      ))}
      {node.ending && <div className="node-ending">ФИНАЛ ИСТОРИИ</div>}
    </div>
  );
}
const nodeTypes = { dialogue: DialogueNode };

export function Editor({
  id,
  onBack,
  onDirty,
}: {
  id: string;
  onBack: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [settings, setSettings] = useState(false);
  const dirty = !!doc && JSON.stringify(quest) !== JSON.stringify(doc.quest);
  const selectedNode = quest?.nodes.find((n) => n.id === selected);
  useEffect(() => {
    let live = true;
    api<Document>(`/studio/quests/${encodeURIComponent(id)}`)
      .then((data) => {
        if (!live) return;
        setDoc(data);
        setQuest(data.quest);
        setSelected(data.quest.startNodeId);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const [nodes, setNodes] = useNodesState<Dialogue>([]);
  useEffect(() => {
    if (!quest) return;
    setNodes((previous) =>
      quest.nodes.map((node) => ({
        ...previous.find((n) => n.id === node.id),
        id: node.id,
        type: "dialogue",
        position: node.position,
        selected: selected === node.id,
        deletable: false,
        data: { node, start: node.id === quest.startNodeId },
      })),
    );
  }, [quest, selected, setNodes]);
  const edges = useMemo<Edge[]>(
    () =>
      quest?.nodes.flatMap((node) =>
        node.choices
          .filter((c) => c.targetId)
          .map((c) => ({
            id: `${node.id}:${c.id}`,
            source: node.id,
            sourceHandle: c.id,
            target: c.targetId!,
            type: "smoothstep",
            animated: false,
            style: { stroke: "#7cba95", strokeWidth: 2 },
          })),
      ) ?? [],
    [quest],
  );

  function patchNode(patch: Partial<StoryNode>) {
    setQuest(
      (old) =>
        old && {
          ...old,
          nodes: old.nodes.map((n) =>
            n.id === selected ? { ...n, ...patch } : n,
          ),
        },
    );
    setNotice("");
  }
  const onNodesChange = useCallback(
    (changes: NodeChange<Dialogue>[]) => {
      setNodes((previous) => applyNodeChanges(changes, previous));
      if (!changes.some((c) => c.type === "position" && c.position)) return;
      setQuest(
        (old) =>
          old && {
            ...old,
            nodes: old.nodes.map((n) => {
              const position = changes.find(
                (c) => c.type === "position" && c.id === n.id,
              );
              return position?.type === "position" && position.position
                ? { ...n, position: position.position }
                : n;
            }),
          },
      );
    },
    [setNodes],
  );
  const connect = useCallback((connection: Connection) => {
    if (!connection.sourceHandle || !connection.target) return;
    setQuest(
      (old) =>
        old && {
          ...old,
          nodes: old.nodes.map((n) =>
            n.id === connection.source
              ? {
                  ...n,
                  choices: n.choices.map((c) =>
                    c.id === connection.sourceHandle
                      ? { ...c, targetId: connection.target }
                      : c,
                  ),
                }
              : n,
          ),
        },
    );
  }, []);
  async function save(): Promise<Document | null> {
    if (!quest || !doc) return null;
    const parsed = questSchema.safeParse(quest);
    if (!parsed.success) {
      setError("Заполните название, имя персонажа, сообщения и ответы.");
      return null;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await api<Document>(`/studio/quests/${id}`, "PUT", {
        quest,
        version: doc.version,
      });
      setDoc(data);
      setQuest(data.quest);
      setNotice("Черновик сохранён");
      return data;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }
  async function publish() {
    if (!quest || !doc) return;
    const parsed = questSchema.safeParse(quest);
    if (!parsed.success) {
      setError("Заполните обязательные поля истории.");
      return;
    }
    const issues = validateQuest(parsed.data, true);
    if (issues.length) {
      setError(issues.join("\n"));
      return;
    }
    const latest = dirty ? await save() : doc;
    if (!latest) return;
    setSaving(true);
    setError("");
    try {
      const data = await api<Document>(`/studio/quests/${id}/publish`, "POST", {
        version: latest.version,
      });
      setDoc(data);
      setQuest(data.quest);
      setNotice("История опубликована и доступна в каталоге");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function addNode() {
    const nodeId = crypto.randomUUID();
    setQuest(
      (old) =>
        old && {
          ...old,
          nodes: [
            ...old.nodes,
            {
              id: nodeId,
              label: `Сообщение ${old.nodes.length + 1}`,
              messages: ["Новое сообщение персонажа"],
              choices: [],
              ending: false,
              position: {
                x: (selectedNode?.position.x ?? 50) + 350,
                y: (selectedNode?.position.y ?? 50) + 180,
              },
            },
          ],
        },
    );
    setSelected(nodeId);
    setNotice("");
  }
  function removeNode() {
    if (
      !quest ||
      selected === quest.startNodeId ||
      !window.confirm("Удалить блок и все переходы к нему?")
    )
      return;
    setQuest(
      (old) =>
        old && {
          ...old,
          nodes: old.nodes
            .filter((n) => n.id !== selected)
            .map((n) => ({
              ...n,
              choices: n.choices.map((c) =>
                c.targetId === selected ? { ...c, targetId: null } : c,
              ),
            })),
        },
    );
    setSelected(quest.startNodeId);
  }
  if (!quest || !doc)
    return (
      <div className="error-state">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="secondary" onClick={onBack}>
              Назад
            </button>
          </>
        ) : (
          "Открываем мастерскую…"
        )}
      </div>
    );
  return (
    <div className="editor-shell">
      <header className="editor-header">
        <button
          className="icon-button"
          aria-label="В мои истории"
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="editor-brand">
          <GitBranch size={23} />
          <div>
            <strong>{quest.title}</strong>
            <span>
              {dirty
                ? "Есть несохранённые изменения"
                : doc.published
                  ? doc.hasChanges
                    ? "Черновик с изменениями"
                    : "Опубликованная история"
                  : "Черновик"}
            </span>
          </div>
        </div>
        <div className="editor-actions">
          <button
            className="secondary"
            onClick={() => setSettings((s) => !s)}
            disabled={saving}
          >
            Об истории
          </button>
          <button
            className="secondary"
            onClick={() => {
              const parsed = questSchema.safeParse(quest);
              if (!parsed.success) {
                setError("Заполните сообщения и ответы перед просмотром.");
                return;
              }
              setPreview(true);
            }}
            disabled={saving}
          >
            <Play size={15} />
            Предпросмотр
          </button>
          <button
            className="secondary"
            onClick={save}
            disabled={saving || !dirty}
          >
            <Save size={15} />
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
          <button className="primary" onClick={publish} disabled={saving}>
            <Send size={15} />
            Опубликовать
          </button>
        </div>
      </header>
      {(error || notice) && (
        <div
          className={`editor-notice ${error ? "is-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <span>{error || notice}</span>
          <button
            className="icon-button"
            aria-label="Закрыть уведомление"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="editor-body">
        <section className="graph-area" aria-label="Карта истории">
          <div className="graph-toolbar">
            <span className="eyebrow">
              КАРТА ИСТОРИИ{" "}
              <span className="muted">/ {quest.nodes.length} БЛОКОВ</span>
            </span>
            <button
              className="secondary"
              onClick={addNode}
              disabled={saving || quest.nodes.length >= 300}
            >
              <Plus size={16} />
              Добавить блок
            </button>
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onConnect={connect}
            onNodeClick={(_, node) => {
              setSelected(node.id);
              setSettings(false);
            }}
            onEdgesDelete={(deleted) =>
              setQuest(
                (old) =>
                  old && {
                    ...old,
                    nodes: old.nodes.map((n) => ({
                      ...n,
                      choices: n.choices.map((c) =>
                        deleted.some(
                          (e) => e.source === n.id && e.sourceHandle === c.id,
                        )
                          ? { ...c, targetId: null }
                          : c,
                      ),
                    })),
                  },
              )
            }
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.15}
            maxZoom={1.5}
            colorMode="dark"
            nodesDraggable={!saving}
            nodesConnectable={!saving}
            deleteKeyCode={saving ? null : ["Backspace", "Delete"]}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="#36414e"
              gap={22}
            />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => (n.id === selected ? "#b9f0c2" : "#36414e")}
            />
          </ReactFlow>
          <div className="graph-hint">
            <GitBranch size={15} />
            Потяните от точки ответа к следующему блоку
          </div>
        </section>
        <aside className="inspector">
          <fieldset disabled={saving}>
            {settings ? (
              <>
                <span className="eyebrow">ОБ ИСТОРИИ</span>
                <h2>Первое впечатление</h2>
                <label>
                  Название
                  <input
                    value={quest.title}
                    maxLength={120}
                    onChange={(e) =>
                      setQuest({ ...quest, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Описание
                  <textarea
                    rows={4}
                    maxLength={500}
                    value={quest.description}
                    onChange={(e) =>
                      setQuest({ ...quest, description: e.target.value })
                    }
                  />
                </label>
                <label>
                  Автор
                  <input
                    maxLength={80}
                    value={quest.author}
                    onChange={(e) =>
                      setQuest({ ...quest, author: e.target.value })
                    }
                  />
                </label>
                <label>
                  Имя персонажа
                  <input
                    maxLength={80}
                    value={quest.character}
                    onChange={(e) =>
                      setQuest({ ...quest, character: e.target.value })
                    }
                  />
                </label>
                <label>
                  Жанр
                  <input
                    maxLength={40}
                    value={quest.genre}
                    onChange={(e) =>
                      setQuest({ ...quest, genre: e.target.value })
                    }
                  />
                </label>
                <p className="inspector-tip">
                  Изменения появятся в каталоге после публикации.
                </p>
              </>
            ) : (
              selectedNode && (
                <>
                  <span className="eyebrow">РЕДАКТОР БЛОКА</span>
                  <h2>
                    {selectedNode.ending
                      ? "Финал истории"
                      : "Сообщение персонажа"}
                  </h2>
                  <label>
                    Название блока
                    <input
                      value={selectedNode.label}
                      maxLength={80}
                      onChange={(e) => patchNode({ label: e.target.value })}
                    />
                  </label>
                  <div className="field-heading">
                    <span>Сообщения</span>
                    <span className="muted">
                      {selectedNode.messages.length}/30
                    </span>
                  </div>
                  {selectedNode.messages.map((message, i) => (
                    <div className="message-editor" key={i}>
                      <textarea
                        aria-label={`Сообщение ${i + 1}`}
                        rows={3}
                        value={message}
                        maxLength={4000}
                        onChange={(e) =>
                          patchNode({
                            messages: selectedNode.messages.map((m, j) =>
                              i === j ? e.target.value : m,
                            ),
                          })
                        }
                      />
                      {selectedNode.messages.length > 1 && (
                        <button
                          className="icon-button"
                          aria-label={`Удалить сообщение ${i + 1}`}
                          onClick={() =>
                            patchNode({
                              messages: selectedNode.messages.filter(
                                (_, j) => i !== j,
                              ),
                            })
                          }
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    className="text-button"
                    disabled={selectedNode.messages.length >= 30}
                    onClick={() =>
                      patchNode({
                        messages: [...selectedNode.messages, "Новое сообщение"],
                      })
                    }
                  >
                    <Plus size={15} />
                    Ещё сообщение
                  </button>
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={selectedNode.ending}
                      onChange={(e) => {
                        if (
                          e.target.checked &&
                          selectedNode.choices.length &&
                          !window.confirm(
                            "Сделать блок финалом? Его варианты ответа будут удалены.",
                          )
                        )
                          return;
                        patchNode({
                          ending: e.target.checked,
                          choices: e.target.checked ? [] : selectedNode.choices,
                        });
                      }}
                    />
                    <Flag size={16} />
                    Это финал истории
                  </label>
                  {!selectedNode.ending && (
                    <>
                      <div className="field-heading">
                        <span>Ответы игрока</span>
                        <span className="muted">
                          {selectedNode.choices.length}/6
                        </span>
                      </div>
                      {selectedNode.choices.map((choice, i) => (
                        <div className="choice-editor" key={choice.id}>
                          <div>
                            <span className="choice-number">{i + 1}</span>
                            <input
                              aria-label={`Ответ ${i + 1}`}
                              maxLength={300}
                              value={choice.text}
                              onChange={(e) =>
                                patchNode({
                                  choices: selectedNode.choices.map((c) =>
                                    c.id === choice.id
                                      ? { ...c, text: e.target.value }
                                      : c,
                                  ),
                                })
                              }
                            />
                            <button
                              className="icon-button"
                              aria-label={`Удалить ответ ${i + 1}`}
                              onClick={() =>
                                patchNode({
                                  choices: selectedNode.choices.filter(
                                    (c) => c.id !== choice.id,
                                  ),
                                })
                              }
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <label className="target-label">
                            Следующий блок
                            <select
                              aria-label={`Переход для ответа ${i + 1}`}
                              value={choice.targetId ?? ""}
                              onChange={(e) =>
                                patchNode({
                                  choices: selectedNode.choices.map((c) =>
                                    c.id === choice.id
                                      ? {
                                          ...c,
                                          targetId: e.target.value || null,
                                        }
                                      : c,
                                  ),
                                })
                              }
                            >
                              <option value="">Не соединён</option>
                              {quest.nodes.map((n) => (
                                <option value={n.id} key={n.id}>
                                  {n.label || "Без названия"}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ))}
                      <button
                        className="text-button"
                        disabled={selectedNode.choices.length >= 6}
                        onClick={() =>
                          patchNode({
                            choices: [
                              ...selectedNode.choices,
                              {
                                id: crypto.randomUUID(),
                                text: "Новый ответ",
                                targetId: null,
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={15} />
                        Добавить ответ
                      </button>
                    </>
                  )}
                  <div className="node-settings">
                    {quest.startNodeId !== selectedNode.id ? (
                      <button
                        className="secondary"
                        onClick={() =>
                          setQuest({ ...quest, startNodeId: selectedNode.id })
                        }
                      >
                        <Play size={14} />
                        Начать историю здесь
                      </button>
                    ) : (
                      <span className="start-label">
                        <Check size={14} />
                        История начинается здесь
                      </span>
                    )}
                    <button
                      className="danger-button"
                      disabled={selectedNode.id === quest.startNodeId}
                      onClick={removeNode}
                    >
                      <Trash2 size={14} />
                      Удалить блок
                    </button>
                  </div>
                </>
              )
            )}
          </fieldset>
        </aside>
      </div>
      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(false)}>
          <div
            className="preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Предпросмотр истории"
            onClick={(e) => e.stopPropagation()}
          >
            <Chat
              key="preview"
              quest={quest}
              revision="preview"
              preview
              onBack={() => setPreview(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
