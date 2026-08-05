import assert from "node:assert/strict";
import test from "node:test";

import { checkInActions } from "../src/lib/action-catalog.ts";
import { isWithinRecentHistory } from "../src/lib/history.ts";
import {
  calculateCheckInProgress,
  getRollingDateRange,
} from "../src/lib/check-in-stats.ts";
import {
  extractCheckInContentValue,
  extractWeightValue,
  prepareCheckIn,
} from "../src/lib/check-in-write.ts";
import type { TimeCapsuleLog } from "../src/lib/logs.ts";
import {
  createSevenDayMemoryTimeline,
  formatTimelineDate,
  getOrderedMemoryDayLogs,
} from "../src/lib/memory-timeline.ts";
import {
  defaultCheckInGoals,
  hasCompleteCheckInGoals,
  normalizeCheckInGoals,
} from "../src/lib/preference-rules.ts";
import {
  formatTimestampForUser,
  formatWeightContent,
} from "../src/lib/user-data.ts";
import { findUsersByAuthUID } from "../src/lib/user-identity.ts";

test("Google authUID resolves exactly one application profile", () => {
  const metadata = {
    cloud: { authUID: "google-cloud-uid" },
    stone: { authUID: "google-stone-uid" },
  };

  assert.deepEqual(
    findUsersByAuthUID("google-stone-uid", metadata),
    ["stone"],
  );
  assert.deepEqual(findUsersByAuthUID("unknown-uid", metadata), []);
});

test("duplicate authUID bindings are surfaced instead of guessed", () => {
  assert.deepEqual(
    findUsersByAuthUID("duplicate-uid", {
      cloud: { authUID: "duplicate-uid" },
      stone: { authUID: "duplicate-uid" },
    }),
    ["cloud", "stone"],
  );
});

test("recent history includes exactly seven days and excludes older records", () => {
  const now = Date.parse("2026-08-03T00:00:00Z");
  const sevenDays = 7 * 24 * 60 * 60 * 1_000;

  assert.equal(isWithinRecentHistory(now - sevenDays, now), true);
  assert.equal(isWithinRecentHistory(now - sevenDays - 1, now), false);
  assert.equal(isWithinRecentHistory(now, now), true);
  assert.equal(isWithinRecentHistory(now + 1, now), false);
});

test("the same timestamp is displayed in the viewer's time zone", () => {
  const timestamp = Date.parse("2026-02-26T12:00:00Z");

  assert.match(
    formatTimestampForUser(timestamp, "cloud"),
    /^2026\/02\/26 07:00:00/,
  );
  assert.match(
    formatTimestampForUser(timestamp, "stone"),
    /^2026\/02\/26 20:00:00/,
  );
});

test("weight values are converted from the recorder's unit", () => {
  assert.equal(
    formatWeightContent("⚖️ 體重：139.2", "weight", "lb", "kg"),
    "⚖️ 體重：63.1 kg",
  );
  assert.equal(
    formatWeightContent("⚖️ 體重：74.05", "weight", "kg", "lb"),
    "⚖️ 體重：163.3 lb",
  );
});

test("an explicit historical weight unit overrides the recorder default", () => {
  assert.equal(
    formatWeightContent("⚖️ 體重：74 kg", "weight", "lb", "lb"),
    "⚖️ 體重：163.1 lb",
  );
});

test("check-in content retains the selected category and optional note", () => {
  assert.deepEqual(
    prepareCheckIn({
      actionId: "exercise",
      note: "  跑步 3 公里  ",
      weightUnit: "kg",
    }),
    { actionId: "exercise", content: "💪運動：跑步 3 公里" },
  );
  assert.deepEqual(
    prepareCheckIn({ actionId: "cook", weightUnit: "kg" }),
    { actionId: "cook", content: "🍳煮飯" },
  );
});

test("weight check-ins explicitly store the recorder's unit", () => {
  assert.deepEqual(
    prepareCheckIn({
      actionId: "weight",
      weightValue: "139.2",
      weightUnit: "lb",
    }),
    { actionId: "weight", content: "⚖️體重：139.2 lb" },
  );
  assert.throws(
    () => prepareCheckIn({
      actionId: "weight",
      weightValue: "0",
      weightUnit: "kg",
    }),
    /有效的體重/,
  );
});

test("existing check-in content can be opened in the edit form", () => {
  assert.equal(
    extractCheckInContentValue("💪運動：跑步 3 公里"),
    "跑步 3 公里",
  );
  assert.equal(
    extractCheckInContentValue("🍳煮飯"),
    "",
  );
  assert.equal(
    extractWeightValue("⚖️體重：139.2 lb"),
    "139.2",
  );
});

