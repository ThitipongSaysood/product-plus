// Translation through a logged-in `claude` CLI on this host instead of an API key.
//
// Why it is shaped this way: every `claude -p` invocation re-sends Claude Code's own system prompt and
// tool definitions (~33k tokens measured on 2026-09-24) and thinks before answering, so the cost is per
// INVOCATION, not per title — two titles cost $0.039. Batch large (CLI_BATCH) and the overhead amortises.
//
// The agent is started with no tools and no MCP servers: this process is a web server, and the CLI must
// only translate text, never touch the filesystem or the network on its own.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Measured 2026-09-24 with the skill loaded: 10 titles = $0.029 / 19s. Cost is mostly per invocation, but
// quality falls apart past ~50 titles in one call (the model turns terse and literal), so this is a
// compromise — and batches run concurrently, which is what actually fixes the wall-clock time.
export const CLI_BATCH = 40;
export const CLI_CONCURRENCY = 3;

const here = path.dirname(fileURLToPath(import.meta.url));
/** src/jobs in dev, dist/jobs after a build — both are two levels under apps/api. */
export const PLUGIN_DIR = path.resolve(here, "../../claude-plugin");
/** Skills shipped with this plugin. The name is what a prompt invokes as `/product-plus:<name>`. */
export const SKILLS = {
  translate: "translate-listing-titles",
  categorize: "categorize-listings",
} as const;
export type SkillName = (typeof SKILLS)[keyof typeof SKILLS];

export const skillRef = (name: SkillName) => `product-plus:${name}`;
export const skillPath = (name: SkillName) => path.join(PLUGIN_DIR, `skills/${name}/SKILL.md`);

/** True when the skill shipped with this deploy. It lives OUTSIDE dist/ (tsc does not copy .md), so a
 *  deploy that uploads only dist/ loses it — check before a run instead of failing with a raw ENOENT. */
export function skillPresent(name: SkillName): boolean {
  return existsSync(skillPath(name));
}

/** The skill body is the single source of truth for how a job behaves; the sdk backend sends it as a
 *  system prompt so both backends follow the same rules. Frontmatter is stripped. */
export function skillBody(name: SkillName): string {
  const raw = readFileSync(skillPath(name), "utf8");
  return raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}
const CLI_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT = 4 * 1024 * 1024;

/** A bare command name or an absolute path — never a shell string, since this is spawned by the server. */
export function validCliPath(p: string): boolean {
  return /^[\w.-]+$/.test(p) || (p.startsWith("/") && !/[\s;&|`$<>(){}[\]'"\\*?]/.test(p));
}

export type CliResult = { text: string; costUsd: number | null };

/** The `--output-format json` envelope. `result` is the assistant's text, often inside a ```json fence. */
export function parseCliEnvelope(stdout: string): CliResult {
  const env = JSON.parse(stdout) as {
    type?: string;
    subtype?: string;
    is_error?: boolean;
    result?: unknown;
    total_cost_usd?: unknown;
    api_error_status?: unknown;
  };
  if (env.is_error || (env.subtype && env.subtype !== "success")) {
    throw new Error(`claude cli: ${String(env.subtype ?? "error")}${env.api_error_status ? ` (${String(env.api_error_status)})` : ""}`);
  }
  if (typeof env.result !== "string") throw new Error("claude cli: no result in envelope");
  return { text: env.result, costUsd: typeof env.total_cost_usd === "number" ? env.total_cost_usd : null };
}

/** Pull the JSON object out of an answer that may be wrapped in a ``` fence or padded with prose. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("claude cli: no JSON object in the answer");
  return JSON.parse(body.slice(start, end + 1));
}

/** Run one prompt through the CLI. The prompt goes on stdin so nothing user-supplied reaches argv. */
export async function runClaudeCli(bin: string, model: string, prompt: string): Promise<CliResult> {
  if (!validCliPath(bin)) throw new Error("claude cli: invalid binary path");
  const args = [
    "-p",
    "--output-format", "json",
    "--model", model,
    "--allowed-tools", "", // text in, text out: no file, shell or web access, and no tool to invoke another skill
    "--strict-mcp-config", // ignore whatever MCP servers the host has configured
    // Adds our plugin; it does NOT replace what the host account already has. Measured on a dev machine
    // 2026-09-24: the model also listed the operator's personal skills (scrutinize, frontend-design,
    // figma:*). --bare is the only flag that drops them and it forces ANTHROPIC_API_KEY, which is the one
    // thing this backend exists to avoid. So: keep the server's `claude` account free of extra skills.
    "--plugin-dir", PLUGIN_DIR,
  ];
  return await new Promise<CliResult>((resolve, reject) => {
    const child = spawn(bin, args, { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done(() => reject(new Error(`claude cli: timed out after ${CLI_TIMEOUT_MS / 1000}s`)));
    }, CLI_TIMEOUT_MS);

    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
      if (out.length > MAX_OUTPUT) {
        child.kill("SIGKILL");
        done(() => reject(new Error("claude cli: output too large")));
      }
    });
    child.stderr.on("data", (d: Buffer) => { err = (err + d.toString()).slice(-2000); });
    child.on("error", (e) => done(() => reject(new Error(`claude cli: cannot run ${bin} (${e.message})`))));
    child.on("close", (code) =>
      done(() => {
        if (code !== 0) return reject(new Error(`claude cli: exit ${code}${err ? ` — ${err.trim().slice(0, 200)}` : ""}`));
        try {
          resolve(parseCliEnvelope(out));
        } catch (e) {
          reject(e as Error);
        }
      }),
    );
    child.stdin.end(prompt, "utf8");
  });
}

/** `claude --version` — used by the settings "test connection" button and before a translate run. */
export async function claudeCliVersion(bin: string): Promise<string> {
  if (!validCliPath(bin)) throw new Error("invalid binary path");
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(bin, ["--version"], { cwd: tmpdir(), stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("timed out")); }, 30_000);
    child.stdout.on("data", (d: Buffer) => { out = (out + d.toString()).slice(0, 200); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 && out.trim() ? resolve(out.trim()) : reject(new Error(`exit ${code}`));
    });
  });
}
