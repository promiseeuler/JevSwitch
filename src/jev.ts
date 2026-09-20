import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import type { DecisionSpec } from "./types.js";

export interface DecisionResult {
  prediction: string | boolean | number;
  confidence?: number;
  raw: unknown;
}

export function questionFor(spec: DecisionSpec) {
  if (spec.type === "choice") return choice(spec.instructions, spec.criteria);
  if (spec.type === "noul") return noul(spec.instructions, spec.criteria);
  return score(spec.instructions, spec.criteria);
}

export async function runDecision(
  spec: DecisionSpec,
  state: unknown,
  options: { apiKey?: string; model?: string; client?: TypeSafeClient } = {},
): Promise<DecisionResult> {
  const client = options.client ?? new TypeSafeClient({ apiKey: options.apiKey, defaultModel: options.model ?? spec.model });
  const question = questionFor(spec);
  const response = await client.systemOne({
    state: state as never,
    model: options.model ?? spec.model,
    questions: { decision: question } as never,
  });
  const answer = (response.answers as Record<string, any>).decision;
  if (spec.type === "choice") {
    return { prediction: answer.choice, confidence: answer.confidence, raw: answer };
  }
  if (spec.type === "noul") {
    const threshold = spec.threshold ?? 0.5;
    return { prediction: answer.noul >= threshold, confidence: Math.abs(answer.noul - 0.5) * 2, raw: answer };
  }
  return { prediction: answer.score, confidence: answer.confidence, raw: answer };
}
