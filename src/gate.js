import { createHash } from "node:crypto";
import { attestAction, canonicalize, getSdk, sha256Hex } from "./attest.js";
import { loadConfig } from "./config.js";

export function argsDigest(args) {
  if (args === undefined || args === null) return sha256Hex("null");
  if (typeof args === "string" && /^[0-9a-f]{64}$/i.test(args.trim())) return args.trim().toLowerCase();
  return sha256Hex(canonicalize(args));
}

function normaliseToolName(tool) {
  const name = String(tool || "").trim();
  if (!name) throw new Error("tool_required");
  if (name.length > 256) throw new Error("tool_too_long");
  return name;
}

function failClosed(reason, extra = {}) {
  return {
    allowed: false,
    allow: false,
    decision: "deny",
    reason,
    signed: false,
    ...extra,
  };
}

export async function gateToolCall(input = {}, config = loadConfig()) {
  const tool = normaliseToolName(input.tool ?? input.tool_name ?? input.name);
  const agentId = String(input.agent_id ?? input.agentId ?? config.defaultAgentId).slice(0, 256);
  const policyId = String(input.policy_id ?? input.policyId ?? input.policy ?? "").slice(0, 256);
  const resource = String(input.resource ?? "").slice(0, 512);
  const amountRaw = input.amount ?? input.cost ?? input.spend_amount;
  const currency = String(input.currency || config.currency).toUpperCase().slice(0, 16);
  const args = input.args ?? input.arguments ?? {};
  const digest = argsDigest(args);
  const argsText = JSON.stringify(args ?? {});
  const stamp = new Date().toISOString();

  if (config.allowedTools.length > 0 && !config.allowedTools.includes(tool)) {
    const receipt = await attestAction(
      { action: "mcp.tool." + tool, outcome: "no", policy_id: policyId, agent_id: agentId, details_summary: digest },
      config,
    ).catch(() => null);
    return failClosed("tool_not_allowed:" + tool, {
      tool,
      policy_id: policyId,
      agent_id: agentId,
      args_hash: digest,
      attested_at: stamp,
      attestation: receipt,
    });
  }

  if (amountRaw !== undefined && amountRaw !== null && amountRaw !== "") {
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount < 0) {
      return failClosed("amount_invalid", { tool, args_hash: digest, attested_at: stamp });
    }
    if (config.maxAmount !== null && amount > config.maxAmount) {
      const receipt = await attestAction(
        { action: "mcp.tool." + tool, outcome: "no", policy_id: policyId, agent_id: agentId, details_summary: digest },
        config,
      ).catch(() => null);
      return failClosed("amount_above_limit:" + config.maxAmount, {
        tool,
        amount,
        currency,
        args_hash: digest,
        attested_at: stamp,
        attestation: receipt,
      });
    }
  }

  const hit = (config.blockedPatterns || []).find((p) => p && argsText.includes(p));
  if (hit) {
    const receipt = await attestAction(
      { action: "mcp.tool." + tool, outcome: "no", policy_id: policyId, agent_id: agentId, details_summary: digest },
      config,
    ).catch(() => null);
    return failClosed("blocked_argument_pattern", {
      tool,
      args_hash: digest,
      attested_at: stamp,
      attestation: receipt,
    });
  }

  const receipt = await attestAction(
    {
      action: "mcp.tool." + tool,
      outcome: "yes",
      policy_id: policyId,
      agent_id: agentId,
      context_hash: digest,
      details_summary: digest,
    },
    config,
  );

  const gateLine = [tool, agentId, policyId, digest, receipt.proof_digest, stamp].join("|");
  const decisionHash = createHash("sha256").update(gateLine, "utf8").digest("hex");

  return {
    allowed: true,
    allow: true,
    decision: "allow",
    reason: "allowed_by_policy",
    tool,
    policy_id: policyId,
    agent_id: agentId,
    resource,
    currency,
    args_hash: digest,
    decision_hash: decisionHash,
    attested_at: stamp,
    signed: true,
    attestation: receipt,
    proof_id: receipt.proof_id,
    proof_digest: receipt.proof_digest,
  };
}

export function describePolicy(config = loadConfig()) {
  return {
    mode: "local-fail-closed",
    allowed_tools: config.allowedTools,
    max_amount: config.maxAmount,
    currency: config.currency,
    blocked_patterns_count: (config.blockedPatterns || []).length,
  };
}

export { getSdk };
