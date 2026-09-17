import { createHash } from "node:crypto";
import { AffixSDK } from "affixio";
import { loadConfig } from "./config.js";

let sdk = null;
let sdkHome = null;

export function getSdk(config = loadConfig()) {
  if (sdk && sdkHome === config.home) return sdk;
  if (sdk && typeof sdk.dispose === "function") {
    try {
      sdk.dispose();
    } catch {
      sdk = null;
    }
  }
  sdk = new AffixSDK({
    apiKey: config.apiKey,
    apiBase: config.apiBase,
    licenceOnly: true,
    autoFlush: false,
    proofMode: "hmac",
    operatorBaseDir: config.home,
    proofStorePath: config.store.proofs,
    offlineQueuePath: config.store.queue,
    licenceStatePath: config.store.licence,
    statsPath: config.store.stats,
    spendDir: config.store.spend,
    codeUsesPath: config.store.codeUses,
    signingKeysPath: config.store.signingKeys,
    hmacSecretPath: config.store.hmacSecret,
  });
  sdkHome = config.home;
  return sdk;
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

export function sha256Hex(value) {
  const raw = typeof value === "string" ? value : JSON.stringify(canonicalize(value));
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function normaliseAction(action) {
  const name = String(action || "").trim();
  if (!name) throw new Error("action_required");
  if (name.length > 256) throw new Error("action_too_long");
  return name;
}

function normaliseOutcome(outcome) {
  if (outcome === undefined || outcome === null || outcome === "") return "yes";
  const v = String(outcome).trim().toLowerCase();
  if (v === "yes" || v === "true" || v === "allow" || v === "allowed" || v === "1") return "yes";
  if (v === "no" || v === "false" || v === "deny" || v === "denied" || v === "0") return "no";
  throw new Error("outcome_must_be_yes_or_no");
}

function optionalText(value, max, name) {
  if (value === undefined || value === null || value === "") return "";
  const s = String(value);
  if (s.length > max) throw new Error(name + "_too_long");
  return s;
}

export async function attestAction(input = {}, config = loadConfig()) {
  const client = getSdk(config);
  const action = normaliseAction(input.action ?? input.action_id ?? input.name);
  const outcome = normaliseOutcome(input.outcome ?? input.decision ?? "yes");
  const contextHash = optionalText(input.context_hash ?? input.contextHash ?? "", 256, "context_hash");
  const policyId = optionalText(input.policy_id ?? input.policyId ?? input.policy ?? "", 256, "policy_id");
  const agentId = String(input.agent_id ?? input.agentId ?? config.defaultAgentId).slice(0, 256);
  const summary = optionalText(input.details_summary ?? input.summary ?? "", 2000, "details_summary");
  const detailsDigest = summary ? sha256Hex(summary) : "";
  const stamp = new Date().toISOString();
  const proof = await client.prove({
    mode: "offline",
    proofMode: "hmac",
    decision: outcome,
    fields: {
      claim: outcome === "yes" ? "approved" : "denied",
      required: "approved",
      action,
    },
    meta: {
      action,
      agent_id: agentId,
      context_hash: contextHash || detailsDigest || "",
      policy_id: policyId,
      outcome,
      attested_at: stamp,
    },
    origin: "mcp_attest_action",
  });
  return {
    action,
    outcome: proof.decision,
    valid: proof.valid,
    decision: proof.decision,
    proof_id: proof.proof_id,
    request_id: proof.request_id,
    circuit_id: proof.circuit_id,
    proof: proof.proof,
    proof_digest: proof.proof_digest,
    proof_mode: proof.proof_mode,
    signed_at: proof.envelope.attestation.signed_at,
    key_id: proof.envelope.attestation.key_id,
    algorithm: proof.envelope.attestation.algorithm,
    signature_b64: proof.envelope.attestation.mldsa_signature_b64,
    public_key_b64: proof.envelope.attestation.mldsa_public_key_b64,
    context_hash: contextHash || detailsDigest || "",
    policy_id: policyId,
    agent_id: agentId,
    envelope: proof.envelope,
    signature: proof.signature,
  };
}

function pickAttestation(input = {}) {
  const nested = input.attestation && typeof input.attestation === "object" ? input.attestation : null;
  const src = nested || input;
  const proof = src.proof || src.receipt_proof || input.proof;
  const circuitId = src.circuit_id || src.circuitId || input.circuit_id || input.circuitId || "simple_yesno";
  const envelope = src.envelope || input.envelope || null;
  if (!proof || typeof proof !== "string") throw new Error("proof_required");
  return { proof, circuitId: String(circuitId), envelope };
}

export async function verifyAction(input = {}, config = loadConfig()) {
  const client = getSdk(config);
  const { proof, circuitId, envelope } = pickAttestation(input);
  let result;
  try {
    result = await client.verifyLocal(circuitId, proof, {
      envelope: envelope || undefined,
    });
  } catch {
    return { valid: false, verified: false, decision: "no", reason: "malformed_proof", circuit_id: circuitId };
  }
  return {
    valid: result.valid,
    verified: result.valid,
    decision: result.decision,
    reason: result.valid ? "signature_ok" : result.reason || "authentication_failed",
    circuit_id: result.circuit_id,
    proof_digest: result.proof_digest,
    proof_mode: result.proof_mode,
    envelope_ok: result.envelope_ok ?? null,
  };
}
