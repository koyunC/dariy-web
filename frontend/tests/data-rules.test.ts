import assert from "node:assert/strict";
import test from "node:test";

import { isWithinRecentHistory } from "../src/lib/history.ts";
import {
  calculateCheckInProgress,
  getRollingDateRange,
} from "../src/lib/check-in-stats.ts";
import type { TimeCapsuleLog } from "../src/lib/logs.ts";
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
  });

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
    }).checkedInDays,
    1,
  );
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
