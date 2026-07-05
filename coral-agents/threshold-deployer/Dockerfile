# Build from repo root:
#   docker build -f coral-agents/threshold-deployer/Dockerfile -t threshold-deployer:0.1.0 .

FROM node:20-alpine AS builder
WORKDIR /app

COPY packages/agent-runtime/package.json packages/agent-runtime/package-lock.json* ./packages/agent-runtime/
RUN cd packages/agent-runtime && npm install --ignore-scripts
COPY packages/agent-runtime/tsconfig.json ./packages/agent-runtime/
COPY packages/agent-runtime/src/ ./packages/agent-runtime/src/
RUN cd packages/agent-runtime && npx tsc

COPY examples/flashpatch/src/ ./examples/flashpatch/src/

COPY coral-agents/threshold-deployer/package.json coral-agents/threshold-deployer/package-lock.json* ./coral-agents/threshold-deployer/
RUN cd coral-agents/threshold-deployer && npm install --ignore-scripts --install-links
COPY coral-agents/threshold-deployer/tsconfig.json ./coral-agents/threshold-deployer/
COPY coral-agents/threshold-deployer/src/ ./coral-agents/threshold-deployer/src/
RUN cd coral-agents/threshold-deployer && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/coral-agents/threshold-deployer/dist ./dist
COPY --from=builder /app/coral-agents/threshold-deployer/node_modules ./node_modules

CMD ["node", "dist/index.js"]
