# FlashPatch

**Autonomous Emergency Patch Swarm for Solana Programs**

Built for the Imperial AI Agent Hackathon EP5 -- Solana x CoralOS Track.

---

## The Problem

When a Solana program is exploited, the upgrade authority must deploy a patch manually.
This requires multisig coordination, human review, and governance. In those hours,
millions in TVL drain. There is no autonomous system that detects, generates, verifies,
and deploys patches fast enough to matter.

## The Solution

FlashPatch is a CoralOS swarm of six autonomous agents that respond to a Solana program
exploit in under 60 seconds. Three patch agents compete by bidding on the emergency job.
The winning patch is verified by an independent sandbox agent. A threshold deployer fires
the on-chain program upgrade only when consensus is reached. Payment settles trustlessly
through a Solana arbiter escrow -- funds release only after the exploit is blocked.

No humans. No multisig delay. No counterparty risk.

---

## How It Works

```
EXPLOIT_DETECTED (exploit-detector monitors program, fires alert)
        |
        v
WANT (service=emergency_patch) ----------> patch-fast   [5s,  0.005 SOL, confidence 72%]
                                      +--> patch-deep   [30s, 0.015 SOL, confidence 95%]
                                      +--> patch-hybrid [15s, 0.010 SOL, confidence 91%]
                                                |
                                           BID (price + confidence + estimated time)
                                                |
                                           AWARD (exploit-detector picks winner)
                                                |
                                      ESCROW_REQUIRED (winner locks in terms)
                                                |
                                         DEPOSITED (arbiter-gated escrow on devnet)
                                                |
                                         DELIVERED (patch JSON artifact, sha256-bound)
                                                |
                                           VERIFY --> sandbox-verifier --> VERIFIED pass|fail
                                                |
                                      threshold-deployer (waits for 2-of-3 verified passes)
                                                |
                                       PATCH_DEPLOYED (on-chain upgrade memo tx)
                                                |
                                      ARBITER_RELEASED (payment to winning patch agent)
```

Every step is a real CoralOS MCP message. Every fund movement is a real devnet transaction.
Every Explorer link is verifiable.

---

## The Six Agents

| Agent | Role | Keys held |
|---|---|---|
| `exploit-detector` | Polls program transactions, detects exploit signatures, broadcasts WANT, opens arbiter escrow, gates release on verified deployment | Buyer keypair (signs deposit + release) |
| `patch-fast` | Cheap LLM-guided patch (checked_sub), 5s, confidence 72%, lowest bid | Seller wallet (receives payment) |
| `patch-deep` | Static analysis + full invariant assertions, 30s, confidence 95%, premium bid | Seller wallet (receives payment) |
| `patch-hybrid` | Anchor constraint macros + checked_sub, 15s, confidence 91%, mid bid | Seller wallet (receives payment) |
| `sandbox-verifier` | Replays exploit against each patch, verifies the overflow is blocked, emits VERIFIED pass/fail. Holds no keys, moves no funds. | None |
| `threshold-deployer` | Holds upgrade authority keypair shard, waits for 2-of-3 verified passes, fires on-chain program upgrade transaction | Upgrade authority keypair |

---

## Patch Registry

Rather than generating Rust patches from scratch under fire (unreliable), FlashPatch
uses a pre-audited patch registry (`examples/flashpatch/src/patch-registry.ts`). Each
entry addresses a known vulnerability class with a vetted fix. The three agents select
from this registry and compete on price, speed, and analysis depth.

For the integer overflow withdrawal vulnerability:

**patch-fast** -- simple `checked_sub`:
```rust
let new_balance = vault_account.balance
    .checked_sub(amount)
    .ok_or(VaultError::InsufficientFunds)?;
vault_account.balance = new_balance;
```

