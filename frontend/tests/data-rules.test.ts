import assert from "node:assert/strict";
import test from "node:test";

import { isWithinRecentHistory } from "../src/lib/history.ts";
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
