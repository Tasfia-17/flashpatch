# FlashPatch

**Autonomous Emergency Patch Swarm for Solana Programs**

When a Solana program is exploited, a swarm of agents competes to generate and verify
a patch. The winning patch deploys automatically via threshold consensus. Payment settles
only after the exploit is blocked. No humans in the loop.

```
EXPLOIT_DETECTED
   |
   v
WANT (service=emergency_patch) -------> patch-fast   (5s,  0.005 SOL, confidence 0.72)
                                    |-> patch-deep   (30s, 0.015 SOL, confidence 0.95)
                                    |-> patch-hybrid (15s, 0.010 SOL, confidence 0.91)
                                              |
                                              v (winning bid)
                                         AWARD + ESCROW_REQUIRED
                                              |
                                         DEPOSITED (arbiter-gated escrow, devnet)
                                              |
                                         DELIVERED (patch JSON artifact)
                                              |
                                         VERIFY -> sandbox-verifier -> VERIFIED pass|fail
                                              |
                                         threshold-deployer (2-of-3 consensus)
                                              |
                                         PATCH_DEPLOYED (on-chain upgrade tx)
                                              |
                                         ARBITER_RELEASED (payment to winning agent)
```

## The six agents

| Agent | Role | Keys |
|---|---|---|
| `exploit-detector` | Monitors program, broadcasts WANT, opens escrow, releases on deploy | signs deposits/releases |
| `patch-fast` | cheap, fast, lower confidence | wallet receives payment |
| `patch-deep` | static analysis + invariants, thorough | wallet receives payment |
| `patch-hybrid` | Anchor constraints + checked_sub, balanced | wallet receives payment |
| `sandbox-verifier` | replays exploit, verifies patch blocks it | no keys |
| `threshold-deployer` | holds upgrade authority shard, deploys on consensus | upgrade authority keypair |

## Quick start

### Prerequisites

- Node 20+
- Docker (for coral-server + agent containers)
- A funded devnet wallet (`node scripts/setup.js` then [faucet.solana.com](https://faucet.solana.com))
- An LLM key (Venice AI — free: `IMPERIAL50` at [venice.ai/settings/api](https://venice.ai/settings/api))

### 1. Setup (once)

```bash
git clone https://github.com/trilltino/solana_coralOS.git flashpatch && cd flashpatch
npm install --prefix scripts
node scripts/setup.js
# edit .env: add VENICE_API_KEY, set SIMULATE_EXPLOIT=1 for demo mode
```

### 2. Build the FlashPatch images

```bash
docker compose up -d coral       # start coral-server
bash build-flashpatch.sh         # build the 4 agent images
```

### 3. Run

```bash
# Terminal 1 — launch the swarm
npm run flashpatch

# Terminal 2 — feed server (parses session transcript)
FLASHPATCH_SESSION_ID=<session-id from terminal 1> npm run flashpatch:feed

# Terminal 3 — live dashboard
npm run flashpatch:web            # opens localhost:3030
```

### Demo mode

Set `SIMULATE_EXPLOIT=1` in `.env`. The exploit-detector fires a simulated exploit
5 seconds after startup — no real on-chain transaction needed to watch the full flow.

The escrow deposits and releases are always real devnet transactions regardless of
simulation mode.

## .env variables

| Variable | Description | Default |
|---|---|---|
| `SIMULATE_EXPLOIT` | Fire a demo exploit 5s after startup | unset |
| `VULNERABLE_PROGRAM_ID` | Devnet program to monitor | required for real detection |
| `SECURITY_BUDGET_SOL` | Max SOL to deposit per emergency | `0.05` |
| `THRESHOLD` | Verified passes required before deploy | `2` |
| `FLASHPATCH_SESSION_ID` | Session to track in the feed server | set after `npm run flashpatch` |
| `VENICE_API_KEY` | LLM key (free credits with IMPERIAL50) | required |
| `TRACE` | Set to `1` for verbose agent logs | unset |

## Architecture

The FlashPatch protocol extends the base CoralOS market wire format with five new
message types (`EXPLOIT_DETECTED`, `PATCH_SUBMITTED`, `SANDBOX_RESULT`,
`THRESHOLD_STATUS`, `PATCH_DEPLOYED`). All messages carry `round=` for correlation.

The patch registry (`examples/flashpatch/src/patch-registry.ts`) holds pre-audited
patch candidates for known vulnerability classes. In production, this registry grows
as new CVE patterns are discovered — the agent competition selects the best candidate
for the specific vulnerability rather than generating patches from scratch.

The escrow uses the same arbiter-gated contract as the rest of the kit (`R5NWNg9...`/
`FJtuVXsy...`), already deployed on devnet. The exploit-detector is the buyer; the
winning patch agent is the seller; payment releases only after verified deployment.

## Judging checklist

- Working demo: EXPLOIT_DETECTED -> WANT -> BID -> AWARD -> DEPOSITED -> DELIVERED -> VERIFIED -> PATCH_DEPLOYED -> ARBITER_RELEASED
- Explorer link: deposit tx (arbiter open), upgrade tx (memo proving authority), release tx
- Three competing agents with different price/confidence tradeoffs
- Independent verifier gates release — no verdict, no payment
- Threshold consensus before deployment
- All state visible in live dashboard
