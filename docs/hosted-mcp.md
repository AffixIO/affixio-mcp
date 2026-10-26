# AffixIO hosted MCP

Connect agents to verification, permissions, attestations and audit evidence through an account-scoped OAuth connection.

## Connect

Add `https://www.affix-io.com/mcp/` as a remote Streamable HTTP server in an OAuth-capable MCP client:

```json
{"mcpServers":{"affixio":{"url":"https://www.affix-io.com/mcp/"}}}
```

Follow the browser consent screen in AffixIO Studio and select an active API key owned by your account. Start with read access; grant write access when your workflow needs it. Keep tokens and API keys out of messages and tool arguments. API usage is subject to your account's plan and limits.

## Focused tools

| Task | Tool | Effect |
| --- | --- | --- |
| Check service health | `affix_health` | Reads health and version |
| Verify an UltraHonk proof | `affix_circuit_verify` | Successful verification consumes the proof; requires write scope |
| Check proof-based permission | `affix_gate_verify` | Explicit `check` or `consume` mode; requires write scope |
| Inspect spent/revocation state | `affix_spent_status` | Reads digest status and registry entry |
| Get audit inclusion evidence | `affix_merkle_proof` | Reads inclusion proof for a digest |

The generic `affix_api_read` and `affix_api_write` tools remain available. Use the `affix-openapi` resource for endpoint contracts. Account, key, OAuth and webhook administration are excluded.

Example health arguments: `{}`. Example inclusion/status arguments: `{"digest":"<64-character hex digest>"}`. Example gate arguments: `{"body":{"proof":"<proof reference>","circuit_id":"<matching circuit>","mode":"check"}}`.

## Interpret results correctly

A proof or signature does not establish that the underlying source is accurate. Merkle inclusion establishes membership in an audit root. A digest absent from the spent registry is not automatically valid or authorised. Your application must enforce permission decisions. SDK-local HMAC proofs cannot be verified by the UltraHonk circuit endpoint.

The hosted service processes submitted tool inputs remotely. Submit only the data required by the contract. This hosted connection does not inherit the local package's offline privacy claims.

## Validation, 26 October 2026

The updated production source compiled successfully. Eleven isolated tests using the production MCP/OAuth modules, synthetic credentials and a mocked verification upstream passed: challenges, initialization/schema discovery, write-scope denial, read calls, denied/missing/conflicting guard decisions, explicit approval, supplied-credential preservation and token revocation. External requests confirmed the public missing/invalid-token challenges and OAuth/resource discovery.

A live external test also completed Studio consent with read-only scope, S256 PKCE token exchange, authenticated initialization, discovery of 102 tool schemas, and an authenticated health call. A write operation was rejected for missing write scope before proof verification. The test token was revoked, and a subsequent request returned HTTP 401. The underlying API key was not changed.

These checks do not constitute successful cryptographic verification of a real proof or certification for every MCP client. A client-specific Cline installation was not tested.

## Links

- [MCP documentation](https://www.affix-io.com/mcp/)
- [Protected resource metadata](https://www.affix-io.com/.well-known/oauth-protected-resource/mcp/)
- [OAuth metadata](https://api.affix-io.com/.well-known/oauth-authorization-server)
- [API contract](https://api.affix-io.com/v1/openapi.json)
- [Pricing](https://www.affix-io.com/pricing/)

The Agent Commons is a separate conversation service at https://ai.affix-io.com/ and has its own MCP endpoint.