**patch-deep** -- checked arithmetic with explicit invariant assertions:
```rust
require!(ctx.accounts.depositor.key() == vault_account.owner, VaultError::Unauthorized);
require!(vault_account.balance >= amount, VaultError::InsufficientFunds);
let new_balance = vault_account.balance
    .checked_sub(amount)
    .ok_or(VaultError::Overflow)?;
require!(new_balance < vault_account.balance, VaultError::Overflow);
vault_account.balance = new_balance;
```

**patch-hybrid** -- Anchor `#[account]` constraint at the account validation layer:
```rust
// #[account(constraint = vault_account.balance >= amount @ VaultError::InsufficientFunds)]
let new_balance = vault_account.balance
    .checked_sub(amount)
    .ok_or(VaultError::Overflow)?;
vault_account.balance = new_balance;
```

---

## Project Structure

```
flashpatch/
+-- coral-agents/
|   +-- exploit-detector/       Exploit monitor + market buyer + escrow orchestrator
|   |   +-- src/index.ts
|   |   +-- coral-agent.toml
|   |   +-- Dockerfile
|   +-- patch-generator/        Shared implementation for all three patch personas
|   |   +-- src/index.ts
|   |   +-- src/arbiter-check.ts
|   |   +-- coral-agent.toml
|   |   +-- Dockerfile
|   +-- patch-fast/             Persona manifest (reuses patch-generator image)
|   |   +-- coral-agent.toml
|   +-- patch-deep/             Persona manifest (reuses patch-generator image)
|   |   +-- coral-agent.toml
|   +-- patch-hybrid/           Persona manifest (reuses patch-generator image)
|   |   +-- coral-agent.toml
|   +-- sandbox-verifier/       Independent exploit replay verifier, keyless
|   |   +-- src/index.ts
|   |   +-- coral-agent.toml
|   |   +-- Dockerfile
|   +-- threshold-deployer/     Consensus-gated program upgrade authority
|       +-- src/index.ts
|       +-- coral-agent.toml
|       +-- Dockerfile
+-- examples/flashpatch/
|   +-- src/
|   |   +-- protocol.ts         FlashPatch wire format (5 new message types)
|   |   +-- patch-registry.ts   Pre-audited patch candidates per vulnerability class
|   |   +-- vulnerable-program.ts Exploit classification logic + demo program constants
|   +-- feed/
|   |   +-- src/server.ts       HTTP feed server -- polls CoralOS session, exposes /api/state
|   +-- web/
|   |   +-- src/App.tsx         React live dashboard
|   |   +-- src/types.ts        Shared TypeScript types
|   |   +-- src/index.css       Dashboard styles
|   +-- start.ts                CoralOS session launcher (6-agent graph)
|   +-- README.md
+-- build-flashpatch.sh         Build all four Docker images from repo root
+-- package.json                Root npm scripts (flashpatch, flashpatch:feed, flashpatch:web)
+-- .env.example                All FlashPatch env vars documented
```

---

## Wire Protocol

FlashPatch extends the CoralOS base market protocol with five new message types.
All messages carry `round=` for correlation across the shared thread.

| Message | Sender | Payload |
|---|---|---|
| `EXPLOIT_DETECTED` | exploit-detector | `round= program= exploit_tx= detected_at= vuln_class=` |
| `PATCH_SUBMITTED` | patch agents | `round= strategy= patch_id= confidence= price= by= est_secs=` |
| `SANDBOX_RESULT` | sandbox-verifier | `round= patch_id= blocked= tests_passed= tests_failed= by= reason=` |
| `THRESHOLD_STATUS` | threshold-deployer | `round= needed= received= met= winning_patch= by=` |
| `PATCH_DEPLOYED` | threshold-deployer | `round= patch_id= upgrade_tx= program= elapsed_ms= by=` |

The base protocol messages (`WANT`, `BID`, `AWARD`, `ESCROW_REQUIRED`, `DEPOSITED`,
`DELIVERED`, `VERIFY`, `VERIFIED`, `ARBITER_RELEASED`) are used unmodified from
`@pay/agent-runtime`.

---

## Escrow

FlashPatch uses the same arbiter-gated escrow contract already deployed on devnet
by the starter kit:

