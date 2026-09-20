import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DecisionSpec, JevSwitchConfig } from "./types.js";

export const DEFAULT_CONFIG = "jevswitch.config.json";

function assertDecision(name: string, value: unknown): asserts value is DecisionSpec {
  if (!value || typeof value !== "object") throw new Error(`Decision "${name}" must be an object.`);
  const d = value as Record<string, unknown>;
  if (!['choice', 'noul', 'score'].includes(String(d.type))) {
    throw new Error(`Decision "${name}" has unsupported type "${String(d.type)}".`);
  }
  if (typeof d.instructions !== "string" || d.instructions.trim() === "") {
    throw new Error(`Decision "${name}" must have non-empty instructions.`);
  }
  if (d.type === "choice") {
    if (!d.criteria || typeof d.criteria !== "object" || Array.isArray(d.criteria) || Object.keys(d.criteria).length < 2) {
      throw new Error(`Choice decision "${name}" needs at least two named criteria.`);
    }
  }
  if (d.type === "score") {
    if (!Array.isArray(d.criteria) || d.criteria.length < 2) {
      throw new Error(`Score decision "${name}" needs at least two ordered criteria.`);
    }
  }
  if (d.type === "noul" && d.threshold !== undefined) {
    if (typeof d.threshold !== "number" || d.threshold < 0 || d.threshold > 1) {
      throw new Error(`Noul decision "${name}" threshold must be between 0 and 1.`);
    }
  }
}

export async function loadConfig(path = DEFAULT_CONFIG): Promise<JevSwitchConfig> {
  const fullPath = resolve(path);
  const raw = await readFile(fullPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("Config must be a JSON object.");
  const cfg = parsed as Record<string, unknown>;
  if (!cfg.decisions || typeof cfg.decisions !== "object" || Array.isArray(cfg.decisions)) {
    throw new Error("Config must include a decisions object.");
  }
  for (const [name, decision] of Object.entries(cfg.decisions as Record<string, unknown>)) {
    assertDecision(name, decision);
  }
  return parsed as JevSwitchConfig;
}

export function getDecision(config: JevSwitchConfig, name: string): DecisionSpec {
  const decision = config.decisions[name];
  if (!decision) {
    const available = Object.keys(config.decisions);
    throw new Error(`Unknown decision "${name}".${available.length ? ` Available: ${available.join(", ")}` : ""}`);
  }
  return decision;
}
