/**
 * Patch registry — pre-audited patch candidates for known vulnerability classes.
 *
 * In a production FlashPatch deployment, this registry is maintained by the protocol's
 * security team and updated as new vulnerability patterns are discovered. Each entry
 * contains the patch code, the vulnerability class it addresses, and static analysis results.
 *
 * For the demo: we have three patches for the integer overflow withdrawal vulnerability.
 * They differ in implementation approach, which drives the agent bidding competition.
 */

export type PatchStrategy = 'fast' | 'deep' | 'hybrid'

export interface PatchCandidate {
  id: string
  strategy: PatchStrategy
  vulnerabilityClass: 'integer_overflow' | 'reentrancy' | 'access_control'
  description: string
  // The patched Rust code snippet that replaces the vulnerable section
  patchedInstruction: string
  // Results from static analysis tools (populated by DeepBot / HybridBot)
  staticAnalysis?: {
    clippyWarnings: number
    unusedImports: number
    unsafeBlocks: number
    passed: boolean
  }
  // Confidence score 0..1 — agents set this before bidding
  confidence: number
  // Estimated seconds to apply this patch
  estimatedSecs: number
}

// Patch A: simple checked_sub — fast, minimal change, misses edge cases
const PATCH_FAST: PatchCandidate = {
  id: 'patch-overflow-fast-v1',
  strategy: 'fast',
  vulnerabilityClass: 'integer_overflow',
  description: 'Replace unchecked subtraction with checked_sub. Fast, minimal diff.',
  patchedInstruction: `
// PATCHED: use checked arithmetic to prevent integer overflow
let new_balance = vault_account.balance
    .checked_sub(amount)
    .ok_or(VaultError::InsufficientFunds)?;
vault_account.balance = new_balance;
`.trim(),
  confidence: 0.72,
  estimatedSecs: 5,
}

// Patch B: checked_sub + explicit balance invariant assertion — slower, more thorough
const PATCH_DEEP: PatchCandidate = {
  id: 'patch-overflow-deep-v1',
  strategy: 'deep',
  vulnerabilityClass: 'integer_overflow',
  description: 'checked_sub with pre/post balance invariant assertions and access control check.',
  patchedInstruction: `
// PATCHED: full invariant check — balance, ownership, and arithmetic safety
require!(
    ctx.accounts.depositor.key() == vault_account.owner,
    VaultError::Unauthorized
);
require!(
    vault_account.balance >= amount,
    VaultError::InsufficientFunds
);
let new_balance = vault_account.balance
    .checked_sub(amount)
    .ok_or(VaultError::Overflow)?;
// Invariant: post-withdrawal balance must be < pre-withdrawal balance
require!(new_balance < vault_account.balance, VaultError::Overflow);
vault_account.balance = new_balance;
`.trim(),
  staticAnalysis: {
    clippyWarnings: 0,
    unusedImports: 0,
    unsafeBlocks: 0,
    passed: true,
  },
  confidence: 0.95,
  estimatedSecs: 30,
}

// Patch C: checked_sub + invariant + Anchor constraint macros — best of both
const PATCH_HYBRID: PatchCandidate = {
  id: 'patch-overflow-hybrid-v1',
  strategy: 'hybrid',
  vulnerabilityClass: 'integer_overflow',
  description: 'Hybrid: fast checked_sub plus Anchor #[account] constraints for declarative safety.',
  patchedInstruction: `
// PATCHED: Anchor constraint macro ensures balance >= amount at the account validation layer,
// eliminating the need for a runtime require! (defense in depth).
// #[account(constraint = vault_account.balance >= amount @ VaultError::InsufficientFunds)]
let new_balance = vault_account.balance
    .checked_sub(amount)
    .ok_or(VaultError::Overflow)?;
vault_account.balance = new_balance;
`.trim(),
  staticAnalysis: {
    clippyWarnings: 0,
    unusedImports: 0,
    unsafeBlocks: 0,
    passed: true,
  },
  confidence: 0.91,
  estimatedSecs: 15,
}

export const PATCH_REGISTRY: Record<PatchStrategy, PatchCandidate> = {
  fast: PATCH_FAST,
  deep: PATCH_DEEP,
  hybrid: PATCH_HYBRID,
}

export function getPatch(strategy: PatchStrategy): PatchCandidate {
  return PATCH_REGISTRY[strategy]
}

/**
 * Verify a patch candidate against the known exploit transaction.
 *
 * In production this calls solana-test-validator with --clone from devnet,
 * applies the patch, and replays the exploit transaction to check if the
 * withdraw is blocked. For the demo, the outcome is deterministic per patch:
 * all three patches block the overflow, but with different confidence levels.
 */
export function verifyPatchAgainstExploit(patch: PatchCandidate, exploitTxSig: string): {
  blocked: boolean
  reason: string
  testsPassed: number
  testsFailed: number
} {
  // In the demo, all patches block the exploit. The distinction is confidence.
  // DeepBot and HybridBot pass static analysis; FastBot does not.
  const passedStaticAnalysis = patch.staticAnalysis?.passed ?? false

  if (patch.strategy === 'fast') {
    return {
      blocked: true,
      reason: 'checked_sub blocks the overflow. No static analysis run — confidence lower.',
      testsPassed: 3,
      testsFailed: 0,
    }
  }

  return {
    blocked: true,
    reason: `Exploit transaction blocked. ${passedStaticAnalysis ? 'Static analysis: 0 warnings.' : ''} Invariants hold.`,
    testsPassed: 6,
    testsFailed: 0,
  }
}
