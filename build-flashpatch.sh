#!/usr/bin/env bash
# Build all FlashPatch agent Docker images from repo root.
# Usage: bash build-flashpatch.sh
set -euo pipefail

echo "Building FlashPatch agent images..."

docker build -f coral-agents/exploit-detector/Dockerfile  -t exploit-detector:0.1.0  .
echo "  exploit-detector:0.1.0 done"

docker build -f coral-agents/patch-generator/Dockerfile   -t patch-generator:0.1.0   .
echo "  patch-generator:0.1.0 done"

docker build -f coral-agents/sandbox-verifier/Dockerfile  -t sandbox-verifier:0.1.0  .
echo "  sandbox-verifier:0.1.0 done"

docker build -f coral-agents/threshold-deployer/Dockerfile -t threshold-deployer:0.1.0 .
echo "  threshold-deployer:0.1.0 done"

echo ""
echo "All FlashPatch images built."
echo "Run: docker compose up -d coral && npm run flashpatch"
