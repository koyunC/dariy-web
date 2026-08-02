import { useEffect, useMemo, useState } from "react";

import "./App.css";
import { ensureAnonymousAuth } from "./lib/auth";
import {
  getCurrentUserFromUrl,
  setCurrentUserInUrl,
  type CurrentUser,
} from "./lib/current-user";
import {
  getTimeCapsuleLogs,
  type LogReadDiagnostics,
  type TimeCapsuleLog,
} from "./lib/logs";
import {
  formatTimestampForUser,
  formatWeightContent,
  userDataConventions,
  type WeightUnit,
} from "./lib/user-data";

const profiles: Record<CurrentUser, { name: string; symbol: string; greeting: string }> = {
  cloud: { name: "可雲", symbol: "☁️", greeting: "雲朵今天也有好好生活嗎？" },
  stone: { name: "阿寶", symbol: "🪨", greeting: "石頭今天想留下什麼？" },
};

const actions = [
  { id: "miss_you", icon: "💌", label: "想你" },
  { id: "early_up", icon: "☀️", label: "早起" },
  { id: "early_sleep", icon: "🌙", label: "早睡" },
  { id: "exercise", icon: "💪", label: "運動" },
  { id: "study", icon: "📚", label: "認真" },
  { id: "cook", icon: "🍳", label: "煮飯" },
  { id: "weight", icon: "⚖️", label: "體重" },
  { id: "snap", icon: "💤", label: "小休" },
  { id: "snack", icon: "🍜", label: "宵夜" },
] as const;

type HistoryFilter = "all" | CurrentUser;

function formatToday(user: CurrentUser): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: userDataConventions[user].timeZone,
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function getLogTimestamp(log: TimeCapsuleLog): number {
  return log.timeMilliseconds ?? log.createdAt ?? 0;
}

function getActionIcon(actionId: string): string {
  return actions.find((action) => action.id === actionId)?.icon ?? "✦";
}

function getSavedWeightUnit(user: CurrentUser): WeightUnit {
  try {
    const savedUnit = window.localStorage.getItem(
      `parallel-time:weight-unit:${user}`,
    );
    if (savedUnit === "lb" || savedUnit === "kg") return savedUnit;
  } catch {
    // Storage may be unavailable in private browsing; the user default is safe.
  }

  return userDataConventions[user].weightUnit;
}

