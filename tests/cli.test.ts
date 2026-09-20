import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

function run(args: string[], cwd = process.cwd()) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `command failed: node ${cli} ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

test("CLI scan identifies the included OpenAI example as a Jev choice candidate", () => {
  const result = run(["scan", "examples"]);
  assert.match(result.stdout, /candidate: choice/);
  assert.match(result.stdout, /openai/);
});

test("CLI init and apply generate a reviewable TypeSafe migration", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jevswitch-cli-"));

  run(["init"], dir);
  const config = await readFile(join(dir, "jevswitch.config.json"), "utf8");
  assert.match(config, /"ticket-category"/);

  run(["apply", "ticket-category", "--out", "ticket-category.ts"], dir);
  const generated = await readFile(join(dir, "ticket-category.ts"), "utf8");

  assert.match(generated, /@typesafe-ai\/sdk/);
  assert.match(generated, /TypeSafeClient/);
  assert.match(generated, /systemOne/);
  assert.match(generated, /ticketCategory/);
});
