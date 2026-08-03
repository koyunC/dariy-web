import assert from "node:assert/strict";
import test from "node:test";

import { isWithinRecentHistory } from "../src/lib/history.ts";
import {
  calculateCheckInProgress,
  getRollingDateRange,
} from "../src/lib/check-in-stats.ts";
import type { TimeCapsuleLog } from "../src/lib/logs.ts";
import {
  defaultDailyTargets,
  hasCompleteDailyTargets,
  normalizeDailyTargets,
} from "../src/lib/preference-rules.ts";
import {
  formatTimestampForUser,
  formatWeightContent,
} from "../src/lib/user-data.ts";

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

test("check-in progress counts distinct days for the selected user", () => {
  const logs = [
    logAt("stone", "2026-08-03T01:00:00Z"),
    logAt("stone", "2026-08-03T12:00:00Z"),
    logAt("stone", "2026-08-02T12:00:00Z"),
    logAt("cloud", "2026-08-01T12:00:00Z"),
  ];

  const progress = calculateCheckInProgress(logs, "stone", {
    start: "2026-07-28",
    end: "2026-08-03",
  }, "exercise", "Asia/Taipei", 1);

  assert.equal(progress.checkedInDays, 2);
  assert.equal(progress.totalDays, 7);
  assert.equal(progress.percentage, 2 / 7);
});

test("check-in days use the recorder's calendar time zone", () => {
  const sameInstant = logAt("cloud", "2026-08-03T02:00:00Z");

  assert.equal(
    calculateCheckInProgress([sameInstant], "cloud", {
      start: "2026-08-02",
      end: "2026-08-02",
    }, "exercise", "America/New_York", 1).checkedInDays,
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
    ).checkedInDays,
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
    ).checkedInDays,
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
    ).checkedInDays,
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
    ).checkedInDays,
    1,
  );
});

test("twice-daily targets require two check-ins on the same day", () => {
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
  );

  assert.equal(progress.checkedInDays, 1);
  assert.equal(progress.totalDays, 2);
});

test("daily target defaults and stored overrides are normalized", () => {
  assert.equal(defaultDailyTargets.exercise, 2);
  assert.equal(defaultDailyTargets.study, 2);
  assert.equal(defaultDailyTargets.cook, 2);
  assert.equal(defaultDailyTargets.early_sleep, 1);

  const targets = normalizeDailyTargets({ exercise: 3, cook: 0 });
  assert.equal(targets.exercise, 3);
  assert.equal(targets.cook, 2);
  assert.equal(targets.miss_you, 1);
  assert.equal(hasCompleteDailyTargets(targets), true);
  assert.equal(hasCompleteDailyTargets({ exercise: 2 }), false);
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
