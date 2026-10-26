# Affixio MCP

## Hosted AffixIO verification server

For OAuth access to proof verification, permission checks, revocation status and Merkle audit evidence, connect to **https://www.affix-io.com/mcp/**. See the [hosted install guide](docs/hosted-mcp.md) and [directory profile](docs/directory-profile.md). The hosted service and the local stdio package below have different tools and authentication requirements.

[![ToolSDK MCP Registry](https://badges.toolsdk.ai/badge/@affixio/mcp)](https://toolsdk-ai.github.io/toolsdk-mcp-registry/#%40affixio%2Fmcp)

Local stdio MCP server that wraps the affixio SDK. It gives agents a signed yes or no record that an action happened on the host.

The SDK stays as it is: install with npm i affixio. This package only adds a local MCP front end for catalog listings and platform wraps.

Run it with npx @affixio/mcp@0.1.0. PII never leaves the host: tool arguments are hashed, never stored, and proving runs offline on the machine.

## Install

    npm i -g @affixio/mcp@0.1.0
    affixio-mcp

Or without installing:

    npx -y @affixio/mcp@0.1.0

Check it works:

    affixio-mcp probe

## Client config

Claude Desktop config file, Examples dir has ready files:

    {
      "mcpServers": {
        "affixio": {
          "command": "npx",
          "args": ["-y", "@affixio/mcp@0.1.0"],
          "env": {
            "AFFIX_API_KEY": "local_operator",
            "AFFIX_MCP_HOME": "${HOME}/.affix-mcp"
          }
        }
      }
    }

Cursor uses the same mcpServers shape. Copy examples/claude-desktop-mcp.json or examples/cursor-mcp.json.

## Tools

Only three tools ship. No identity, age, KYC, MRZ, passport, licence, vehicle, admin, OAuth, or cloud passthrough. Those stay on the Hub MCP.

- attest_action: action plus optional outcome, context hash, policy id. Returns a signed action attestation with timestamp, action id, ML-DSA-65 signature, and proof id.
- verify_action: attestation or receipt in, valid true or false plus reason out.
- gate_tool_call: tool name plus args hash or summary plus policy in, allow or deny plus signed decision out. Call before privileged agent tool calls.

## Env config

- AFFIX_API_KEY: licence key, defaults to local_operator for offline use
- AFFIX_API_BASE: override API base, unset means SDK default
- AFFIX_MCP_HOME: state dir, defaults to ~/.affix-mcp
- AFFIX_MCP_AGENT_ID: default agent id
- AFFIX_MCP_ALLOWED_TOOLS: comma list, empty means any tool may attest
- AFFIX_MCP_MAX_AMOUNT: optional numeric cap, denies above it
- AFFIX_MCP_CURRENCY: currency code, default GBP
- AFFIX_MCP_BLOCKED_PATTERNS: comma list, default sk_live_, AKIA, PRIVATE KEY

## Security

Local first. Proving runs offline via the affixio SDK in HMAC mode, signed ML-DSA-65. Gate decisions are fail closed: unknown tools, over-limit amounts, blocked arg patterns, and malformed proofs all deny. Raw tool args never persist; the record keeps a sha256 digest only.

## Dev

    npm install
    npm test
    npm run probe

## License

Apache-2.0. See LICENSE.

## Grok Build plugin

This repository can be installed from the xAI Plugin Marketplace as **AffixIO Tool Gate**. It runs as a local stdio MCP server and exposes only these three tools:

- `gate_tool_call`: evaluates one named tool call against the configured local allowlist, amount cap, and blocked patterns, then returns an allow or deny result before the caller executes the tool.
- `attest_action`: creates a local action attestation.
- `verify_action`: verifies an attestation supplied by the caller.

### Data handling and boundaries

The plugin has no hooks, background tasks, browser automation, account access, or automatic agent enrolment. It does not read shell history, SSH keys, project `.env` files, or other credentials. The gate stores a SHA-256 digest of supplied tool arguments in its decision record rather than raw arguments.

By default, all proof and decision state is stored locally in `~/.affix-mcp`. The local SDK may make a licence heartbeat to `https://api.affix-io.com`; it does not send raw tool arguments for this gate. An operator may explicitly set `AFFIX_API_BASE` to select a different AffixIO endpoint and should assess that endpoint before use. The MCP process needs Node.js 20+ and downloads the version-pinned public npm package `@affixio/mcp@0.1.0` when first launched through `npx`.

### Grok Build example

Configure a narrow policy before starting Grok Build:

```bash
export AFFIX_MCP_ALLOWED_TOOLS="calendar.create,github.create_issue"
export AFFIX_MCP_MAX_AMOUNT="0"
export AFFIX_MCP_BLOCKED_PATTERNS="sk_live_,AKIA,PRIVATE KEY"
```

Ask `gate_tool_call` before a privileged tool call. If it returns `deny`, do not run that call. A Grok Build workflow remains responsible for enforcing the result: the MCP server cannot prevent an unrelated tool from running on its own.
