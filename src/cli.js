#!/usr/bin/env node

import { stdout as output, stderr, argv, exit, env } from "node:process";
import { loadConfig } from "./config.js";
import { attestAction, verifyAction } from "./attest.js";
import { argsDigest, gateToolCall } from "./gate.js";
import { startStdio } from "./server.js";

const mode = argv[2] || "stdio";

if (mode === "probe") {
  const config = loadConfig(env);
  const home = config.home;
  Promise.resolve(gateToolCall({ tool: "probe", args: { hello: "mcp" } }, config))
    .then((decision) =>
      Promise.resolve(attestAction({ action: "probe.ping", outcome: "yes" }, config)).then((attestation) =>
        Promise.resolve(
          verifyAction({ proof: attestation.proof, circuit_id: attestation.circuit_id, envelope: attestation.envelope }, config)
        ).then((verdict) => {
          const out = {
            ok: true,
            server: "affixio-mcp",
            version: "0.1.0",
            transport: "stdio",
            home,
            tools: ["attest_action", "verify_action", "gate_tool_call"],
            smoke: {
              gate_decision: decision.decision,
              attestation_id: attestation.proof_id,
              verify_valid: verdict.valid
            }
          };
          output.write(JSON.stringify(out, null, 2) + "\n");
          exit(0);
        })
      )
    )
    .catch((err) => {
      stderr.write("probe_failed:" + String(err instanceof Error ? err.message : err) + "\n");
      exit(1);
    });
} else if (mode === "digest") {
  const raw = argv[3] || "{}";
  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  output.write(argsDigest(parsed) + "\n");
} else {
  startStdio(loadConfig(env));
}