function logAt(
  user: "cloud" | "stone",
  isoTimestamp: string,
): TimeCapsuleLog {
  return {
    id: `${user}-${isoTimestamp}`,
    actionId: "exercise",
    content: "exercise",
    createdAt: null,
    time: isoTimestamp,
    timeMilliseconds: Date.parse(isoTimestamp),
    updatedAt: null,
    user,
    sourceWeightUnit: user === "cloud" ? "lb" : "kg",
    recordedTimeZone: null,
    isLegacy: false,
    issues: [],
    raw: {},
  };
}

test("check-in progress counts all matching records for the selected user", () => {
  const logs = [
    logAt("stone", "2026-08-03T01:00:00Z"),
    logAt("stone", "2026-08-03T12:00:00Z"),
    logAt("stone", "2026-08-02T12:00:00Z"),
    logAt("cloud", "2026-08-01T12:00:00Z"),
  ];

  const progress = calculateCheckInProgress(logs, "stone", {
    start: "2026-07-28",
    end: "2026-08-03",
  }, "exercise", "Asia/Taipei", 1, 1);

  assert.equal(progress.completedCount, 3);
  assert.equal(progress.targetCount, 7);
  assert.equal(progress.percentage, 3 / 7);
});

test("check-in days use the recorder's calendar time zone", () => {
  const sameInstant = logAt("cloud", "2026-08-03T02:00:00Z");

  assert.equal(
    calculateCheckInProgress([sameInstant], "cloud", {
      start: "2026-08-02",
      end: "2026-08-02",
    }, "exercise", "America/New_York", 1, 1).completedCount,
    1,
  );
});

test("check-in progress is calculated separately for each action", () => {
  const logs = [
    logAt("stone", "2026-08-03T01:00:00Z"),
    { ...logAt("stone", "2026-08-02T01:00:00Z"), actionId: "early_sleep" },
  ];
  const range = { start: "2026-08-01", end: "2026-08-03" };

  assert.equal(
    calculateCheckInProgress(
      logs,
      "stone",
      range,
      "exercise",
      "Asia/Taipei",
      1,
      1,
    ).completedCount,
    1,
  );
  assert.equal(
    calculateCheckInProgress(
      logs,
      "stone",
      range,
      "early_sleep",
      "Asia/Taipei",
      1,
      1,
    ).completedCount,
    1,
  );
  assert.equal(
    calculateCheckInProgress(
      logs,
      "stone",
      range,
      "cook",
      "Asia/Taipei",
      1,
      1,
    ).completedCount,
    0,
  );
});

test("a record's captured time zone overrides the current fallback zone", () => {
  const log = {
    ...logAt("cloud", "2026-08-03T02:00:00Z"),
    recordedTimeZone: "Asia/Taipei",
  };

  assert.equal(
    calculateCheckInProgress(
      [log],
      "cloud",
      { start: "2026-08-03", end: "2026-08-03" },
      "exercise",
      "America/New_York",
      1,
      1,
    ).completedCount,
    1,
  );
});

test("check-ins accumulate inside each goal period", () => {
  const logs = [
    logAt("stone", "2026-08-03T01:00:00Z"),
    logAt("stone", "2026-08-03T12:00:00Z"),
    logAt("stone", "2026-08-02T12:00:00Z"),
  ];

  const progress = calculateCheckInProgress(
    logs,
    "stone",
    { start: "2026-08-02", end: "2026-08-03" },
    "exercise",
    "Asia/Taipei",
    2,
    1,
  );

  assert.equal(progress.completedCount, 3);
  assert.equal(progress.targetCount, 4);
});

test("goal defaults and stored overrides are normalized", () => {
  assert.deepEqual(defaultCheckInGoals.exercise, {
    targetCount: 1,
    periodDays: 2,
  });
  assert.deepEqual(defaultCheckInGoals.study, {
    targetCount: 2,
    periodDays: 1,
  });
  assert.deepEqual(defaultCheckInGoals.cook, {
    targetCount: 2,
    periodDays: 1,
  });
  assert.deepEqual(defaultCheckInGoals.early_sleep, {
    targetCount: 1,
    periodDays: 1,
  });
  assert.deepEqual(defaultCheckInGoals.sugary_drink, {
    targetCount: 1,
    periodDays: 1,
  });

  const goals = normalizeCheckInGoals({
    exercise: { targetCount: 2, periodDays: 3 },
    cook: { targetCount: 0, periodDays: 0 },
  });
  assert.deepEqual(goals.exercise, { targetCount: 2, periodDays: 3 });
  assert.deepEqual(goals.cook, { targetCount: 2, periodDays: 1 });
  assert.deepEqual(goals.miss_you, { targetCount: 1, periodDays: 1 });
  assert.equal(hasCompleteCheckInGoals(goals), true);
  assert.equal(hasCompleteCheckInGoals({ exercise: goals.exercise }), false);
});

