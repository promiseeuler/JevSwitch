export type Primitive = "choice" | "noul" | "score" | "unknown";
export type CandidateConfidence = "high" | "medium" | "low";

export interface ScanCandidate {
  file: string;
  line: number;
  column: number;
  provider: "openai" | "anthropic" | "vercel-ai" | "unknown";
  api: string;
  confidence: CandidateConfidence;
  suggestedPrimitive: Primitive;
  reasons: string[];
  snippet: string;
}

export interface ScanReport {
  root: string;
  scannedFiles: number;
  candidates: ScanCandidate[];
}

interface BaseDecisionSpec {
  instructions: string;
  description?: string;
  model?: string;
}

export interface ChoiceDecisionSpec extends BaseDecisionSpec {
  type: "choice";
  criteria: Record<string, string | null>;
}

export interface NoulDecisionSpec extends BaseDecisionSpec {
  type: "noul";
  criteria?: {
    true?: string | null;
    false?: string | null;
  };
  threshold?: number;
}

export interface ScoreDecisionSpec extends BaseDecisionSpec {
  type: "score";
  criteria: [string | null, string | null, ...(string | null)[]];
  tolerance?: number;
}

export type DecisionSpec = ChoiceDecisionSpec | NoulDecisionSpec | ScoreDecisionSpec;

export interface JevSwitchConfig {
  model?: string;
  decisions: Record<string, DecisionSpec>;
}

export interface BaselineObservation {
  prediction: string | boolean | number;
  latencyMs?: number;
  costUsd?: number;
}

export interface DatasetRow {
  state: unknown;
  expected: string | boolean | number;
  baseline?: BaselineObservation;
}

export interface BenchmarkRow {
  expected: string | boolean | number;
  prediction: string | boolean | number;
  confidence?: number;
  latencyMs: number;
  correct: boolean;
  absoluteError?: number;
  baseline?: BaselineObservation;
}

export interface BenchmarkSummary {
  decision: string;
  type: Exclude<Primitive, "unknown">;
  samples: number;
  primaryMetric: string;
  primaryValue: number;
  averageLatencyMs: number;
  averageConfidence?: number;
  recommendedThreshold?: number;
  baseline?: {
    samples: number;
    accuracy?: number;
    meanAbsoluteError?: number;
    averageLatencyMs?: number;
    averageCostUsd?: number;
  };
  rows: BenchmarkRow[];
}
