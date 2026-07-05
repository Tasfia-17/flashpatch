# Shared Dockerfile for all three patch-generator personas (fast / deep / hybrid).
# Build from repo root:
#   docker build -f coral-agents/patch-generator/Dockerfile -t patch-generator:0.1.0 .

FROM node:20-alpine AS builder
WORKDIR /app

COPY packages/agent-runtime/package.json packages/agent-runtime/package-lock.json* ./packages/agent-runtime/
RUN cd packages/agent-runtime && npm install --ignore-scripts
COPY packages/agent-runtime/tsconfig.json ./packages/agent-runtime/
COPY packages/agent-runtime/src/ ./packages/agent-runtime/src/
RUN cd packages/agent-runtime && npx tsc

COPY packages/harness-runtime/package.json packages/harness-runtime/package-lock.json* ./packages/harness-runtime/
RUN cd packages/harness-runtime && npm install --ignore-scripts --install-links
COPY packages/harness-runtime/tsconfig.json ./packages/harness-runtime/
COPY packages/harness-runtime/src/ ./packages/harness-runtime/src/
RUN cd packages/harness-runtime && npx tsc

COPY examples/flashpatch/src/ ./examples/flashpatch/src/
COPY examples/txodds/agent/escrow.ts examples/txodds/agent/arbiter.ts ./examples/txodds/agent/

COPY coral-agents/patch-generator/package.json coral-agents/patch-generator/package-lock.json* ./coral-agents/patch-generator/
RUN cd coral-agents/patch-generator && npm install --ignore-scripts --install-links
COPY coral-agents/patch-generator/tsconfig.json ./coral-agents/patch-generator/
COPY coral-agents/patch-generator/src/ ./coral-agents/patch-generator/src/
RUN cd coral-agents/patch-generator && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/coral-agents/patch-generator/dist ./dist
COPY --from=builder /app/coral-agents/patch-generator/node_modules ./node_modules

CMD ["node", "dist/index.js"]
