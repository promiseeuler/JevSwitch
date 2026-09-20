import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { scanProject } from "../src/scanner.js";

test("scanProject finds a structured OpenAI classification call", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jevswitch-"));
  await writeFile(join(dir, "app.ts"), `
    import OpenAI from "openai";
    const openai = new OpenAI();
    openai.responses.parse({
      input: "Classify this ticket by category",
      text: { format: zodTextFormat(z.object({category: z.enum(["billing", "tech"])}), "x") }
    });
  `);
  const report = await scanProject(dir);
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0]?.provider, "openai");
  assert.equal(report.candidates[0]?.suggestedPrimitive, "choice");
  assert.equal(report.candidates[0]?.confidence, "high");
});

test("scanProject ignores ordinary non-AI calls", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jevswitch-"));
  await writeFile(join(dir, "app.ts"), `console.log("classify this");`);
  const report = await scanProject(dir);
  assert.equal(report.candidates.length, 0);
});
