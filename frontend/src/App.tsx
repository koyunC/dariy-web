import { useEffect, useMemo, useRef, useState } from "react";

import "./App.css";
import {
  checkInActions,
  type CheckInActionId,
} from "./lib/action-catalog";
import { ensureAnonymousAuth } from "./lib/auth";
import { prepareCheckIn } from "./lib/check-in-write";
import {
  clearCurrentUserFromUrl,
  getCurrentUserFromUrl,
  setCurrentUserInUrl,
  type CurrentUser,
} from "./lib/current-user";
import {
  createTimeCapsuleLog,
  getTimeCapsuleLogs,
  type LogReadDiagnostics,
  type TimeCapsuleLog,
} from "./lib/logs";
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
import {
  createSevenDayMemoryTimeline,
  formatTimelineDate,
  getOrderedMemoryDayLogs,
} from "./lib/memory-timeline";

const profiles: Record<CurrentUser, { name: string; symbol: string; greeting: string }> = {
  cloud: { name: "可雲", symbol: "☁️", greeting: "雲朵今天也有好好生活嗎？" },
  stone: { name: "阿寶", symbol: "🪨", greeting: "石頭今天想留下什麼？" },
};

type ProgressPeriod = "week" | "month" | "custom";

type ProgressCardProps = {
  icon: string;
  label: string;
  progress: CheckInProgress;
};

