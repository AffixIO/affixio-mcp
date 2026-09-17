import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";
import { attestAction, sha256Hex, verifyAction } from "../src/attest.js";
import { argsDigest, gateToolCall } from "../src/gate.js";
import { dispatchTool, handleRequest } from "../src/server.js";

const home = process.env.AFFIX_MCP_TEST_HOME || "/tmp/affixio-mcp-test";
const config = { ...loadConfig({ ...process.env, AFFIX_MCP_HOME: home }), apiKey: "local_operator" };

describe("attest_action", () => {
  it("issues a signed yes attestation", async () => {
    const a = await attestAction({ action: "demo.ping", outcome: "yes" }, config);
    assert.equal(a.action, "demo.ping");
    assert.equal(a.decision, "yes");
    assert.ok(a.proof && a.proof.length > 16);
    assert.equal(a.envelope.attestation.schema, "affix.local-signature.v1");
    assert.equal(a.signature.algorithm, "ML-DSA-65");
  });

  it("round-trips through verify_action", async () => {
    const a = await attestAction({ action: "demo.verify", outcome: "yes" }, config);
    const v = await verifyAction({ proof: a.proof, circuit_id: a.circuit_id, envelope: a.envelope }, config);
    assert.equal(v.valid, true);
    assert.equal(v.decision, "yes");
  });

  it("rejects tampered proofs", async () => {
    const a = await attestAction({ action: "demo.tamper", outcome: "yes" }, config);
    const cut = a.proof.slice(0, Math.max(8, a.proof.length - 8)) + "00000000";
    const v = await verifyAction({ proof: cut, circuit_id: a.circuit_id }, config);
    assert.equal(v.valid, false);
  });

  it("records no-outcome as a signed no", async () => {
    const a = await attestAction({ action: "demo.deny", outcome: "no" }, config);
    assert.equal(a.decision, "no");
  });

  it("requires an action name", async () => {
    await assert.rejects(() => attestAction({}, config), /action_required/);
  });
});

describe("gate_tool_call", () => {
  it("allows a listed tool and returns a signed decision", async () => {
    const open = { ...config, allowedTools: [] };
    const d = await gateToolCall({ tool: "demo.tool", args: { x: 1 } }, open);
    assert.equal(d.allowed, true);
    assert.equal(d.decision, "allow");
    assert.equal(d.signed, true);
    assert.equal(d.args_hash, sha256Hex({ x: 1 }));
    assert.ok(d.attestation.proof_id);
  });

  it("denies an unlisted tool when an allow-list is set", async () => {
    const locked = { ...config, allowedTools: ["demo.tool"] };
    const d = await gateToolCall({ tool: "other.tool", args: {} }, locked);
    assert.equal(d.allowed, false);
    assert.match(d.reason, /tool_not_allowed/);
  });

  it("denies amounts above the limit", async () => {
    const capped = { ...config, maxAmount: 10 };
    const d = await gateToolCall({ tool: "demo.tool", amount: 99, args: {} }, capped);
    assert.equal(d.allowed, false);
    assert.match(d.reason, /amount_above_limit/);
  });

  it("keeps raw args out of the decision record", async () => {
    const open = { ...config, allowedTools: [] };
    const secret = { customer: "cust_42", note: "do-not-store" };
    const d = await gateToolCall({ tool: "demo.tool", args: secret }, open);
    assert.equal(JSON.stringify(d).includes("do-not-store"), false);
    assert.equal(d.args_hash, argsDigest(secret));
  });
});

describe("stdio protocol", () => {
  it("answers initialize and tools list", async () => {
    const init = await handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, config);
    assert.equal(init.result.serverInfo.name, "affixio-mcp");
    const list = await handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, config);
    const names = list.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["attest_action", "gate_tool_call", "verify_action"]);
  });

  it("serves tools/call for attest_action", async () => {
    const res = await dispatchTool("attest_action", { action: "demo.rpc", outcome: "yes" }, config);
    const body = JSON.parse(res.content[0].text);
    assert.equal(body.ok, true);
    assert.equal(body.attestation.action, "demo.rpc");
  });

  it("rejects unknown tools and methods", async () => {
    await assert.rejects(() => dispatchTool("nope", {}, config), /unknown_tool/);
    const res = await handleRequest({ jsonrpc: "2.0", id: 9, method: "nope/nope", params: {} }, config);
    assert.equal(res.error.code, -32601);
  });
});
