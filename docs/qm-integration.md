# QM integration template

This is a local deployment template for [QM](https://github.com/yc-software/qm), not an upstream QM contribution, endorsement or deployment guide. QM asks contributors to propose feature ideas as human-written ADR text rather than submitting generated code. Use this material in an organisation-owned QM deployment repository.

## Threat boundary

Do not let a QM agent provide its own authorisation policy, choose another agent identity, or bypass QM's approval flow. Run `@affixio/mcp` with an operator-owned policy file and a locked local service identity. QM still owns the initiating-user audit record and, for sensitive calls, the human approval.

```bash
export AFFIX_MCP_HOME=/var/lib/affixio-mcp
export AFFIX_MCP_AGENT_ID=agent:qm-research
export AFFIX_MCP_LOCK_AGENT_ID=true
export AFFIX_MCP_EVIDENCE_POLICIES_FILE=/etc/affixio/qm-evidence-policies.json
export AFFIX_MCP_ALLOWED_TOOLS=legal.research
export AFFIX_MCP_ALLOW_INLINE_EVIDENCE_POLICY=false
```

Copy [`examples/qm-evidence-policies.json`](../examples/qm-evidence-policies.json) to an operator-controlled path, replace its illustrative scopes, and restrict file permissions. This file is policy configuration, not a credential. Do not put source documents, prompts, access tokens or personal data in it.

## QM connector registration

Register the local AffixIO MCP server only as an administrator. For a sensitive evidence-backed tool, configure QM's connector approval as `all`, rather than `none`; QM binds that approval to the exact tool arguments for a single call. Keep QM in its Strict posture where appropriate.

The exact registration mechanics are owned by the deployed QM version. This template intentionally does not include a bearer token, an OAuth client, a shared production endpoint or an automatic registration request.

## Agent call shape

The agent can request a decision, but cannot supply the policy object:

```json
{
  "action": "legal.research",
  "resource": "matter:demo-42",
  "jurisdiction": "GB-ENG",
  "purpose": "advice-preparation",
  "operation": "research",
  "policy_id": "qm-research-v1",
  "request": { "query": "host-local query" },
  "evidence": { "citations": ["host-local-reference"], "result": { "host_local": true } }
}
```

`gate_evidence_action` reads the policy by `policy_id` from the configured file. It ignores no policy from the agent because inline policies are disabled. With `AFFIX_MCP_LOCK_AGENT_ID=true`, a supplied different `agent_id` is rejected.

The decision contains only request, result and citation digests plus a citation count. The surrounding application must stop if the decision is deny. It must also enforce source licences, record retention, and any provider-specific controls.

## Before production

1. Replace the example policy with resource names and purposes reviewed by the organisation.
2. Test expired, revoked, mismatched-resource and unavailable-verifier cases.
3. Confirm QM approval and audit settings in the target deployment.
4. Use an organisation-specific secret manager for any AffixIO service credentials. Never put them in the policy file, repository or tool arguments.
5. Have a security owner review data handling and the external action that follows an allow result.
