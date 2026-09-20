import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { DecisionSpec, DatasetRow, BenchmarkRow, BenchmarkSummary } from "./types.js";

export async function loadDataset(path: string): Promise<DatasetRow[]> {
  const text = await readFile(path, "utf8");
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as DatasetRow; }
    catch (error) { throw new Error(`Invalid JSONL at line ${index + 1}: ${(error as Error).message}`); }
  });
  for (const [index, row] of rows.entries()) {
    if (!("state" in row) || !("expected" in row)) throw new Error(`Dataset line ${index + 1} needs state and expected.`);
  }
  return rows;
}

function isCorrect(spec: DecisionSpec, prediction: string | boolean | number, expected: string | boolean | number): { correct: boolean; absoluteError?: number } {
  if (spec.type === "score") {
    if (typeof prediction !== "number" || typeof expected !== "number") return { correct: false };
    const absoluteError = Math.abs(prediction - expected);
    return { correct: absoluteError <= (spec.tolerance ?? 0.5), absoluteError };
  }
  return { correct: prediction === expected };
}

export function bestNoulThreshold(probabilities: Array<{ p: number; expected: boolean }>): number | undefined {
  if (probabilities.length === 0) return undefined;
  let best = { threshold: 0.5, accuracy: -1 };
  for (let i = 5; i <= 95; i += 1) {
    const threshold = i / 100;
    const accuracy = probabilities.filter((x) => (x.p >= threshold) === x.expected).length / probabilities.length;
    if (accuracy > best.accuracy || (accuracy === best.accuracy && Math.abs(threshold - 0.5) < Math.abs(best.threshold - 0.5))) best = { threshold, accuracy };
  }
  return best.threshold;
}

export function summarizeBenchmark(decision: string, spec: DecisionSpec, rows: BenchmarkRow[], noulProbabilities: Array<{p: number; expected: boolean}> = []): BenchmarkSummary {
  const avgLatency = rows.length ? rows.reduce((s, r) => s + r.latencyMs, 0) / rows.length : 0;
  const confidenceRows = rows.filter((r) => typeof r.confidence === "number");
  const averageConfidence = confidenceRows.length ? confidenceRows.reduce((s, r) => s + (r.confidence ?? 0), 0) / confidenceRows.length : undefined;

  let primaryMetric: string;
  let primaryValue: number;
  if (spec.type === "score") {
    primaryMetric = "mean absolute error";
    const withError = rows.filter((r) => typeof r.absoluteError === "number");
    primaryValue = withError.length ? withError.reduce((s, r) => s + (r.absoluteError ?? 0), 0) / withError.length : 0;
  } else {
    primaryMetric = "accuracy";
    primaryValue = rows.length ? rows.filter((r) => r.correct).length / rows.length : 0;
  }

  const baselineRows = rows.filter((r) => r.baseline);
  let baseline: BenchmarkSummary["baseline"];
  if (baselineRows.length) {
    const latency = baselineRows.filter((r) => typeof r.baseline?.latencyMs === "number");
    const costs = baselineRows.filter((r) => typeof r.baseline?.costUsd === "number");
    if (spec.type === "score") {
      const errors = baselineRows.filter((r) => typeof r.baseline?.prediction === "number" && typeof r.expected === "number").map((r) => Math.abs((r.baseline?.prediction as number) - (r.expected as number)));
      baseline = {
        samples: baselineRows.length,
        meanAbsoluteError: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : undefined,
        averageLatencyMs: latency.length ? latency.reduce((s, r) => s + (r.baseline?.latencyMs ?? 0), 0) / latency.length : undefined,
        averageCostUsd: costs.length ? costs.reduce((s, r) => s + (r.baseline?.costUsd ?? 0), 0) / costs.length : undefined,
      };
    } else {
      baseline = {
        samples: baselineRows.length,
        accuracy: baselineRows.filter((r) => r.baseline?.prediction === r.expected).length / baselineRows.length,
        averageLatencyMs: latency.length ? latency.reduce((s, r) => s + (r.baseline?.latencyMs ?? 0), 0) / latency.length : undefined,
        averageCostUsd: costs.length ? costs.reduce((s, r) => s + (r.baseline?.costUsd ?? 0), 0) / costs.length : undefined,
      };
    }
  }

  return {
    decision, type: spec.type, samples: rows.length, primaryMetric, primaryValue,
    averageLatencyMs: avgLatency, averageConfidence,
    recommendedThreshold: spec.type === "noul" ? bestNoulThreshold(noulProbabilities) : undefined,
    baseline, rows,
  };
}

export async function benchmarkDecision(
  decision: string,
  spec: DecisionSpec,
  dataset: DatasetRow[],
  options: { apiKey?: string; model?: string } = {},
): Promise<BenchmarkSummary> {
  const { runDecision } = await import("./jev.js");
  const rows: BenchmarkRow[] = [];
  const noulProbabilities: Array<{ p: number; expected: boolean }> = [];
  for (const sample of dataset) {
    const started = performance.now();
    const result = await runDecision(spec, sample.state, options);
    const latencyMs = performance.now() - started;
    const { correct, absoluteError } = isCorrect(spec, result.prediction, sample.expected);
    if (spec.type === "noul") {
      const raw = result.raw as { noul?: number };
      if (typeof raw.noul === "number" && typeof sample.expected === "boolean") noulProbabilities.push({ p: raw.noul, expected: sample.expected });
    }
    rows.push({ expected: sample.expected, prediction: result.prediction, confidence: result.confidence, latencyMs, correct, absoluteError, baseline: sample.baseline });
  }
  return summarizeBenchmark(decision, spec, rows, noulProbabilities);
}
