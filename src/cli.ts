#!/usr/bin/env node
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { scanProject } from "./scanner.js";
import { loadConfig, getDecision, DEFAULT_CONFIG } from "./config.js";
import { benchmarkDecision, loadDataset } from "./benchmark.js";
import { writeMigration } from "./apply.js";
import { printBenchmark, printScan } from "./format.js";

type Flags = Record<string, string | boolean>;

function parseArgs(args: string[]): { command?: string; positionals: string[]; flags: Flags } {
  const [command, ...rest] = args;
  const positionals: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (!token.startsWith("--")) { positionals.push(token); continue; }
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith("--")) { flags[key] = next; i++; }
    else flags[key] = true;
  }
  return { command, positionals, flags };
}

function flagString(flags: Flags, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

function help(): void {
  console.log(`JevSwitch v0.1.0\n\nUsage:\n  jevswitch scan [path] [--json] [--write [path]]\n  jevswitch init [--force]\n  jevswitch test <decision> --data <file> [--config <file>] [--model <name>] [--json]\n  jevswitch apply <decision> [--config <file>] [--out <file>]\n`);
}

async function main(): Promise<void> {
  const { command, positionals, flags } = parseArgs(process.argv.slice(2));
  if (!command || command === "help" || command === "--help" || command === "-h") { help(); return; }
  if (command === "--version" || command === "-V") { console.log("0.1.0"); return; }

  if (command === "scan") {
    const report = await scanProject(positionals[0] ?? ".");
    if (flags.write !== undefined) {
      const requested = flagString(flags, "write");
      const out = resolve(requested ?? ".jevswitch/scan.json");
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, JSON.stringify(report, null, 2) + "\n", "utf8");
      console.error(`saved ${out}`);
    }
    if (flags.json) console.log(JSON.stringify(report, null, 2)); else printScan(report);
    return;
  }

  if (command === "init") {
    const path = resolve(DEFAULT_CONFIG);
    if (!flags.force) {
      try { await access(path); throw new Error(`${DEFAULT_CONFIG} already exists. Use --force to replace it.`); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    const starter = {
      model: "jev-latest",
      decisions: {
        "ticket-category": {
          type: "choice",
          instructions: "What is this support ticket mainly about?",
          criteria: {
            billing: "Billing, payment, charge, or refund issue",
            technical: "Bug, integration, or product malfunction",
            sales: "Pricing, purchasing, or sales enquiry",
            other: "None of the other categories clearly fit"
          }
        }
      }
    };
    await writeFile(path, JSON.stringify(starter, null, 2) + "\n", "utf8");
    console.log(`created ${path}`);
    return;
  }

  if (command === "test") {
    const name = positionals[0];
    const data = flagString(flags, "data");
    if (!name || !data) throw new Error("Usage: jevswitch test <decision> --data <file>");
    const config = await loadConfig(flagString(flags, "config") ?? DEFAULT_CONFIG);
    const spec = getDecision(config, name);
    const rows = await loadDataset(data);
    const summary = await benchmarkDecision(name, spec, rows, { model: flagString(flags, "model") ?? spec.model ?? config.model });
    if (flags.json) console.log(JSON.stringify(summary, null, 2)); else printBenchmark(summary);
    return;
  }

  if (command === "apply") {
    const name = positionals[0];
    if (!name) throw new Error("Usage: jevswitch apply <decision>");
    const config = await loadConfig(flagString(flags, "config") ?? DEFAULT_CONFIG);
    const spec = getDecision(config, name);
    const output = flagString(flags, "out") ?? `.jevswitch/generated/${name}.ts`;
    const path = await writeMigration(name, spec, output, config.model);
    console.log(`generated ${path}`);
    console.log("Review the generated file before replacing an existing production call.");
    return;
  }

  throw new Error(`Unknown command "${command}". Run jevswitch --help.`);
}

main().catch((error) => {
  console.error(`JevSwitch: ${(error as Error).message}`);
  process.exitCode = 1;
});