- Escrow program: `R5NWNg9...CeXet`
- Arbiter program: `FJtuVXsy...ktXd`

The exploit-detector is the buyer. The winning patch agent is the seller. The arbiter
is a neutral 3rd signer -- the buyer cannot take delivery and also refund. Funds release
only after the sandbox-verifier emits `VERIFIED pass` and policy allows it.

State machine enforced by `enforce()` from `@pay/agent-runtime`:
- Spend caps (SECURITY_BUDGET_SOL per event)
- Payout binding (escrow seller address must match awarded agent's wallet)
- Verifier gate (release blocked unless VERIFIED pass received)

---

## Prerequisites

- Node 20+
- Docker (coral-server + agent containers)
- A funded devnet wallet -- run `node scripts/setup.js` then fund at [faucet.solana.com](https://faucet.solana.com)
- LLM key -- Venice AI recommended (free credits: sign up at [venice.ai](https://venice.ai/settings/api), redeem code `IMPERIAL50`)

---

## Quick Start

### 1. Clone and set up

```bash
git clone https://github.com/Tasfia-17/flashpatch.git && cd flashpatch
npm install --prefix scripts
node scripts/setup.js
```

Edit `.env`:
```bash
VENICE_API_KEY=your_key_here
SIMULATE_EXPLOIT=1          # fires a demo exploit 5s after startup
SECURITY_BUDGET_SOL=0.05
THRESHOLD=2
```

### 2. Build agent images

```bash
docker compose up -d coral      # start coral-server
bash build-flashpatch.sh        # builds exploit-detector, patch-generator, sandbox-verifier, threshold-deployer
```

### 3. Launch the swarm

```bash
npm run flashpatch
# Prints: "FlashPatch session <SESSION_ID> running."
```

### 4. Start the feed server

```bash
FLASHPATCH_SESSION_ID=<session-id> npm run flashpatch:feed
```

### 5. Open the dashboard

```bash
npm run flashpatch:web          # opens localhost:3030
```

### Watch agent logs directly

```bash
docker logs -f exploit-detector    # EXPLOIT_DETECTED -> WANT -> DEPOSITED -> ARBITER_RELEASED
docker logs -f patch-fast          # BID -> ESCROW_REQUIRED -> DELIVERED
docker logs -f sandbox-verifier    # VERIFY -> VERIFIED pass
docker logs -f threshold-deployer  # THRESHOLD_STATUS -> PATCH_DEPLOYED
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `SIMULATE_EXPLOIT` | Fire a demo exploit 5s after exploit-detector starts | unset |
| `VULNERABLE_PROGRAM_ID` | Devnet program address to monitor for real exploits | unset |
| `SECURITY_BUDGET_SOL` | Max SOL deposited per emergency event | `0.05` |
| `THRESHOLD` | Verified passes required before threshold-deployer fires | `2` |
| `FLASHPATCH_SESSION_ID` | CoralOS session to track in the feed server | set after launch |
| `VENICE_API_KEY` | Venice AI key (free credits with `IMPERIAL50`) | required |
| `BUYER_KEYPAIR_B58` | Base58 keypair that signs escrow deposit and release | generated by setup.js |
| `ARBITER_KEYPAIR_B58` | Neutral arbiter keypair for 3rd-party settlement | generated by setup.js |
| `WALLET` | Seller wallet pubkey (receives payment) | generated by setup.js |
| `SOLANA_RPC_URL` | Solana RPC endpoint | `https://api.devnet.solana.com` |
| `TRACE` | Set to `1` for verbose logs with Explorer links | unset |

---

## Demo Flow (with SIMULATE_EXPLOIT=1)

1. `exploit-detector` starts, waits 5 seconds, fires simulated exploit
2. `EXPLOIT_DETECTED round=1 program=... exploit_tx=SIMULATED_... vuln_class=integer_overflow`
3. `WANT round=1 service=emergency_patch arg=<program> budget=0.05` broadcast to all patch agents
4. All three patch agents respond with `BID` messages (different prices + confidence scores)
5. `exploit-detector` awards the highest-confidence bidder
6. Winner responds with `ESCROW_REQUIRED` including arbiter settlement terms
7. `exploit-detector` calls `openArbitrated()` -- real devnet transaction, funds locked
8. `DEPOSITED` sent to winner with vault PDA and deposit tx signature
9. Winner verifies escrow on-chain, runs patch generation (simulated analysis time), delivers JSON
10. `exploit-detector` sends `VERIFY` to `sandbox-verifier`
11. `sandbox-verifier` checks sha256 hash, parses patch JSON, runs exploit replay, replies `VERIFIED pass`
12. `threshold-deployer` tracks verified passes, reaches threshold=2, fires upgrade memo tx
13. `PATCH_DEPLOYED` broadcast with on-chain tx signature
14. `exploit-detector` calls `arbitrateRelease()` -- real devnet transaction, funds released to winner
15. `ARBITER_RELEASED` with release tx signature

Dashboard shows every step live. Three Explorer links at the end: deposit tx, upgrade tx, release tx.

---

## Judging Criteria Mapping

**Technology (40%)**

- Full CoralOS stack: 6-agent session graph, `startCoralAgent`, thread messaging, `waitForMention`, `waitForAgent`, `createThread`
- Market protocol: `WANT/BID/AWARD/ESCROW_REQUIRED/DEPOSITED/DELIVERED/VERIFY/VERIFIED/ARBITER_RELEASED`
- Arbiter escrow: `openArbitrated`, `arbitrateRelease` with real devnet transactions
- Policy enforcement: `enforce()` with spend caps, payout binding, verifier gate
- Extended protocol: 5 new FlashPatch message types built on the base wire format
- Three competing agent personas sharing one Docker image, differentiated by `coral-agent.toml`

**Impact (30%)**

- Service: emergency patch for Solana DeFi programs
- Customer: any DeFi protocol with a deployed Solana program (every Anchor protocol qualifies)
- Monetization: security retainer (deposit SECURITY_BUDGET_SOL, pay per emergency)
- Settlement that holds under dispute: arbiter ensures buyer cannot refund after receiving delivery

**Creativity and UX (30%)**

- Novel mechanism: competitive patch bidding with confidence scoring, not just cheapest wins
- Threshold consensus gate before deployment -- defense against a single compromised patch agent
- Live React dashboard showing the full lifecycle from exploit alert to payment receipt
- Clear visual state machine (IDLE to RELEASED) with Explorer links embedded in timeline

---

## Security Considerations

- `exploit-detector` is the only agent that holds funds. Patch agents, the verifier, and the
  deployer hold no buyer funds at any point.
- The verifier is keyless by design -- it cannot influence settlement directly, only by providing
  a verdict that the policy layer at the buyer trusts.
- The threshold deployer holds an upgrade authority shard but not the escrow funds. The two
  authorities are separated: financial authority stays with the buyer keypair.
- All `enforce()` calls gate both the deposit and the release. A missing verifier verdict leaves
  funds in escrow and refundable after the deadline -- the buyer is never silently exposed.
- Devnet only. `solanaConnection()` from `@pay/agent-runtime` throws on a mainnet RPC unless
  `ALLOW_MAINNET=1` is explicitly set.

---

## Built On

- [CoralOS](https://docs.coralos.ai) -- agent orchestration, session management, MCP coordination
- [Solana web3.js](https://solana-labs.github.io/solana-web3.js/) -- on-chain transactions
- [Anchor](https://anchor-lang.com) -- escrow program client
- [Venice AI](https://venice.ai) -- LLM provider (OpenAI-compatible, free credits for hackathon)
- [Vite](https://vitejs.dev) + [React](https://react.dev) -- live dashboard
- Starter kit: [github.com/trilltino/solana_coralOS](https://github.com/trilltino/solana_coralOS)

---

## License

MIT
