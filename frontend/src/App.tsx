import { useEffect, useMemo, useState, type CSSProperties } from "react";

import "./App.css";
import { checkInActions } from "./lib/action-catalog";
import { ensureAnonymousAuth } from "./lib/auth";
import {
  clearCurrentUserFromUrl,
  getCurrentUserFromUrl,
  setCurrentUserInUrl,
  type CurrentUser,
} from "./lib/current-user";
import {
  getTimeCapsuleLogs,
  type LogReadDiagnostics,
  type TimeCapsuleLog,
} from "./lib/logs";
import { isWithinRecentHistory } from "./lib/history";
import {
  calculateCheckInProgress,
  getRollingDateRange,
  type CheckInProgress,
} from "./lib/check-in-stats";
import {
  formatTimestampInTimeZone,
  formatWeightContent,
  getTimeZoneLabel,
  userDataConventions,
  type WeightUnit,
} from "./lib/user-data";
import {
  syncUserTimeZone,
  type UserTimeZoneSyncResult,
} from "./lib/user-metadata";
import {
  defaultCheckInGoals,
  normalizeCheckInGoals,
  type CheckInGoals,
} from "./lib/preference-rules";
import {
  getUserCheckInGoals,
  saveUserCheckInGoals,
} from "./lib/user-preferences";

const profiles: Record<CurrentUser, { name: string; symbol: string; greeting: string }> = {
  cloud: { name: "可雲", symbol: "☁️", greeting: "雲朵今天也有好好生活嗎？" },
  stone: { name: "阿寶", symbol: "🪨", greeting: "石頭今天想留下什麼？" },
};

type HistoryFilter = "all" | CurrentUser;
type ProgressPeriod = "week" | "month" | "custom";

type ProgressCardProps = {
  icon: string;
  label: string;
  progress: CheckInProgress;
};

function ProgressCard({ icon, label, progress }: ProgressCardProps) {
  const percentage = Math.round(progress.percentage * 100);

  return (
    <article
      className="progress-card"
      aria-label={`${label}：完成 ${progress.completedCount} 次，累計目標 ${progress.targetCount} 次，達成率 ${percentage}%`}
    >
      <div
        className="progress-icon"
        style={{ "--progress": `${percentage}%` } as CSSProperties}
        aria-hidden="true"
      >
        <span>{icon}</span>
      </div>
      <strong>{progress.completedCount}/{progress.targetCount}</strong>
    </article>
  );
}

