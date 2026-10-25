import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gateToolCall } from "../src/gate.js";
import { verifyAction } from "../src/attest.js";

function testConfig(home) {
  return {
    home,
    apiKey: "local_operator",
    apiBase: undefined,
    proofMode: "hmac",
    allowedTools: ["calendar.create"],
    maxAmount: 0,
    currency: "GBP",
    blockedPatterns: ["PRIVATE KEY"],
    defaultAgentId: "agent:test",
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

test("allows an explicitly permitted local tool call and verifies its attestation", async () => {
  const home = mkdtempSync(join(tmpdir(), "affixio-mcp-test-"));
  try {
    const decision = await gateToolCall({ tool: "calendar.create", args: { title: "Planning" } }, testConfig(home));
    assert.equal(decision.decision, "allow");
    assert.equal(decision.signed, true);
    assert.match(decision.args_hash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(decision).includes("Planning"), false);

    const verified = await verifyAction({ proof: decision.attestation.proof, envelope: decision.attestation.envelope }, testConfig(home));
    assert.equal(verified.valid, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("denies tools outside the explicit allowlist", async () => {
  const home = mkdtempSync(join(tmpdir(), "affixio-mcp-test-"));
  try {
    const decision = await gateToolCall({ tool: "payments.send", args: { amount: 10 } }, testConfig(home));
    assert.equal(decision.decision, "deny");
    assert.equal(decision.reason, "tool_not_allowed:payments.send");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
