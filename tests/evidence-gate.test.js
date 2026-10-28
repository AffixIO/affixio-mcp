import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyAction } from "../src/attest.js";
import { gateEvidenceAction } from "../src/evidence-gate.js";
import { dispatchTool } from "../src/server.js";

function config(home) {
  return {
    home,
    apiKey: "local_operator",
    apiBase: undefined,
    proofMode: "hmac",
    allowedTools: ["legal.research"],
    maxAmount: 0,
    currency: "GBP",
    blockedPatterns: ["PRIVATE KEY"],
    defaultAgentId: "agent:legal-research",
    store: {
      proofs: join(home, "proofs.json"), queue: join(home, "offline-queue.json"), licence: join(home, "licence.json"),
      stats: join(home, "stats.json"), spend: join(home, "spend"), codeUses: join(home, "code-uses.json"),
      signingKeys: join(home, "secrets", "mldsa65.json"), hmacSecret: join(home, "secrets", "hmac.secret"),
    },
  };
}

function input(overrides = {}) {
  return {
    action: "legal.research",
    agent_id: "agent:legal-research",
    resource: "matter:acme-42",
    jurisdiction: "GB-ENG",
    purpose: "advice-preparation",
    operation: "research",
    request: { query: "contract termination notice" },
    evidence: { citations: ["source:one"], result: { answer: "draft analysis" } },
    policy: {
      id: "legal-research-v1",
      agents: ["agent:legal-research"],
      resources: ["matter:acme-42"],
      jurisdictions: ["GB-ENG"],
      purposes: ["advice-preparation"],
      operations: ["research"],
    },
    ...overrides,
  };
}

test("allows an explicitly scoped evidence action and exposes digests only", async () => {
  const home = mkdtempSync(join(tmpdir(), "affixio-evidence-gate-"));
  try {
    const decision = await gateEvidenceAction(input(), config(home));
    assert.equal(decision.decision, "allow");
    assert.equal(decision.signed, true);
    assert.equal(decision.evidence.citation_count, 1);
    assert.match(decision.request_digest, /^[a-f0-9]{64}$/);
    assert.match(decision.evidence.citation_digest, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(decision).includes("contract termination notice"), false);
    assert.equal(JSON.stringify(decision).includes("draft analysis"), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("denies an unscoped resource and signs the no-decision", async () => {
  const home = mkdtempSync(join(tmpdir(), "affixio-evidence-gate-"));
  try {
    const decision = await gateEvidenceAction(input({ resource: "matter:other" }), config(home));
    assert.equal(decision.decision, "deny");
    assert.equal(decision.reason, "resource_not_authorised");
    assert.equal(decision.signed, true);
    const verified = await verifyAction({ attestation: decision.attestation }, config(home));
    // A signed no-decision intentionally does not satisfy the proof's yes claim.
    // Its authenticated envelope still verifies and preserves the denial evidence.
    assert.equal(verified.valid, false);
    assert.equal(verified.decision, "no");
    assert.equal(verified.envelope_ok, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("denies revoked agents before a research action", async () => {
  const home = mkdtempSync(join(tmpdir(), "affixio-evidence-gate-"));
  try {
    const request = input();
    request.policy.revoked_agents = ["agent:legal-research"];
    const decision = await gateEvidenceAction(request, config(home));
    assert.equal(decision.decision, "deny");
    assert.equal(decision.reason, "agent_revoked");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("denies an operation that policy does not permit", async () => {
  const home = mkdtempSync(join(tmpdir(), "affixio-evidence-gate-"));
  try {
    const decision = await gateEvidenceAction(input({ operation: "export" }), config(home));
    assert.equal(decision.decision, "deny");
    assert.equal(decision.reason, "operation_not_authorised");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("serves the scoped evidence gate through MCP", async () => {
  const home = mkdtempSync(join(tmpdir(), "affixio-evidence-gate-"));
  try {
    const result = await dispatchTool("gate_evidence_action", input(), config(home));
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.ok, true);
    assert.equal(body.decision.decision, "allow");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
