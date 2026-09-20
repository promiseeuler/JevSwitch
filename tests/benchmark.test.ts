import test from "node:test";
import assert from "node:assert/strict";
import { bestNoulThreshold, summarizeBenchmark } from "../src/benchmark.js";

test("bestNoulThreshold finds a useful split", () => {
  const threshold = bestNoulThreshold([
    { p: 0.95, expected: true }, { p: 0.81, expected: true },
    { p: 0.58, expected: false }, { p: 0.12, expected: false },
  ]);
  assert.ok(threshold !== undefined && threshold > 0.58 && threshold <= 0.81);
});

test("summarizeBenchmark compares a supplied baseline", () => {
  const summary = summarizeBenchmark("route", {
    type: "choice", instructions: "route", criteria: { a: null, b: null },
  }, [
    { expected: "a", prediction: "a", confidence: 0.9, latencyMs: 100, correct: true, baseline: { prediction: "a", latencyMs: 900, costUsd: 0.001 } },
    { expected: "b", prediction: "a", confidence: 0.6, latencyMs: 120, correct: false, baseline: { prediction: "b", latencyMs: 1000, costUsd: 0.001 } },
  ]);
  assert.equal(summary.primaryMetric, "accuracy");
  assert.equal(summary.primaryValue, 0.5);
  assert.equal(summary.baseline?.accuracy, 1);
});