function ProgressCard({ icon, label, progress }: ProgressCardProps) {
  const percentage = Math.round(progress.percentage * 100);
  const layers = Array.from(
    { length: Math.ceil(progress.percentage) },
    (_, index) => Math.min(
      100,
      Math.max(0, progress.percentage * 100 - index * 100),
    ),
  );

  return (
    <article
      className="progress-card"
      aria-label={`${label}：完成 ${progress.completedCount} 次，累計目標 ${progress.targetCount} 次，達成率 ${percentage}%`}
    >
      <div className="progress-icon" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <circle
            className="progress-ring-track"
            cx="50"
            cy="50"
            r="43"
            pathLength="100"
          />
          {layers.map((layerProgress, index) => (
            <circle
              key={index}
              className={`progress-ring-layer progress-ring-layer-${index % 4}`}
              cx="50"
              cy="50"
              r="43"
              pathLength="100"
              strokeDasharray={`${layerProgress} 100`}
            />
          ))}
        </svg>
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
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [checkInNote, setCheckInNote] = useState("");
  const [weightValue, setWeightValue] = useState("");
  const [checkInSaving, setCheckInSaving] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState("");
  const [checkInError, setCheckInError] = useState("");
  const [selectedTimelineLog, setSelectedTimelineLog] =
    useState<TimeCapsuleLog | null>(null);
  const [selectedTimelineDayKey, setSelectedTimelineDayKey] =
    useState<string | null>(null);
  const timelineScrollReference = useRef<HTMLDivElement | null>(null);
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

  const memoryTimeline = useMemo(() => {
    if (!currentUser || !timeZoneSync) return [];
    return createSevenDayMemoryTimeline(
      sortedLogs,
      currentUser,
      historyReferenceTime,
      timeZoneSync.effectiveTimeZone,
    );
  }, [currentUser, historyReferenceTime, sortedLogs, timeZoneSync]);

  const timelineRecordCount = useMemo(
    () => memoryTimeline.reduce(
      (total, day) =>
        total + day.currentUserLogs.length + day.partnerLogs.length,
      0,
    ),
    [memoryTimeline],
  );

  const selectedTimelineDay = useMemo(
    () => memoryTimeline.find(
      (day) => day.dateKey === selectedTimelineDayKey,
    ) ?? null,
    [memoryTimeline, selectedTimelineDayKey],
  );

  const selectedDayLogs = useMemo(
    () => selectedTimelineDay
      ? getOrderedMemoryDayLogs(selectedTimelineDay)
      : [],
    [selectedTimelineDay],
  );

  useEffect(() => {
    const scroller = timelineScrollReference.current;
    if (!scroller || timelineRecordCount === 0) return;

    const frame = window.requestAnimationFrame(() => {
      scroller.scrollLeft = scroller.scrollWidth;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentUser, timelineRecordCount]);

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
    setSelectedTimelineLog(null);
    setSelectedTimelineDayKey(null);
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

  const chooseAction = (actionId: CheckInActionId) => {
    setSelectedAction(actionId);
    setCheckInNote("");
    setWeightValue("");
    setCheckInMessage("");
    setCheckInError("");
  };

  const submitCheckIn = async () => {
    if (
      !currentUser
      || !timeZoneSync
      || !selectedAction
      || checkInSaving
    ) return;

    setCheckInSaving(true);
    setCheckInError("");
    setCheckInMessage("");

    try {
      const actionId = selectedAction as CheckInActionId;
      const prepared = prepareCheckIn({
        actionId,
        note: checkInNote,
        weightValue,
        weightUnit: userDataConventions[currentUser].weightUnit,
      });

      const createdLog = await createTimeCapsuleLog({
        ...prepared,
        user: currentUser,
        timeZone: timeZoneSync.effectiveTimeZone,
      });

      setLogs((currentLogs) => [createdLog, ...currentLogs]);
      setDiagnostics((currentDiagnostics) => currentDiagnostics
        ? {
            ...currentDiagnostics,
            snapshotSize: currentDiagnostics.snapshotSize + 1,
            retainedCount: currentDiagnostics.retainedCount + 1,
          }
        : currentDiagnostics);
      setHistoryReferenceTime(Date.now());
      setSelectedAction(null);
      setCheckInNote("");
      setWeightValue("");
      setCheckInMessage(`${getActionIcon(actionId)} 打卡成功`);
      setStatus("新回憶已同步");
    } catch (caughtError) {
      setCheckInError(
        caughtError instanceof Error ? caughtError.message : "打卡失敗",
      );
    } finally {
      setCheckInSaving(false);
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
              <span className="preview-tag">即時同步</span>
            </div>
            <div className="action-grid">
              {checkInActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={selectedAction === action.id ? "is-selected" : ""}
                  onClick={() => chooseAction(action.id)}
                >
                  <span aria-hidden="true">{action.icon}</span>
                  <small>{action.label}</small>
                </button>
              ))}
            </div>
            {selectedAction && (
              <form
                className="check-in-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitCheckIn();
                }}
              >
                <div className="check-in-composer-heading">
                  <span aria-hidden="true">{getActionIcon(selectedAction)}</span>
                  <strong>
                    {checkInActions.find((item) => item.id === selectedAction)?.label}
                  </strong>
                  <button
                    type="button"
                    onClick={() => setSelectedAction(null)}
                    aria-label="關閉打卡表單"
                  >
                    ×
                  </button>
                </div>
                {selectedAction === "weight" ? (
                  <label className="check-in-field weight-field">
                    <span>體重</span>
                    <span className="weight-input-wrap">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.1"
                        step="0.1"
                        value={weightValue}
                        onChange={(event) => setWeightValue(event.target.value)}
                        placeholder={currentUser === "cloud" ? "例如 140.0" : "例如 63.5"}
                        autoFocus
                        required
                      />
                      <strong>{userDataConventions[currentUser].weightUnit}</strong>
                    </span>
                  </label>
                ) : (
                  <label className="check-in-field">
                    <span>備註（選填）</span>
                    <textarea
                      value={checkInNote}
                      onChange={(event) => setCheckInNote(event.target.value)}
                      maxLength={200}
                      rows={3}
                      placeholder="想留下什麼？"
                      autoFocus
                    />
                  </label>
                )}
                <p className="check-in-time-zone">
                  將以 {getTimeZoneLabel(timeZoneSync?.effectiveTimeZone ?? userDataConventions[currentUser].timeZone)} 記錄
                </p>
                {checkInError && (
                  <p className="check-in-error" role="alert">{checkInError}</p>
                )}
                <button
                  className="submit-check-in"
                  type="submit"
                  disabled={checkInSaving || !timeZoneSync || !uid}
                >
                  {checkInSaving ? "寫入中…" : "完成打卡"}
                </button>
              </form>
            )}
            {checkInMessage && (
              <p className="check-in-success" role="status">{checkInMessage}</p>
            )}
          </section>

          <section className="section history-section" aria-labelledby="history-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Our moments</p>
                <h2 id="history-title">最近 7 天</h2>
              </div>
              <span className="record-count">{timelineRecordCount} 則</span>
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

            {timelineRecordCount > 0 ? (
              <>
                {!selectedTimelineDay ? (
                  <div className="memory-timeline-frame">
                    <div className="memory-user-rail memory-user-rail-week" aria-label="時間軸使用者位置">
                      <span aria-label={`上方：${profiles[currentUser].name}`}>
                        {profiles[currentUser].symbol}
                      </span>
                      <i aria-hidden="true" />
                      <span aria-label={`下方：${currentUser === "cloud" ? profiles.stone.name : profiles.cloud.name}`}>
                        {currentUser === "cloud" ? profiles.stone.symbol : profiles.cloud.symbol}
                      </span>
                    </div>
                    <div
                      className="memory-timeline-scroll"
                      ref={timelineScrollReference}
                      aria-label="最近七天雙人回憶時間軸"
                    >
                      <div className="memory-timeline-track">
                        {memoryTimeline.map((day) => {
                          const formattedDate = formatTimelineDate(day.dateKey);
                          return (
                            <section className="memory-day" key={day.dateKey}>
                              <div className={`memory-lane memory-lane-current ${day.currentUserLogs.length ? "has-events" : ""}`}>
                                <div className="memory-events">
                                  {day.currentUserLogs.map((log) => (
                                    <button
                                      key={log.id}
                                      type="button"
                                      className={selectedTimelineLog?.id === log.id ? "is-selected" : ""}
                                      onClick={() => setSelectedTimelineLog(log)}
                                      aria-label={`${profiles[currentUser].name}：${log.content}`}
                                    >
                                      {getActionIcon(log.actionId)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <button
                                className="memory-axis-date"
                                type="button"
                                onClick={() => {
                                  setSelectedTimelineDayKey(day.dateKey);
                                  setSelectedTimelineLog(null);
                                }}
                                aria-label={`放大檢視 ${formattedDate.date} ${formattedDate.weekday}`}
                              >
                                <strong>{formattedDate.weekday}</strong>
                                <small>{formattedDate.date}</small>
                              </button>
                              <div className={`memory-lane memory-lane-partner ${day.partnerLogs.length ? "has-events" : ""}`}>
                                <div className="memory-events">
                                  {day.partnerLogs.map((log) => {
                                    const partner = currentUser === "cloud" ? "stone" : "cloud";
                                    return (
                                      <button
                                        key={log.id}
                                        type="button"
                                        className={selectedTimelineLog?.id === log.id ? "is-selected" : ""}
                                        onClick={() => setSelectedTimelineLog(log)}
                                        aria-label={`${profiles[partner].name}：${log.content}`}
                                      >
                                        {getActionIcon(log.actionId)}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="memory-day-focus">
                    <div className="memory-day-focus-heading">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTimelineDayKey(null);
                          setSelectedTimelineLog(null);
                        }}
                      >
                        ← 週檢視
                      </button>
                      <strong>
                        {formatTimelineDate(selectedTimelineDay.dateKey).date}{" "}
                        {formatTimelineDate(selectedTimelineDay.dateKey).weekday}
                      </strong>
                      <span>{selectedDayLogs.length} 則</span>
                    </div>
                    {selectedDayLogs.length > 0 ? (
                      <div className="memory-timeline-frame memory-day-detail-frame">
                        <div className="memory-user-rail memory-user-rail-day" aria-label="單日時間軸使用者位置">
                          <span aria-label={`上方：${profiles[currentUser].name}`}>
                            {profiles[currentUser].symbol}
                          </span>
                          <i aria-hidden="true" />
                          <span aria-label={`下方：${currentUser === "cloud" ? profiles.stone.name : profiles.cloud.name}`}>
                            {currentUser === "cloud" ? profiles.stone.symbol : profiles.cloud.symbol}
                          </span>
                        </div>
                        <div className="memory-day-detail-scroll" aria-label={`${selectedTimelineDay.dateKey} 詳細時間軸`}>
                          <div className="memory-day-detail-track">
                            {selectedDayLogs.map((log) => {
                            const isCurrentUser = log.user === currentUser;
                            const timestamp = getLogTimestamp(log);
                            const displayTime = timestamp && timeZoneSync
                              ? new Intl.DateTimeFormat("zh-TW", {
                                  timeZone: timeZoneSync.effectiveTimeZone,
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hourCycle: "h23",
                                }).format(new Date(timestamp))
                              : "—";
                              return (
                                <article className="memory-day-event" key={log.id}>
                                <div className={`memory-day-event-slot memory-day-event-upper ${isCurrentUser ? "has-event" : ""}`}>
                                  {isCurrentUser && (
                                    <button
                                      type="button"
                                      className={selectedTimelineLog?.id === log.id ? "is-selected" : ""}
                                      onClick={() => setSelectedTimelineLog(log)}
                                      aria-label={`${profiles[currentUser].name}：${log.content}`}
                                    >
                                      {getActionIcon(log.actionId)}
                                    </button>
                                  )}
                                </div>
                                <time dateTime={timestamp ? new Date(timestamp).toISOString() : undefined}>
                                  {displayTime}
                                </time>
                                <div className={`memory-day-event-slot memory-day-event-lower ${!isCurrentUser ? "has-event" : ""}`}>
                                  {!isCurrentUser && (
                                    <button
                                      type="button"
                                      className={selectedTimelineLog?.id === log.id ? "is-selected" : ""}
                                      onClick={() => setSelectedTimelineLog(log)}
                                      aria-label={`${log.user === "cloud" ? profiles.cloud.name : profiles.stone.name}：${log.content}`}
                                    >
                                      {getActionIcon(log.actionId)}
                                    </button>
                                  )}
                                </div>
                                </article>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-state memory-day-empty">
                        <span>✦</span>
                        <p>這一天還沒有紀錄</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                <span>✦</span>
                <p>{diagnostics ? "最近七天還沒有紀錄" : "正在載入紀錄…"}</p>
              </div>
            )}

            {selectedTimelineLog && (
              <article className="memory-detail">
                <div className="timeline-icon" aria-hidden="true">
                  {getActionIcon(selectedTimelineLog.actionId)}
                </div>
                <div>
                  <div className="log-meta">
                    <strong>
                      {selectedTimelineLog.user === "cloud" || selectedTimelineLog.user === "stone"
                        ? profiles[selectedTimelineLog.user].name
                        : selectedTimelineLog.user}
                    </strong>
                    <time>
                      {selectedTimelineLog.timeMilliseconds === null || !timeZoneSync
                        ? selectedTimelineLog.time
                        : formatTimestampInTimeZone(
                            selectedTimelineLog.timeMilliseconds,
                            timeZoneSync.effectiveTimeZone,
                          )}
                    </time>
                  </div>
                  <p>
                    {formatWeightContent(
                      selectedTimelineLog.content,
                      selectedTimelineLog.actionId,
                      selectedTimelineLog.sourceWeightUnit,
                      displayWeightUnit,
                    )}
                  </p>
                  {selectedTimelineLog.isLegacy && (
                    <span className="legacy-tag">舊格式資料</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTimelineLog(null)}
                  aria-label="關閉回憶內容"
                >
                  ×
                </button>
              </article>
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
