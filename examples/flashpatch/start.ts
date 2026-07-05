/**
 * FlashPatch session launcher.
 *
 * Starts a CoralOS session with the full FlashPatch swarm:
 *   - exploit-detector   monitors the vulnerable program, triggers emergency mode
 *   - patch-fast         cheap LLM-guided patch, 5s, lower confidence
 *   - patch-deep         static analysis + invariant check, 30s, high confidence
 *   - patch-hybrid       combines both, 15s, premium
 *   - sandbox-verifier   runs each patch through the exploit replay harness
 *   - threshold-deployer holds upgrade authority shard, deploys on consensus
 *
 * The escrow is the CoralOS arbiter: the protocol's security budget is deposited
 * when an exploit is detected and released to the winning patch agent + verifier
 * only after the program upgrade confirms on devnet.
 *
 * Usage: npm run flashpatch (from repo root)
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASE  = process.env.CORAL_SERVER_URL ?? 'http://localhost:5555'
const TOKEN = process.env.CORAL_TOKEN ?? 'dev'
const NS    = 'default'
const AUTH  = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

function loadEnv(): Record<string, string> {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const env: Record<string, string> = { ...(process.env as Record<string, string>) }
  try {
    for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* no .env */ }
  return env
}

const str = (value: string) => ({ type: 'string', value })
const f64 = (value: number) => ({ type: 'f64', value })

function agent(name: string, options: Record<string, unknown>) {
  return {
    id: { name, version: '0.1.0', registrySourceId: { type: 'local' } },
    name,
    provider: { type: 'local', runtime: 'docker' },
    options,
  }
}

async function main() {
  const env = loadEnv()

  const buyerKeypair = env.BUYER_KEYPAIR_B58
  const wallet       = env.WALLET
  if (!buyerKeypair || !wallet) {
    throw new Error('WALLET and BUYER_KEYPAIR_B58 must be set in .env — run `node scripts/setup.js`')
  }

  const rpc   = env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
  const trace = env.TRACE ?? ''

  const llmOpts: Record<string, unknown> = {}
  if (env.VENICE_API_KEY)    llmOpts.VENICE_API_KEY    = str(env.VENICE_API_KEY)
  if (env.OPENAI_API_KEY)    llmOpts.OPENAI_API_KEY    = str(env.OPENAI_API_KEY)
  if (env.ANTHROPIC_API_KEY) llmOpts.ANTHROPIC_API_KEY = str(env.ANTHROPIC_API_KEY)
  if (env.LLM_PROVIDER)      llmOpts.LLM_PROVIDER      = str(env.LLM_PROVIDER)
  if (env.LLM_MODEL)         llmOpts.LLM_MODEL         = str(env.LLM_MODEL)
  if (trace)                 llmOpts.TRACE              = str(trace)

  const programId = env.VULNERABLE_PROGRAM_ID ?? 'DEMO_VAULT_PROGRAM_REPLACE_AFTER_DEPLOY'

  const sharedSolanaOpts = {
    SOLANA_RPC_URL: str(rpc),
    VULNERABLE_PROGRAM_ID: str(programId),
    ...llmOpts,
  }

  const patchAgentOpts = (strategy: 'fast' | 'deep' | 'hybrid', floor: number) => ({
    PATCH_STRATEGY: str(strategy),
    FLOOR_SOL: f64(floor),
    SELLER_WALLET: str(wallet),
    AGENT_NAME: str(`patch-${strategy}`),
    ...sharedSolanaOpts,
  })

  const res = await fetch(`${BASE}/api/v1/local/session`, {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify({
      agentGraphRequest: {
        agents: [
          agent('exploit-detector', {
            AGENT_NAME: str('exploit-detector'),
            BUYER_KEYPAIR_B58: str(buyerKeypair),
            ARBITER_KEYPAIR_B58: str(env.ARBITER_KEYPAIR_B58 ?? ''),
            SECURITY_BUDGET_SOL: f64(Number(env.SECURITY_BUDGET_SOL ?? '0.05')),
            PATCH_AGENTS: str('patch-fast,patch-deep,patch-hybrid'),
            VERIFIER_AGENT: str('sandbox-verifier'),
            DEPLOYER_AGENT: str('threshold-deployer'),
            ...sharedSolanaOpts,
          }),
          agent('patch-fast',   patchAgentOpts('fast',   0.005)),
          agent('patch-deep',   patchAgentOpts('deep',   0.015)),
          agent('patch-hybrid', patchAgentOpts('hybrid', 0.010)),
          agent('sandbox-verifier', {
            AGENT_NAME: str('sandbox-verifier'),
            ...sharedSolanaOpts,
          }),
          agent('threshold-deployer', {
            AGENT_NAME: str('threshold-deployer'),
            DEPLOYER_KEYPAIR_B58: str(buyerKeypair),
            SELLER_WALLET: str(wallet),
            THRESHOLD: f64(2),
            ...sharedSolanaOpts,
          }),
        ],
      },
      namespaceProvider: {
        type: 'create_if_not_exists',
        namespaceRequest: { name: NS },
      },
      execution: { mode: 'immediate' },
    }),
  })

  if (!res.ok) {
    throw new Error(`session create failed: ${res.status} ${await res.text()}`)
  }

  const { sessionId } = await res.json() as { sessionId: string }

  console.log(`\nFlashPatch session ${sessionId} running.`)
  console.log(`  Program under guard: ${programId}`)
  console.log(`  Patch agents: patch-fast (0.005 SOL), patch-deep (0.015 SOL), patch-hybrid (0.010 SOL)`)
  console.log(`  Verifier:     sandbox-verifier`)
  console.log(`  Deployer:     threshold-deployer (threshold = 2)`)
  console.log(`  Wallet:       ${wallet}`)
  console.log(`\n  Watch logs:`)
  console.log(`    docker logs -f exploit-detector    # EXPLOIT_DETECTED -> WANT`)
  console.log(`    docker logs -f patch-fast          # BID -> PATCH_SUBMITTED -> DELIVERED`)
  console.log(`    docker logs -f sandbox-verifier    # SANDBOX_RESULT -> VERIFIED`)
  console.log(`    docker logs -f threshold-deployer  # THRESHOLD_STATUS -> PATCH_DEPLOYED`)
  console.log(`\n  Dashboard: npm run flashpatch:web\n`)
}

main().catch((e) => { console.error(`[flashpatch] ${e}`); process.exitCode = 1 })
