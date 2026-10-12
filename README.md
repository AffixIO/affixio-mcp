# Affixio MCP

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
