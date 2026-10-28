import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { attestAction, verifyAction } from "./attest.js";
import { loadConfig } from "./config.js";
import { describePolicy, gateToolCall } from "./gate.js";
import { gateEvidenceAction } from "./evidence-gate.js";

const SERVER_NAME = "affixio-mcp";
const SERVER_VERSION = "0.1.0";
const PROTOCOL_VERSION = "2024-11-05";
const SLASH = String.fromCharCode(47);

const TOOLS = [
  {
    name: "attest_action",
    description: "Record a local action and return a signed yes-or-no ACTION attestation. PII stays on the host.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action id or name, for example payments.create" },
        outcome: { type: "string", description: "yes or no. Defaults to yes.", default: "yes" },
        context_hash: { type: "string", description: "Optional sha256 of host-side context. Raw context is never sent." },
        policy_id: { type: "string", description: "Optional policy id" },
        agent_id: { type: "string", description: "Optional agent id" },
        details_summary: { type: "string", description: "Optional short non-PII summary. Only its hash is stored." }
      },
      required: ["action"]
    }
  },
  {
    name: "verify_action",
    description: "Verify a local ACTION attestation and return valid true or false with a reason.",
    inputSchema: {
      type: "object",
      properties: {
        proof: { type: "string", description: "Attestation proof hex" },
        circuit_id: { type: "string", description: "Circuit id, default simple_yesno", default: "simple_yesno" },
        envelope: { type: "object", description: "Optional proof envelope from attest_action" },
        attestation: { type: "object", description: "Optional full attestation object holding proof and envelope" }
      }
    }
  },
  {
    name: "gate_tool_call",
    description: "Policy gate for one privileged agent tool call. Returns allow or deny plus a signed decision.",
    inputSchema: {
      type: "object",
      properties: {
        tool: { type: "string", description: "Tool name, for example payments.create" },
        args: { type: "object", description: "Tool arguments. Only a sha256 digest is kept in the decision record." },
        amount: { type: "number", description: "Optional cost or amount" },
        currency: { type: "string", description: "Optional currency code" },
        policy_id: { type: "string", description: "Optional policy id" },
        agent_id: { type: "string", description: "Optional agent id" },
        resource: { type: "string", description: "Optional resource label" }
      },
      required: ["tool"]
    }
  },
  {
    name: "gate_evidence_action",
    description: "Fail-closed scoped gate for an evidence-producing or evidence-consuming action. It returns signed allow or deny evidence with hashes only: never source documents, citations or results.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action identifier, for example legal.research" },
        agent_id: { type: "string", description: "Pseudonymous agent identifier" },
        resource: { type: "string", description: "Explicit resource scope, for example matter:123" },
        jurisdiction: { type: "string", description: "Jurisdiction required by policy" },
        purpose: { type: "string", description: "Declared purpose required by policy" },
        operation: { type: "string", description: "Requested operation, for example research or export" },
        request: { type: "object", description: "Host-side request context. Only a digest appears in the result." },
        evidence: { type: "object", description: "Optional result and citations. Only digests and citation count appear in the result." },
        policy: { type: "object", description: "Explicit policy containing id, agents, resources, jurisdictions, purposes and operations allow-lists; may also include revoked_agents and revoked_resources." }
      },
      required: ["action", "resource", "jurisdiction", "purpose", "operation", "policy"]
    }
  }
];

function textResult(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function mcpError(code, message, id) {
  return { jsonrpc: "2.0", id: id === undefined ? null : id, error: { code, message: String(message).slice(0, 2000) } };
}

function mcpOk(result, id) {
  return { jsonrpc: "2.0", id, result };
}

export async function dispatchTool(name, args, config) {
  const a = args || {};
  if (name === "attest_action") {
    const attestation = await attestAction(a, config);
    return textResult({ ok: true, attestation });
  }
  if (name === "verify_action") {
    const verdict = await verifyAction(a, config);
    return textResult({ ok: true, verdict });
  }
  if (name === "gate_tool_call") {
    const decision = await gateToolCall(a, config);
    return textResult({ ok: true, decision });
  }
  if (name === "gate_evidence_action") {
    const decision = await gateEvidenceAction(a, config);
    return textResult({ ok: true, decision });
  }
  throw new Error("unknown_tool:" + String(name));
}

export async function handleRequest(msg, config) {
  const id = msg.id === undefined ? null : msg.id;
  const method = msg.method;
  if (msg.jsonrpc !== "2.0" || typeof method !== "string") return mcpError(-32600, "invalid_request", id);
  if (method === "initialize") {
    return mcpOk({ protocolVersion: PROTOCOL_VERSION, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }, capabilities: { tools: {} } }, id);
  }
  if (method === "notifications" + SLASH + "initialized") return null;
  if (method === "ping") return mcpOk({}, id);
  if (method === "tools" + SLASH + "list") return mcpOk({ tools: TOOLS, policy: describePolicy(config) }, id);
  if (method === "tools" + SLASH + "call") {
    const params = msg.params || {};
    try {
      const result = await dispatchTool(params.name, params.arguments || {}, config);
      return mcpOk(result, id);
    } catch (err) {
      return mcpError(-32602, err instanceof Error ? err.message : "tool_failed", id);
    }
  }
  return mcpError(-32601, "method_not_found:" + method, id);
}

export function startStdio(config) {
  const active = config || loadConfig();
  const rl = createInterface({ input, crlfDelay: Infinity });
  let buffer = "";
  rl.on("line", (line) => {
    buffer = buffer + line;
    if (buffer.trim() === "") {
      buffer = "";
      return;
    }
    let msg;
    try {
      msg = JSON.parse(buffer);
    } catch {
      return;
    }
    buffer = "";
    Promise.resolve(handleRequest(msg, active)).then((res) => {
      if (res !== null && res !== undefined) output.write(JSON.stringify(res) + "\n");
    });
  });
  return rl;
}
