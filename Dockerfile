# Minimal container for @affixio/mcp local stdio MCP server.
# Used by Docker MCP Registry / MCP Toolkit. Host-side ACTION attestation; PII stays on host.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY examples ./examples
COPY README.md LICENSE ./

ENV NODE_ENV=production
ENV AFFIX_API_KEY=local_operator
ENV AFFIX_MCP_HOME=/data/.affix-mcp

VOLUME ["/data"]

ENTRYPOINT ["node", "src/cli.js"]
CMD []
