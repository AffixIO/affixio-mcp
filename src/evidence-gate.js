import { attestAction, canonicalize, sha256Hex } from "./attest.js";
import { gateToolCall } from "./gate.js";
import { loadConfig } from "./config.js";

const MAX_LIST = 128;

function text(value, field, max = 256) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${field}_required`);
  if (result.length > max) throw new Error(`${field}_too_long`);
  return result;
}

function stringList(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field}_must_be_array`);
  if (value.length > MAX_LIST) throw new Error(`${field}_too_many_entries`);
  return [...new Set(value.map((item) => text(item, field)))];
}

function policyFrom(input) {
  const raw = input.policy;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("policy_required");
  return {
    id: text(raw.id ?? input.policy_id, "policy_id"),
    agents: stringList(raw.agents, "policy_agents"),
    resources: stringList(raw.resources, "policy_resources"),
    jurisdictions: stringList(raw.jurisdictions, "policy_jurisdictions"),
    purposes: stringList(raw.purposes, "policy_purposes"),
    operations: stringList(raw.operations, "policy_operations"),
    revoked_agents: Array.isArray(raw.revoked_agents) ? stringList(raw.revoked_agents, "revoked_agents") : [],
    revoked_resources: Array.isArray(raw.revoked_resources) ? stringList(raw.revoked_resources, "revoked_resources") : [],
  };
}

function digest(value) {
  return sha256Hex(canonicalize(value ?? null));
}

async function deny(reason, action, agentId, policy, requestDigest, evidence, config) {
  let attestation = null;
  try {
    attestation = await attestAction(
      {
        action: `evidence.${action}`,
        outcome: "no",
        policy_id: policy.id,
        agent_id: agentId,
        context_hash: requestDigest,
        details_summary: `${reason}:${evidence.digest}`,
      },
      config,
    );
  } catch {
    // The caller must still fail closed if local attestation is unavailable.
  }
  return {
    allowed: false,
    decision: "deny",
    reason,
    signed: Boolean(attestation),
    action,
    agent_id: agentId,
    policy_id: policy.id,
    request_digest: requestDigest,
    evidence,
    attestation,
  };
}

/**
 * Fail-closed policy gate for actions that consume or produce evidence.
 * It keeps only request/result/citation digests in its decision output. The
 * caller remains responsible for retaining licensed source material locally.
 */
export async function gateEvidenceAction(input = {}, config = loadConfig()) {
  const action = text(input.action, "action");
  const agentId = text(input.agent_id ?? input.agentId ?? config.defaultAgentId, "agent_id");
  const resource = text(input.resource, "resource", 512);
  const jurisdiction = text(input.jurisdiction, "jurisdiction");
  const purpose = text(input.purpose, "purpose");
  const operation = text(input.operation, "operation");
  const policy = policyFrom(input);
  const requestDigest = digest({ action, resource, jurisdiction, purpose, operation, request: input.request ?? null });
  const evidence = {
    digest: digest(input.evidence ?? null),
    citation_digest: digest(input.evidence?.citations ?? null),
    result_digest: digest(input.evidence?.result ?? null),
    citation_count: Array.isArray(input.evidence?.citations) ? input.evidence.citations.length : 0,
  };

  const checks = [
    [policy.revoked_agents.includes(agentId), "agent_revoked"],
    [policy.revoked_resources.includes(resource), "resource_revoked"],
    [!policy.agents.includes(agentId), "agent_not_authorised"],
    [!policy.resources.includes(resource), "resource_not_authorised"],
    [!policy.jurisdictions.includes(jurisdiction), "jurisdiction_not_authorised"],
    [!policy.purposes.includes(purpose), "purpose_not_authorised"],
    [!policy.operations.includes(operation), "operation_not_authorised"],
  ];
  for (const [failed, reason] of checks) {
    if (failed) return deny(reason, action, agentId, policy, requestDigest, evidence, config);
  }

  const decision = await gateToolCall(
    {
      tool: action,
      agent_id: agentId,
      policy_id: policy.id,
      resource,
      args: { resource, jurisdiction, purpose, operation, request_digest: requestDigest, evidence_digest: evidence.digest },
    },
    config,
  );
  return {
    ...decision,
    action,
    operation,
    jurisdiction,
    purpose,
    request_digest: requestDigest,
    evidence,
  };
}
