import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  play,
  type Progress,
  type Quest,
  type QuestSummary,
} from "@questspace/story";

const baseUrl = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3001"
).replace(/\/$/, "");
async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}/api${path}`);
  if (!response.ok)
    throw new Error(
      "Не удалось загрузить историю. Проверьте подключение к серверу.",
    );
  return response.json();
}

export default function App() {
  const [catalog, setCatalog] = useState<QuestSummary[]>([]);
  const [story, setStory] = useState<{ quest: Quest; revision: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function loadCatalog() {
    setLoading(true);
    setError("");
    try {
      setCatalog(await get<QuestSummary[]>("/quests"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void loadCatalog();
  }, []);
  async function open(id: string) {
    setLoading(true);
    setError("");
    try {
      setStory(await get(`/quests/${encodeURIComponent(id)}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        {story ? (
          <Conversation
            key={`${story.quest.id}:${story.revision}`}
            {...story}
            onBack={() => {
              setStory(null);
              void loadCatalog();
            }}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.catalog}>
            <Text style={styles.brand}>
              quest<Text style={styles.brandLight}>space</Text>
            </Text>
            <Text style={styles.eyebrow}>ИНТЕРАКТИВНЫЕ ИСТОРИИ</Text>
            <Text style={styles.hero}>
              Кто-то ждёт{"\n"}
              <Text style={styles.green}>вашего ответа.</Text>
            </Text>
            <Text style={styles.description}>
              Выбирайте реплики и меняйте ход истории — сообщение за сообщением.
            </Text>
            <Text style={styles.section}>На другой стороне экрана</Text>
            {loading ? (
              <ActivityIndicator color="#b9f0c2" />
            ) : error ? (
              <View accessibilityRole="alert">
                <Text style={styles.error}>{error}</Text>
                <Pressable
                  onPress={loadCatalog}
                  style={styles.reply}
                  accessibilityRole="button"
                >
                  <Text style={styles.replyText}>Повторить</Text>
                </Pressable>
              </View>
            ) : (
              catalog.map((q) => (
                <Pressable
                  key={q.id}
                  style={styles.card}
                  onPress={() => open(q.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Начать переписку: ${q.title}`}
                >
                  <View style={styles.cover}>
                    <Text style={styles.eyebrow}>{q.genre.toUpperCase()}</Text>
                    <Text style={styles.coverCharacter}>
                      {q.character} · на связи
                    </Text>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle}>{q.title}</Text>
                    <Text style={styles.description}>{q.description}</Text>
                    <Text style={styles.author}>{q.author}</Text>
                    <Text style={styles.cardAction}>Начать переписку ↗</Text>
                  </View>
                </Pressable>
              ))
            )}
            {!loading && !error && !catalog.length && (
              <Text style={styles.description}>
                Историй пока нет. Опубликуйте первую в браузерном редакторе.
              </Text>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Conversation({
  quest,
  revision,
  onBack,
}: {
  quest: Quest;
  revision: string;
  onBack: () => void;
}) {
  const [choices, setChoices] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(0);
  const [storageError, setStorageError] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const writeQueue = useRef(Promise.resolve());
  const state = play(quest, choices);
  const key = `questspace:progress:${quest.id}`;
  const typing = visible < state.messages.length;
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(key)
      .then((value) => {
        if (!live) return;
        try {
          const progress: Progress = JSON.parse(value ?? "null");
          if (
            progress?.questId === quest.id &&
            progress.revision === revision &&
            Array.isArray(progress.choiceIds) &&
            progress.choiceIds.length <= 1000 &&
            progress.choiceIds.every((c) => typeof c === "string")
          ) {
            const replayed = play(quest, progress.choiceIds);
            setChoices(replayed.choiceIds);
            if (replayed.choiceIds.length) setVisible(replayed.messages.length);
          }
        } catch {
          /* Malformed saved progress starts a fresh story. */
        }
      })
      .catch(() => {
        if (live) setStorageError(true);
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [key, quest, revision]);
  useEffect(() => {
    if (!loaded) return;
    const value = JSON.stringify({
      questId: quest.id,
      revision,
      choiceIds: state.choiceIds,
    } satisfies Progress);
    // Serialize writes so a slower earlier write cannot overwrite a newer choice.
    writeQueue.current = writeQueue.current
      .then(() => AsyncStorage.setItem(key, value))
      .catch(() => {
        setStorageError(true);
      });
  }, [choices, loaded, key, quest.id, revision]);
  useEffect(() => {
    if (!loaded || !typing) return;
    const timeout = setTimeout(
      () => setVisible((v) => v + 1),
      state.messages[visible]?.role === "player" ? 80 : 650,
    );
    return () => clearTimeout(timeout);
  }, [loaded, typing, visible, state.messages.length]);
  function restart() {
    const reset = () => {
      setChoices([]);
      setVisible(0);
    };
    if (Platform.OS === "web") {
      if (window.confirm("Начать историю заново?")) reset();
    } else
      Alert.alert("Начать заново?", "Текущий прогресс будет сброшен.", [
        { text: "Отмена", style: "cancel" },
        { text: "Начать", onPress: reset },
      ]);
  }
  return (
    <View style={styles.conversation}>
      <View style={styles.chatHeader}>
        <Pressable
          onPress={onBack}
          accessibilityLabel="В каталог"
          accessibilityRole="button"
          style={styles.back}
        >
          <Text style={styles.green}>←</Text>
        </Pressable>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{quest.character.slice(0, 1)}</Text>
        </View>
        <View style={styles.contact}>
          <Text style={styles.contactName}>{quest.character}</Text>
          <Text style={styles.online}>● на связи</Text>
        </View>
        <Pressable
          onPress={restart}
          accessibilityLabel="Начать заново"
          accessibilityRole="button"
        >
          <Text style={styles.reset}>↻</Text>
        </Pressable>
      </View>
      {!loaded ? (
        <ActivityIndicator style={{ flex: 1 }} color="#b9f0c2" />
      ) : (
        <>
          <ScrollView
            ref={scroll}
            style={styles.messages}
            contentContainerStyle={styles.messageContent}
            onContentSizeChange={() =>
              scroll.current?.scrollToEnd({ animated: true })
            }
          >
            <Text style={styles.date}>НАЧАЛО ПЕРЕПИСКИ</Text>
            {state.messages.slice(0, visible).map((m) => (
              <View
                key={m.id}
                style={[
                  styles.bubble,
                  m.role === "player"
                    ? styles.playerBubble
                    : styles.characterBubble,
                ]}
              >
                <Text
                  style={[
                    styles.message,
                    m.role === "player" && styles.playerText,
                  ]}
                >
                  {m.text}
                </Text>
              </View>
            ))}
            {typing && (
              <View
                style={[styles.bubble, styles.characterBubble]}
                accessibilityLabel="Персонаж печатает"
              >
                <Text style={styles.typing}>•••</Text>
              </View>
            )}
            {!typing && state.node.ending && (
              <View style={styles.ending}>
                <Text style={styles.eyebrow}>ПЕРЕПИСКА ЗАВЕРШЕНА</Text>
                <Text style={styles.cardTitle}>{state.node.label}</Text>
                <Text style={styles.description}>
                  Другой ответ может изменить всё.
                </Text>
                <Pressable
                  style={styles.reply}
                  onPress={restart}
                  accessibilityRole="button"
                >
                  <Text style={styles.replyText}>Начать заново ↻</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
          {!state.node.ending && (
            <View style={styles.replies}>
              <Text style={styles.replyLabel}>
                {typing
                  ? `${quest.character.toUpperCase()} ПЕЧАТАЕТ…`
                  : "ВАШ ОТВЕТ"}
              </Text>
              {state.node.choices.map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  disabled={typing || !c.targetId || choices.length >= 1000}
                  style={[styles.reply, typing && { opacity: 0.35 }]}
                  onPress={() => setChoices((old) => [...old, c.id])}
                >
                  <Text style={styles.replyText}>{c.text} ↗</Text>
                </Pressable>
              ))}
              {choices.length >= 1000 && (
                <Text style={styles.error}>
                  Достигнут лимит шагов. Начните заново.
                </Text>
              )}
            </View>
          )}
          {storageError && (
            <Text style={styles.error}>
              Не удалось сохранить прогресс на устройстве.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#141c28" },
  catalog: {
    padding: 24,
    paddingBottom: 45,
    maxWidth: 680,
    width: "100%",
    alignSelf: "center",
  },
  brand: {
    fontSize: 27,
    color: "#e9eee9",
    fontWeight: "700",
    letterSpacing: -1,
    marginBottom: 42,
  },
  brandLight: { fontWeight: "300" },
  eyebrow: {
    fontSize: 9,
    color: "#b9f0c2",
    letterSpacing: 1.8,
    fontWeight: "600",
    marginBottom: 16,
  },
  hero: {
    fontSize: 43,
    color: "#e9eee9",
    letterSpacing: -1,
    fontWeight: "300",
    lineHeight: 49,
    marginBottom: 19,
  },
  green: { color: "#b9f0c2" },
  description: {
    fontSize: 13,
    color: "#8b96a3",
    lineHeight: 23,
    marginBottom: 17,
  },
  section: { fontSize: 22, color: "#e9eee9", marginTop: 25, marginBottom: 24 },
  card: {
    backgroundColor: "#18212e",
    borderColor: "#ffffff16",
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 23,
  },
  cover: {
    height: 140,
    backgroundColor: "#1b302f",
    padding: 22,
    justifyContent: "space-between",
  },
  coverCharacter: { fontSize: 22, color: "#b9f0c2", fontWeight: "300" },
  cardBody: { padding: 23 },
  cardTitle: {
    fontSize: 25,
    color: "#e9eee9",
    marginBottom: 14,
    fontWeight: "300",
  },
  author: { fontSize: 11, color: "#a1adb8", marginBottom: 19 },
  cardAction: {
    color: "#b9f0c2",
    fontSize: 13,
    paddingTop: 15,
    borderTopWidth: 1,
    borderColor: "#ffffff16",
  },
  error: { color: "#f1b6a7", padding: 15, fontSize: 12, lineHeight: 21 },
  conversation: {
    flex: 1,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    backgroundColor: "#1a2330",
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    gap: 12,
    backgroundColor: "#1e2937",
    borderBottomWidth: 1,
    borderColor: "#ffffff16",
  },
  back: { padding: 10 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#b9f0c21a",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#b9f0c2", fontSize: 21 },
  contact: { flex: 1 },
  contactName: { fontSize: 15, color: "#e9eee9", marginBottom: 5 },
  online: { color: "#99bdab", fontSize: 10 },
  reset: { color: "#8b96a3", fontSize: 25, padding: 10 },
  messages: { flex: 1 },
  messageContent: { padding: 20 },
  date: {
    textAlign: "center",
    color: "#677689",
    fontSize: 8,
    letterSpacing: 1.5,
    marginBottom: 25,
  },
  bubble: { maxWidth: "88%", padding: 14, borderRadius: 12, marginBottom: 10 },
  characterBubble: {
    backgroundColor: "#263343",
    borderBottomLeftRadius: 3,
    alignSelf: "flex-start",
  },
  playerBubble: {
    backgroundColor: "#b9f0c2",
    borderBottomRightRadius: 3,
    alignSelf: "flex-end",
  },
  message: { color: "#d5dde4", fontSize: 14, lineHeight: 23 },
  playerText: { color: "#1d3527" },
  typing: { color: "#91a499", letterSpacing: 3 },
  replies: {
    padding: 17,
    borderTopWidth: 1,
    borderColor: "#ffffff16",
    backgroundColor: "#1e2937",
  },
  replyLabel: {
    fontSize: 8,
    letterSpacing: 1.5,
    color: "#8b96a3",
    marginBottom: 12,
  },
  reply: {
    borderWidth: 1,
    borderColor: "#b9f0c23b",
    borderRadius: 7,
    padding: 14,
    marginBottom: 8,
  },
  replyText: { color: "#b9f0c2", fontSize: 13, lineHeight: 21 },
  ending: { alignItems: "center", paddingVertical: 30 },
});
