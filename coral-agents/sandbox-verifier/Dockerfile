# Build from repo root:
#   docker build -f coral-agents/sandbox-verifier/Dockerfile -t sandbox-verifier:0.1.0 .

FROM node:20-alpine AS builder
WORKDIR /app

COPY packages/agent-runtime/package.json packages/agent-runtime/package-lock.json* ./packages/agent-runtime/
RUN cd packages/agent-runtime && npm install --ignore-scripts
COPY packages/agent-runtime/tsconfig.json ./packages/agent-runtime/
COPY packages/agent-runtime/src/ ./packages/agent-runtime/src/
RUN cd packages/agent-runtime && npx tsc

COPY examples/flashpatch/src/ ./examples/flashpatch/src/

COPY coral-agents/sandbox-verifier/package.json coral-agents/sandbox-verifier/package-lock.json* ./coral-agents/sandbox-verifier/
RUN cd coral-agents/sandbox-verifier && npm install --ignore-scripts --install-links
COPY coral-agents/sandbox-verifier/tsconfig.json ./coral-agents/sandbox-verifier/
COPY coral-agents/sandbox-verifier/src/ ./coral-agents/sandbox-verifier/src/
RUN cd coral-agents/sandbox-verifier && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/coral-agents/sandbox-verifier/dist ./dist
COPY --from=builder /app/coral-agents/sandbox-verifier/node_modules ./node_modules

CMD ["node", "dist/index.js"]
