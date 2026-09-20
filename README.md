# JevSwitch

**Find the LLM calls that should be Jev. Test them on your data. Switch the ones that make sense.**

JevSwitch is a local, open-source migration tool for [TypeSafe Jev](https://typesafe.ai/). It helps developers identify places where a generative model is being used only to make a bounded decision, benchmark that decision with Jev, and generate a migration using TypeSafe's official SDK.

JevSwitch is not a proxy and does not add another API key. Your `TYPESAFE_API_KEY` goes directly to TypeSafe through `@typesafe-ai/sdk`.

## Why

Many production LLM calls are not actually generative:

- classify a ticket
- choose a route
- decide whether an action is safe
- score risk or urgency
- answer a yes/no gate

Jev is designed for this kind of typed, probability-backed decision. The hard part for a developer is deciding **where it fits and whether it is good enough on their own workload**.

JevSwitch focuses on that migration loop:

```text
existing code → scan → define decision → test on your data → generate migration
```

## Status

`v0.1` is an MVP. The scanner is intentionally conservative and currently recognizes common OpenAI, Anthropic, and Vercel AI SDK call shapes in JavaScript/TypeScript projects.

It does **not** silently replace production code. `apply` generates a reviewable migration file.

## Requirements

- Node.js 20+
- A TypeSafe API key only when running a live `test`

## Install locally

```bash
npm install
npm run build
npm link
```

Then:

```bash
jevswitch --help
```

## 1. Scan a project

```bash
jevswitch scan .
```

Example output:

```text
JevSwitch scan  /your/project
42 files scanned · 3 AI calls found

HIGH  src/support.ts:18  openai
      candidate: choice
      structured output/schema detected · looks like a bounded choice decision

MED   src/guard.ts:41  anthropic
      candidate: noul
      looks like a bounded noul decision
```

Machine-readable output:

```bash
jevswitch scan . --json
jevswitch scan . --write
```

The scanner looks for evidence such as structured output schemas, enums, booleans, scoring rubrics, classification/routing language, and known SDK call shapes. A result is a **candidate**, not a claim that Jev is automatically better.

## 2. Define the decision

Create a starter config:

```bash
jevswitch init
```

Or write `jevswitch.config.json`:

```json
{
  "model": "jev-latest",
  "decisions": {
    "ticket-category": {
      "type": "choice",
      "instructions": "What is this support ticket mainly about?",
      "criteria": {
        "billing": "Billing, payment, charge, or refund issue",
        "technical": "Bug, integration, or product malfunction",
        "sales": "Pricing, purchasing, or sales enquiry",
        "other": "None of the other categories clearly fit"
      }
    }
  }
}
```

Supported Jev primitives map directly to TypeSafe:

- `choice` — one label from known alternatives
- `noul` — probability-backed yes/no decision
- `score` — ordered rubric with an expected score

## 3. Test on your own workload

Prepare JSONL:

```jsonl
{"state":{"ticket":"I was charged twice."},"expected":"billing"}
{"state":{"ticket":"OAuth callback fails with a 500."},"expected":"technical"}
```

Then:

```bash
export TYPESAFE_API_KEY="..."
jevswitch test ticket-category --data tickets.jsonl
```

For `choice` and `noul`, JevSwitch reports accuracy. For `score`, it reports mean absolute error. It also reports average observed request latency and Jev confidence where available.

For `noul`, labeled boolean data is used to suggest a probability threshold from `0.05` to `0.95`. Treat this as a starting point; production thresholds should reflect the cost of false positives and false negatives in your application.

### Compare with an existing model

You can attach baseline observations to each JSONL row:

```jsonl
{"state":{"ticket":"I was charged twice."},"expected":"billing","baseline":{"prediction":"billing","latencyMs":1180,"costUsd":0.00041}}
```

JevSwitch will summarize the supplied baseline beside Jev. Baseline cost/latency are data you measured; JevSwitch does not invent provider prices.

## 4. Generate the migration

```bash
jevswitch apply ticket-category
```

This writes:

```text
.jevswitch/generated/ticket-category.ts
```

The generated code imports the official TypeSafe SDK and calls `TypeSafeClient.systemOne()` directly. Review it and wire it into your application where appropriate.

Choose another output path with:

```bash
jevswitch apply ticket-category --out src/ai/ticket-category.ts
```

## Example

Try the scanner against the included example:

```bash
node dist/src/cli.js scan examples
```

Use the example config:

```bash
cp examples/jevswitch.config.json jevswitch.config.json
```

A live benchmark requires your own `TYPESAFE_API_KEY`:

```bash
node dist/src/cli.js test ticket-category --data examples/tickets.jsonl
```

## Design principles

**Local-first.** Source code, datasets, and credentials stay on the developer's machine unless the developer explicitly calls an external model API.

**Measure, don't assume.** JevSwitch should make it easy to compare behavior on the developer's workload rather than repeat headline benchmark numbers.

**Conservative migrations.** A scanner suggestion is not an automatic rewrite. Generated migrations are reviewable.

**Use Jev where Jev fits.** Generative tasks such as writing, summarization, code generation, and open-ended reasoning should not be forced into bounded decisions.

## Privacy

JevSwitch has no hosted backend in v0.1. `scan` and `apply` are local. `test` sends only the states/questions required for the benchmark to the TypeSafe API through the official SDK.

## Roadmap

- shadow mode for observing an existing application without changing behavior
- automatic import of traces/evals from common agent stacks
- richer OpenAI/Anthropic structured-output extraction
- false-positive / false-negative weighted threshold tuning
- CI regression checks across Jev model versions
- Python project scanning

## Not affiliated

JevSwitch is an independent open-source project and is not an official TypeSafe product.

## License

MIT