function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() =>
    getCurrentUserFromUrl(),
  );
  const [logs, setLogs] = useState<TimeCapsuleLog[]>([]);
  const [diagnostics, setDiagnostics] =
    useState<LogReadDiagnostics | null>(null);
  const [uid, setUid] = useState("");
  const [status, setStatus] = useState("正在連接兩人的時光…");
  const [error, setError] = useState("");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [weightUnitPreferences, setWeightUnitPreferences] = useState<
    Record<CurrentUser, WeightUnit>
  >(() => ({
    cloud: getSavedWeightUnit("cloud"),
    stone: getSavedWeightUnit("stone"),
  }));
  const displayWeightUnit = currentUser
    ? weightUnitPreferences[currentUser]
    : "kg";

  useEffect(() => {
    const syncUserFromUrl = () => setCurrentUser(getCurrentUserFromUrl());
    window.addEventListener("popstate", syncUserFromUrl);
    return () => window.removeEventListener("popstate", syncUserFromUrl);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function initialize() {
      try {
        const user = await ensureAnonymousAuth();
        console.log("anonymous auth succeeded", user.isAnonymous);
        console.log("current UID", user.uid);

        if (!isActive) return;
        setUid(user.uid);
        setStatus("正在翻閱過去的紀錄…");

        const result = await getTimeCapsuleLogs();
        if (!isActive) return;

        setLogs(result.logs);
        setDiagnostics(result.diagnostics);
        setStatus(`已載入 ${result.diagnostics.retainedCount} 則共同回憶`);
      } catch (caughtError) {
        console.error(caughtError);
        if (!isActive) return;

        setError(
          caughtError instanceof Error ? caughtError.message : "發生未知錯誤",
        );
        setStatus("暫時連不上我們的時光");
      }
    }

    void initialize();
    return () => {
      isActive = false;
    };
  }, []);

  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => getLogTimestamp(b) - getLogTimestamp(a)),
    [logs],
  );

  const visibleLogs = useMemo(
    () =>
      sortedLogs.filter(
        (log) => historyFilter === "all" || log.user === historyFilter,
      ),
    [historyFilter, sortedLogs],
  );

  const chooseUser = (user: CurrentUser) => {
    setCurrentUserInUrl(user);
    setCurrentUser(user);
    setHistoryFilter("all");
  };

  const chooseWeightUnit = (unit: WeightUnit) => {
    if (!currentUser) return;

    setWeightUnitPreferences((preferences) => ({
      ...preferences,
      [currentUser]: unit,
    }));

    try {
      window.localStorage.setItem(
        `parallel-time:weight-unit:${currentUser}`,
        unit,
      );
    } catch {
      // Keep the in-memory preference when persistent storage is unavailable.
    }
  };

  return (
    <div className={`app-shell theme-${currentUser ?? "shared"}`}>
      <header className="topbar">
        <a className="brand" href={currentUser ? `?user=${currentUser}` : "/"}>
          <span className="brand-mark" aria-hidden="true">∞</span>
          <span>Parallel Time</span>
        </a>
        {currentUser && (
          <button
            className="profile-button"
            type="button"
            onClick={() => setCurrentUser(null)}
            aria-label="切換使用者"
          >
            <span aria-hidden="true">{profiles[currentUser].symbol}</span>
            {profiles[currentUser].name}
          </button>
        )}
      </header>

      {!currentUser ? (
        <main className="identity-page">
          <section className="identity-card" aria-labelledby="identity-title">
            <div className="orbit" aria-hidden="true">
              <span>☁️</span>
              <i>♥</i>
              <span>🪨</span>
            </div>
            <p className="eyebrow">歡迎回來</p>
            <h1 id="identity-title">你是哪一位？</h1>
            <p className="identity-copy">
              選擇身份後，網址會記住你。下次使用相同連結就能直接進入。
            </p>
            <div className="identity-options">
              <button type="button" onClick={() => chooseUser("cloud")}>
                <span className="identity-icon">☁️</span>
                <span><strong>我是可雲</strong><small>?user=cloud</small></span>
                <span aria-hidden="true">→</span>
              </button>
              <button type="button" onClick={() => chooseUser("stone")}>
                <span className="identity-icon">🪨</span>
                <span><strong>我是阿寶</strong><small>?user=stone</small></span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        </main>
      ) : (
        <main className="home-page">
          <section className="welcome-card">
            <div>
              <p className="eyebrow">{formatToday(currentUser)}</p>
              <h1>{profiles[currentUser].greeting}</h1>
              <p className="welcome-status">{status}</p>
            </div>
            <div className="together-mark" aria-label="cloud and stone">
              <span>☁️</span><i>♥</i><span>🪨</span>
            </div>
          </section>

          {error && <div className="error-banner" role="alert">{error}</div>}

          <section className="section quick-section" aria-labelledby="quick-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Quick check-in</p>
                <h2 id="quick-title">現在想記下什麼？</h2>
              </div>
              <span className="preview-tag">介面預覽</span>
            </div>
            <div className="action-grid">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={selectedAction === action.id ? "is-selected" : ""}
                  onClick={() => setSelectedAction(action.id)}
                >
                  <span aria-hidden="true">{action.icon}</span>
                  <small>{action.label}</small>
                </button>
              ))}
            </div>
            {selectedAction && (
              <div className="composer-preview" role="status">
                <span>{getActionIcon(selectedAction)}</span>
                <p><strong>{actions.find((item) => item.id === selectedAction)?.label}</strong><br />寫入功能會在下一階段接上 Firestore。</p>
                <button type="button" onClick={() => setSelectedAction(null)}>關閉</button>
              </div>
            )}
          </section>

          <section className="section history-section" aria-labelledby="history-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Our moments</p>
                <h2 id="history-title">最近的時光</h2>
              </div>
              <span className="record-count">{visibleLogs.length} 則</span>
            </div>
            <div className="filter-tabs" aria-label="篩選紀錄">
              {(["all", "cloud", "stone"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={historyFilter === filter ? "is-active" : ""}
                  onClick={() => setHistoryFilter(filter)}
                >
                  {filter === "all" ? "全部" : `${profiles[filter].symbol} ${profiles[filter].name}`}
                </button>
              ))}
            </div>
            <div className="display-preferences" aria-label="顯示偏好">
              <span>
                時間：{userDataConventions[currentUser].timeZoneLabel}
              </span>
              <div className="unit-toggle" aria-label="體重顯示單位">
                {(["lb", "kg"] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    className={displayWeightUnit === unit ? "is-active" : ""}
                    onClick={() => chooseWeightUnit(unit)}
                    aria-pressed={displayWeightUnit === unit}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>

            {visibleLogs.length > 0 ? (
              <ol className="timeline">
                {visibleLogs.slice(0, 30).map((log) => {
                  const knownUser = log.user === "cloud" || log.user === "stone"
                    ? log.user
                    : null;
                  return (
                    <li key={log.id}>
                      <div className="timeline-icon" aria-hidden="true">
                        {getActionIcon(log.actionId)}
                      </div>
                      <article>
                        <div className="log-meta">
                          <strong>{knownUser ? profiles[knownUser].name : log.user}</strong>
                          <time>
                            {log.timeMilliseconds === null
                              ? log.time
                              : formatTimestampForUser(
                                  log.timeMilliseconds,
                                  currentUser,
                                )}
                          </time>
                        </div>
                        <p>
                          {formatWeightContent(
                            log.content,
                            log.actionId,
                            log.sourceWeightUnit,
                            displayWeightUnit,
                          )}
                        </p>
                        {log.isLegacy && <span className="legacy-tag">舊格式資料</span>}
                      </article>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="empty-state">
                <span>✦</span>
                <p>{diagnostics ? "這個篩選條件還沒有紀錄" : "正在載入紀錄…"}</p>
              </div>
            )}
          </section>

          <details className="diagnostics">
            <summary>連線診斷</summary>
            <dl>
              <div><dt>匿名登入</dt><dd>{uid ? "成功" : "等待中"}</dd></div>
              <div><dt>目前 UID</dt><dd>{uid || "—"}</dd></div>
              <div><dt>projectId</dt><dd>{diagnostics?.projectId ?? "—"}</dd></div>
              <div><dt>database</dt><dd>{diagnostics?.databaseId ?? "—"}</dd></div>
              <div><dt>snapshot.size</dt><dd>{diagnostics?.snapshotSize ?? "—"}</dd></div>
              <div><dt>解析後保留</dt><dd>{diagnostics?.retainedCount ?? "—"}</dd></div>
              <div><dt>略過</dt><dd>{diagnostics?.skippedDocuments.length ?? "—"}</dd></div>
            </dl>
          </details>
        </main>
      )}

      <footer>Made for Cloud &amp; Stone <span aria-hidden="true">♥</span></footer>
    </div>
  );
}

export default App;
