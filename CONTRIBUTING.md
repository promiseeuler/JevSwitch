# Contributing

JevSwitch is intentionally small. Please keep changes aligned with the core flow: discover bounded decisions, measure them on real data, and generate reviewable Jev migrations.

## Development

```bash
npm install
npm run check
```

When adding a scanner heuristic, include a focused fixture/test and prefer false negatives over noisy false positives.
