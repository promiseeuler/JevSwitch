import type { BenchmarkSummary, ScanReport } from "./types.js";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function printScan(report: ScanReport): void {
  console.log(`\nJevSwitch scan  ${report.root}`);
  console.log(`${report.scannedFiles} files scanned · ${report.candidates.length} AI call${report.candidates.length === 1 ? "" : "s"} found\n`);
  if (!report.candidates.length) {
    console.log("No supported OpenAI, Anthropic, or Vercel AI SDK calls were detected.");
    return;
  }
  for (const c of report.candidates) {
    console.log(`${c.confidence.toUpperCase().padEnd(4)}  ${c.file}:${c.line}  ${c.provider}`);
    console.log(`      ${c.suggestedPrimitive === "unknown" ? "keep/review" : `candidate: ${c.suggestedPrimitive}`}`);
    if (c.reasons.length) console.log(`      ${c.reasons.join(" · ")}`);
    console.log();
  }
}

export function printBenchmark(summary: BenchmarkSummary): void {
  console.log(`\nJevSwitch test · ${summary.decision}`);
  console.log(`${summary.samples} samples`);
  console.log(`${summary.primaryMetric}: ${summary.primaryMetric === "accuracy" ? pct(summary.primaryValue) : summary.primaryValue.toFixed(3)}`);
  console.log(`avg latency: ${summary.averageLatencyMs.toFixed(1)} ms`);
  if (summary.averageConfidence !== undefined) console.log(`avg confidence: ${pct(summary.averageConfidence)}`);
  if (summary.recommendedThreshold !== undefined) console.log(`recommended noul threshold: ${summary.recommendedThreshold.toFixed(2)}`);
  if (summary.baseline) {
    console.log("\nbaseline supplied in dataset");
    if (summary.baseline.accuracy !== undefined) console.log(`accuracy: ${pct(summary.baseline.accuracy)}`);
    if (summary.baseline.meanAbsoluteError !== undefined) console.log(`mean absolute error: ${summary.baseline.meanAbsoluteError.toFixed(3)}`);
    if (summary.baseline.averageLatencyMs !== undefined) console.log(`avg latency: ${summary.baseline.averageLatencyMs.toFixed(1)} ms`);
    if (summary.baseline.averageCostUsd !== undefined) console.log(`avg cost: $${summary.baseline.averageCostUsd.toFixed(6)}`);
  }
  console.log();
}
