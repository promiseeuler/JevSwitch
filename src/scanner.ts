import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import ts from "typescript";
import type { CandidateConfidence, Primitive, ScanCandidate, ScanReport } from "./types.js";

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const IGNORE_DIRS = new Set(["node_modules", "dist", "build", ".git", ".next", "coverage", ".turbo"]);

const decisionWords = /\b(classif(?:y|ication)|categor(?:y|ize)|route|routing|choose|select|decide|decision|intent|sentiment|label)\b/i;
const booleanWords = /\b(should|safe|unsafe|allow|deny|block|urgent|valid|fraud|spam|toxic|true|false|yes|no)\b/i;
const scoreWords = /\b(score|rating|rate|risk|severity|priority|quality|frustration|likelihood)\b/i;

async function collectCodeFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) out.push(...await collectCodeFiles(resolve(dir, entry.name)));
    } else if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name))) {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".cjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function inferPrimitive(text: string): Primitive {
  if (/z\.boolean\s*\(|boolean|yes\s*\/\s*no|true\s*\/\s*false/i.test(text) || booleanWords.test(text)) return "noul";
  if (/z\.(number|int)\s*\(|score|rating|severity|priority/i.test(text) || scoreWords.test(text)) return "score";
  if (/z\.enum\s*\(|enum\s*[:(]|literal\s*\(|oneof|classification|categor|routing/i.test(text) || decisionWords.test(text)) return "choice";
  return "unknown";
}

function providerFor(api: string, imports: Set<string>): ScanCandidate["provider"] {
  if (imports.has("openai") && /(responses|chat\.completions)/.test(api)) return "openai";
  if (imports.has("@anthropic-ai/sdk") && /messages\.create/.test(api)) return "anthropic";
  if (imports.has("ai") && /\b(generateObject|generateText)\b/.test(api)) return "vercel-ai";
  if (/(openai|responses|chat\.completions)/i.test(api)) return "openai";
  if (/(anthropic|messages\.create)/i.test(api)) return "anthropic";
  if (/\b(generateObject|generateText)\b/.test(api)) return "vercel-ai";
  return "unknown";
}

function isAiCall(api: string, provider: ScanCandidate["provider"]): boolean {
  if (provider === "openai") return /(responses\.(create|parse)|chat\.completions\.create)/.test(api);
  if (provider === "anthropic") return /messages\.create/.test(api);
  if (provider === "vercel-ai") return /\b(generateObject|generateText)\b/.test(api);
  return false;
}

function rank(text: string, api: string, primitive: Primitive): { confidence: CandidateConfidence; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;
  const structured = /(response_format|json_schema|zodTextFormat|z\.object|z\.enum|z\.boolean|z\.number|schema\s*:|output\s*:)/i.test(text);
  if (structured) { points += 2; reasons.push("structured output/schema detected"); }
  if (primitive !== "unknown") { points += 2; reasons.push(`looks like a bounded ${primitive} decision`); }
  if (/responses\.parse|generateObject/.test(api)) { points += 1; reasons.push("API is commonly used for structured decisions"); }
  if (/tools?\s*:|tool_choice/i.test(text)) { points += 1; reasons.push("tool/schema constrained output detected"); }
  if (/summar(?:y|ize)|write|draft|explain|generate\s+(text|copy)|creative/i.test(text) && primitive === "unknown") {
    points -= 2;
    reasons.push("appears generative rather than decision-only");
  }
  return { confidence: points >= 4 ? "high" : points >= 2 ? "medium" : "low", reasons };
}

function importSources(source: ts.SourceFile): Set<string> {
  const sources = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      sources.add(statement.moduleSpecifier.text);
    }
    if (ts.isVariableStatement(statement)) {
      const t = statement.getText(source);
      for (const pkg of ["openai", "@anthropic-ai/sdk", "ai"]) {
        if (t.includes(`require("\${pkg}")`) || t.includes(`require('\${pkg}')`)) sources.add(pkg);
      }
    }
  }
  return sources;
}

export async function scanProject(root = process.cwd()): Promise<ScanReport> {
  const absoluteRoot = resolve(root);
  const files = await collectCodeFiles(absoluteRoot);
  const candidates: ScanCandidate[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind(file));
    const imports = importSources(source);

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const api = node.expression.getText(source);
        const provider = providerFor(api, imports);
        if (isAiCall(api, provider)) {
          const full = node.getText(source);
          const primitive = inferPrimitive(full);
          const { confidence, reasons } = rank(full, api, primitive);
          const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
          candidates.push({
            file: relative(absoluteRoot, file),
            line: pos.line + 1,
            column: pos.character + 1,
            provider,
            api,
            confidence,
            suggestedPrimitive: primitive,
            reasons,
            snippet: full.length > 320 ? `${full.slice(0, 317)}...` : full,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  const rankValue = { high: 0, medium: 1, low: 2 } as const;
  candidates.sort((a, b) => rankValue[a.confidence] - rankValue[b.confidence] || a.file.localeCompare(b.file) || a.line - b.line);
  return { root: absoluteRoot, scannedFiles: files.length, candidates };
}