test("check-in catalog includes the renamed snack label and sugary drinks", () => {
  assert.equal(
    checkInActions.find((action) => action.id === "snack")?.label,
    "宵夜/點心",
  );
  assert.deepEqual(
    checkInActions.find((action) => action.id === "sugary_drink"),
    { id: "sugary_drink", icon: "🥤", label: "含糖飲料" },
  );
});

test("exercise completes one goal period with one check-in every two days", () => {
  const logs = [
    logAt("stone", "2026-08-01T01:00:00Z"),
    logAt("stone", "2026-08-03T01:00:00Z"),
  ];

  const progress = calculateCheckInProgress(
    logs,
    "stone",
    { start: "2026-08-01", end: "2026-08-04" },
    "exercise",
    "Asia/Taipei",
    1,
    2,
  );

  assert.equal(progress.completedCount, 2);
  assert.equal(progress.targetCount, 2);
});

test("twice-daily goals produce a weekly cumulative target of fourteen", () => {
  const logs = [
    logAt("stone", "2026-08-03T01:00:00Z"),
    logAt("stone", "2026-08-03T02:00:00Z"),
    logAt("stone", "2026-08-03T03:00:00Z"),
    logAt("stone", "2026-08-02T01:00:00Z"),
  ];

  const progress = calculateCheckInProgress(
    logs,
    "stone",
    { start: "2026-07-28", end: "2026-08-03" },
    "exercise",
    "Asia/Taipei",
    2,
    1,
  );

  assert.equal(progress.completedCount, 4);
  assert.equal(progress.targetCount, 14);
  assert.equal(progress.percentage, 4 / 14);
});

test("progress can exceed one hundred percent", () => {
  const logs = [
    logAt("stone", "2026-08-03T01:00:00Z"),
    logAt("stone", "2026-08-03T02:00:00Z"),
    logAt("stone", "2026-08-03T03:00:00Z"),
  ];

  const progress = calculateCheckInProgress(
    logs,
    "stone",
    { start: "2026-08-03", end: "2026-08-03" },
    "exercise",
    "Asia/Taipei",
    2,
    1,
  );

  assert.equal(progress.completedCount, 3);
  assert.equal(progress.targetCount, 2);
  assert.equal(progress.percentage, 1.5);
});

test("rolling ranges include today and the requested number of days", () => {
  assert.deepEqual(
    getRollingDateRange(
      Date.parse("2026-08-03T12:00:00Z"),
      7,
      "Asia/Taipei",
    ),
    { start: "2026-07-28", end: "2026-08-03" },
  );
});

test("memory timeline places the viewer above and partner below", () => {
  const stoneLog = logAt("stone", "2026-08-03T01:00:00Z");
  const cloudLog = logAt("cloud", "2026-08-03T02:00:00Z");
  const timeline = createSevenDayMemoryTimeline(
    [stoneLog, cloudLog],
    "stone",
    Date.parse("2026-08-03T12:00:00Z"),
    "Asia/Taipei",
  );

  assert.equal(timeline.length, 7);
  assert.equal(timeline[0].dateKey, "2026-07-28");
  assert.equal(timeline[6].dateKey, "2026-08-03");
  assert.deepEqual(timeline[6].currentUserLogs.map((log) => log.id), [
    stoneLog.id,
  ]);
  assert.deepEqual(timeline[6].partnerLogs.map((log) => log.id), [
    cloudLog.id,
  ]);
});

test("memory timeline uses the viewer's display time zone", () => {
  const cloudLog = logAt("cloud", "2026-08-03T02:00:00Z");
  const timeline = createSevenDayMemoryTimeline(
    [cloudLog],
    "cloud",
    Date.parse("2026-08-03T12:00:00Z"),
    "America/New_York",
  );

  assert.equal(timeline.at(-2)?.dateKey, "2026-08-02");
  assert.equal(timeline.at(-2)?.currentUserLogs.length, 1);
  assert.deepEqual(formatTimelineDate("2026-08-03"), {
    weekday: "週一",
    date: "08/03",
  });
});

test("expanded day logs keep exact chronological order across users", () => {
  const first = logAt("cloud", "2026-08-03T01:00:00Z");
  const second = logAt("stone", "2026-08-03T02:00:00Z");
  const third = logAt("cloud", "2026-08-03T03:00:00Z");
  const [day] = createSevenDayMemoryTimeline(
    [third, first, second],
    "stone",
    Date.parse("2026-08-03T12:00:00Z"),
    "Asia/Taipei",
  ).slice(-1);

  assert.deepEqual(getOrderedMemoryDayLogs(day).map((log) => log.id), [
    first.id,
    second.id,
    third.id,
  ]);
});
