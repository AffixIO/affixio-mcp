import { homedir } from "node:os";
import { join } from "node:path";

function csv(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function numOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function loadConfig(env = process.env) {
  const home =
    env.AFFIX_MCP_HOME ||
    env.AFFIX_OPERATOR_DIR ||
    join(homedir(), ".affix-mcp");
  return {
    home,
    apiKey: env.AFFIX_API_KEY || "local_operator",
    apiBase: env.AFFIX_API_BASE || undefined,
    proofMode: "hmac",
    allowedTools: csv(env.AFFIX_MCP_ALLOWED_TOOLS),
    maxAmount: numOrNull(env.AFFIX_MCP_MAX_AMOUNT),
    currency: String(env.AFFIX_MCP_CURRENCY || "GBP").toUpperCase(),
    blockedPatterns:
      env.AFFIX_MCP_BLOCKED_PATTERNS === undefined
        ? ["sk_live_", "AKIA", "PRIVATE KEY"]
        : csv(env.AFFIX_MCP_BLOCKED_PATTERNS),
    defaultAgentId: env.AFFIX_MCP_AGENT_ID || "agent:local",
    store: {
      proofs: join(home, "proofs.json"),
      queue: join(home, "offline-queue.json"),
      licence: join(home, "licence.json"),
      stats: join(home, "stats.json"),
      spend: join(home, "spend"),
      codeUses: join(home, "code-uses.json"),
      signingKeys: join(home, "secrets", "mldsa65.json"),
      hmacSecret: join(home, "secrets", "hmac.secret"),
    },
  };
}
