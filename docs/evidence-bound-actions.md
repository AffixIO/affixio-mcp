# Evidence-bound actions

`gate_evidence_action` is a local, fail-closed MCP tool for workflows that use licensed, confidential or otherwise controlled sources. It is generic by design: it does not connect to, emulate, endorse or claim compatibility with any particular data provider.

Use it immediately before an agent performs a source-backed action, and again before a more sensitive follow-on action such as export. A policy must explicitly allow the agent, resource, jurisdiction, purpose and operation. A revoked agent or resource is denied before the action.

The tool returns signed allow or deny evidence. It retains only SHA-256 digests of the request, result and citations in its decision output. It never returns, stores or republishes source documents, source text, citation text or generated answers. The calling application remains responsible for licence terms, source access controls, retention and enforcing the decision before it calls an external tool.

## Example

```json
{
  "action": "legal.research",
  "agent_id": "agent:casework-17",
  "resource": "matter:acme-42",
  "jurisdiction": "GB-ENG",
  "purpose": "advice-preparation",
  "operation": "research",
  "request": { "query": "contract termination notice" },
  "evidence": {
    "citations": ["provider-local-reference-1"],
    "result": { "host_local": true }
  },
  "policy": {
    "id": "legal-research-v1",
    "agents": ["agent:casework-17"],
    "resources": ["matter:acme-42"],
    "jurisdictions": ["GB-ENG"],
    "purposes": ["advice-preparation"],
    "operations": ["research"],
    "revoked_agents": [],
    "revoked_resources": []
  }
}
```

`export` is denied unless it is separately present in `operations`. This is deliberate: a research permission should not become an export permission.

## Boundaries

- This is a local policy and evidence component, not legal advice.
- It does not verify whether an answer is correct, whether a citation supports a claim, or whether a source licence permits a use.
- The surrounding application must fail closed and not run the external action after a deny result.
- Hashes establish integrity of the supplied values, not truth of their contents.