function formatToday(timeZone: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone,
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function getLogTimestamp(log: TimeCapsuleLog): number {
  return log.timeMilliseconds ?? log.createdAt ?? 0;
}

function getActionIcon(actionId: string): string {
  return checkInActions.find((action) => action.id === actionId)?.icon ?? "✦";
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
  const [timeZoneSync, setTimeZoneSync] =
    useState<UserTimeZoneSyncResult | null>(null);
  const [checkInGoals, setCheckInGoals] = useState<CheckInGoals>(() =>
    normalizeCheckInGoals(defaultCheckInGoals),
  );
  const [draftCheckInGoals, setDraftCheckInGoals] = useState<CheckInGoals>(() =>
    normalizeCheckInGoals(defaultCheckInGoals),
  );
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesError, setPreferencesError] = useState("");
  const [status, setStatus] = useState("正在連接兩人的時光…");
  const [error, setError] = useState("");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [historyReferenceTime, setHistoryReferenceTime] = useState(() =>
    Date.now(),
  );
  const [customRange, setCustomRange] = useState(() =>
    getRollingDateRange(
      historyReferenceTime,
      14,
      userDataConventions[currentUser ?? "stone"].timeZone,
    ),
  );
  const [progressPeriod, setProgressPeriod] =
    useState<ProgressPeriod>("week");
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
    const timer = window.setInterval(
      () => setHistoryReferenceTime(Date.now()),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function initialize() {
      try {
        setError("");
        setTimeZoneSync(null);
        setCheckInGoals(normalizeCheckInGoals(defaultCheckInGoals));
        setLogs([]);
        setDiagnostics(null);

        const user = await ensureAnonymousAuth();
        console.log("anonymous auth succeeded", user.isAnonymous);
        console.log("current UID", user.uid);

        if (!isActive) return;
        setUid(user.uid);
        if (!currentUser) {
          setStatus("請先選擇使用者");
          return;
        }

        setStatus("正在同步目前時區…");
        const syncedTimeZone = await syncUserTimeZone(currentUser);
        if (!isActive) return;

        console.log("detected timeZone", syncedTimeZone.detectedTimeZone);
        console.log("stored timeZone updated", syncedTimeZone.updated);
        setTimeZoneSync(syncedTimeZone);
        setCustomRange(
          getRollingDateRange(
            Date.now(),
            14,
            syncedTimeZone.effectiveTimeZone,
          ),
        );
        setStatus("正在翻閱過去的紀錄…");

        const [result, storedCheckInGoals] = await Promise.all([
          getTimeCapsuleLogs(),
          getUserCheckInGoals(currentUser),
        ]);
        if (!isActive) return;

        setLogs(result.logs);
        setCheckInGoals(storedCheckInGoals);
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
  }, [currentUser]);

  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => getLogTimestamp(b) - getLogTimestamp(a)),
    [logs],
  );

  const recentLogs = useMemo(
    () =>
      sortedLogs.filter((log) =>
        isWithinRecentHistory(getLogTimestamp(log), historyReferenceTime),
      ),
    [historyReferenceTime, sortedLogs],
  );

  const visibleLogs = useMemo(
    () =>
      recentLogs.filter(
        (log) => historyFilter === "all" || log.user === historyFilter,
      ),
    [historyFilter, recentLogs],
  );

  const actionProgress = useMemo(() => {
    if (!currentUser || !timeZoneSync) return null;

    const timeZone = timeZoneSync.effectiveTimeZone;
    const weekRange = getRollingDateRange(
      historyReferenceTime,
      7,
      timeZone,
    );
    const monthRange = getRollingDateRange(
      historyReferenceTime,
      30,
      timeZone,
    );

    const ranges = {
      week: weekRange,
      month: monthRange,
      custom: customRange,
    };

    return checkInActions.map((action) => ({
      ...action,
      progress: calculateCheckInProgress(
        logs,
        currentUser,
        ranges[progressPeriod],
        action.id,
        timeZone,
        checkInGoals[action.id].targetCount,
        checkInGoals[action.id].periodDays,
      ),
    }));
  }, [
    currentUser,
    customRange,
    historyReferenceTime,
    logs,
    checkInGoals,
    progressPeriod,
    timeZoneSync,
  ]);

  const chooseUser = (user: CurrentUser) => {
    setCurrentUserInUrl(user);
    setCurrentUser(user);
    setHistoryFilter("all");
    setProfileMenuOpen(false);
  };

  const openPreferences = () => {
    setDraftCheckInGoals(normalizeCheckInGoals(checkInGoals));
    setPreferencesError("");
    setProfileMenuOpen(false);
    setPreferencesOpen(true);
  };

  const changeDraftTargetCount = (
    actionId: keyof CheckInGoals,
    difference: number,
  ) => {
    setDraftCheckInGoals((goals) => ({
      ...goals,
      [actionId]: {
        ...goals[actionId],
        targetCount: Math.min(
          10,
          Math.max(1, goals[actionId].targetCount + difference),
        ),
      },
    }));
  };

  const changeDraftPeriod = (
    actionId: keyof CheckInGoals,
    periodDays: number,
  ) => {
    setDraftCheckInGoals((goals) => ({
      ...goals,
      [actionId]: { ...goals[actionId], periodDays },
    }));
  };

  const savePreferences = async () => {
    if (!currentUser || preferencesSaving) return;

    setPreferencesSaving(true);
    setPreferencesError("");
    try {
      const savedGoals = await saveUserCheckInGoals(
        currentUser,
        draftCheckInGoals,
      );
      setCheckInGoals(savedGoals);
      setPreferencesOpen(false);
    } catch (caughtError) {
      setPreferencesError(
        caughtError instanceof Error ? caughtError.message : "偏好儲存失敗",
      );
    } finally {
      setPreferencesSaving(false);
    }
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
          <div className="profile-menu-wrap">
            <button
              className="profile-button"
              type="button"
              onClick={() => setProfileMenuOpen((open) => !open)}
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
            >
              <span aria-hidden="true">{profiles[currentUser].symbol}</span>
              {profiles[currentUser].name}
              <span aria-hidden="true">⌄</span>
            </button>
            {profileMenuOpen && (
              <div className="profile-menu" role="menu">
                <button type="button" role="menuitem" onClick={openPreferences}>
                  <span aria-hidden="true">⚙️</span>
                  偏好設定
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    clearCurrentUserFromUrl();
                    setCurrentUser(null);
                    setProfileMenuOpen(false);
                  }}
                >
                  <span aria-hidden="true">⇄</span>
                  切換身分
                </button>
              </div>
            )}
          </div>
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
              <p className="eyebrow">
                {timeZoneSync
                  ? formatToday(timeZoneSync.effectiveTimeZone)
                  : "正在同步時區…"}
              </p>
              <h1>{profiles[currentUser].greeting}</h1>
              <p className="welcome-status">{status}</p>
            </div>
            <div className="together-mark" aria-label="cloud and stone">
              <span>☁️</span><i>♥</i><span>🪨</span>
            </div>
          </section>

          {error && <div className="error-banner" role="alert">{error}</div>}

          {actionProgress && (
            <section className="section progress-section" aria-labelledby="progress-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Check-in progress</p>
                  <h2 id="progress-title">打卡達成率</h2>
                </div>
              </div>
              <div className="progress-period-tabs" aria-label="統計時間範圍">
                {([
                  ["week", "過去一週"],
                  ["month", "一個月"],
                  ["custom", "自訂區間"],
                ] as const).map(([period, label]) => (
                  <button
                    key={period}
                    type="button"
                    className={progressPeriod === period ? "is-active" : ""}
                    onClick={() => setProgressPeriod(period)}
                    aria-pressed={progressPeriod === period}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="progress-grid">
                {actionProgress.map((action) => (
                  <ProgressCard
                    key={action.id}
                    icon={action.icon}
                    label={action.label}
                    progress={action.progress}
                  />
                ))}
              </div>
              {progressPeriod === "custom" && (
                <div className="custom-range" aria-label="自訂統計區間">
                  <label>
                    <span>開始</span>
                    <input
                      type="date"
                      value={customRange.start}
                      max={customRange.end}
                      onChange={(event) =>
                        setCustomRange((range) => ({
                          ...range,
                          start: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <span aria-hidden="true">—</span>
                  <label>
                    <span>結束</span>
                    <input
                      type="date"
                      value={customRange.end}
                      min={customRange.start}
                      onChange={(event) =>
                        setCustomRange((range) => ({
                          ...range,
                          end: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              )}
            </section>
          )}

          <section className="section quick-section" aria-labelledby="quick-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Quick check-in</p>
                <h2 id="quick-title">現在想記下什麼？</h2>
              </div>
              <span className="preview-tag">介面預覽</span>
            </div>
            <div className="action-grid">
              {checkInActions.map((action) => (
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
                <p><strong>{checkInActions.find((item) => item.id === selectedAction)?.label}</strong><br />寫入功能會在下一階段接上 Firestore。</p>
                <button type="button" onClick={() => setSelectedAction(null)}>關閉</button>
              </div>
            )}
          </section>

          <section className="section history-section" aria-labelledby="history-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Our moments</p>
                <h2 id="history-title">最近 7 天</h2>
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
                時間：{timeZoneSync
                  ? getTimeZoneLabel(timeZoneSync.effectiveTimeZone)
                  : "同步中…"}
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
                            {log.timeMilliseconds === null || !timeZoneSync
                              ? log.time
                              : formatTimestampInTimeZone(
                                  log.timeMilliseconds,
                                  timeZoneSync.effectiveTimeZone,
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
              <div><dt>目前時區</dt><dd>{timeZoneSync?.effectiveTimeZone ?? "—"}</dd></div>
              <div><dt>metadata 更新</dt><dd>{timeZoneSync ? (timeZoneSync.updated ? "是" : "否") : "—"}</dd></div>
              <div><dt>snapshot.size</dt><dd>{diagnostics?.snapshotSize ?? "—"}</dd></div>
              <div><dt>解析後保留</dt><dd>{diagnostics?.retainedCount ?? "—"}</dd></div>
              <div><dt>略過</dt><dd>{diagnostics?.skippedDocuments.length ?? "—"}</dd></div>
            </dl>
          </details>
        </main>
      )}

      {currentUser && preferencesOpen && (
        <div className="preferences-backdrop" role="presentation">
          <section
            className="preferences-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preferences-title"
          >
            <div className="preferences-heading">
              <div>
                <p className="eyebrow">{profiles[currentUser].name}</p>
                <h2 id="preferences-title">打卡頻率目標</h2>
              </div>
              <button
                type="button"
                onClick={() => setPreferencesOpen(false)}
                aria-label="關閉偏好設定"
              >
                ×
              </button>
            </div>
            <div className="target-list">
              {checkInActions.map((action) => (
                <div className="target-row" key={action.id}>
                  <span className="target-action">
                    <span aria-hidden="true">{action.icon}</span>
                    <strong>{action.label}</strong>
                  </span>
                  <span className="goal-controls">
                    <span className="target-stepper">
                      <button
                        type="button"
                        onClick={() => changeDraftTargetCount(action.id, -1)}
                        disabled={draftCheckInGoals[action.id].targetCount <= 1}
                        aria-label={`減少${action.label}目標次數`}
                      >
                        −
                      </button>
                      <output aria-label={`${action.label}目標次數`}>
                        {draftCheckInGoals[action.id].targetCount}
                      </output>
                      <button
                        type="button"
                        onClick={() => changeDraftTargetCount(action.id, 1)}
                        disabled={draftCheckInGoals[action.id].targetCount >= 10}
                        aria-label={`增加${action.label}目標次數`}
                      >
                        ＋
                      </button>
                    </span>
                    <span className="goal-separator">次／</span>
                    <label className="period-select">
                      <select
                        value={draftCheckInGoals[action.id].periodDays}
                        onChange={(event) =>
                          changeDraftPeriod(action.id, Number(event.target.value))
                        }
                        aria-label={`${action.label}目標週期`}
                      >
                        {[1, 2, 3, 7, 14, 30].map((days) => (
                          <option key={days} value={days}>{days}</option>
                        ))}
                      </select>
                      <span>天</span>
                    </label>
                  </span>
                </div>
              ))}
            </div>
            {preferencesError && (
              <p className="preferences-error" role="alert">
                {preferencesError}
              </p>
            )}
            <button
              className="save-preferences"
              type="button"
              onClick={() => void savePreferences()}
              disabled={preferencesSaving}
            >
              {preferencesSaving ? "儲存中…" : "儲存偏好"}
            </button>
          </section>
        </div>
      )}

      <footer>Made for Cloud &amp; Stone <span aria-hidden="true">♥</span></footer>
    </div>
  );
}

export default App;
