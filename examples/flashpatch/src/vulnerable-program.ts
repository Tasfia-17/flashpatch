/**
 * Vulnerable Solana program simulation for FlashPatch demo.
 *
 * This module represents a known-vulnerable SPL-like vault program deployed on devnet.
 * The vulnerability: the withdraw instruction does not check whether the requested amount
 * exceeds the depositor's recorded balance. An attacker can withdraw more than they deposited.
 *
 * In the demo we use a fixed program address on devnet. The "exploit" is a pre-crafted
 * transaction that demonstrates the overflow. The exploit detector monitors this program's
 * transaction feed for the specific signature pattern.
 */

// Devnet program ID for our demo vault (deployed as part of setup).
// In a real deployment you would run: anchor deploy --provider.cluster devnet
export const VULNERABLE_PROGRAM_ID = process.env.VULNERABLE_PROGRAM_ID ?? 'DEMO_VAULT_PROGRAM_REPLACE_AFTER_DEPLOY'

export const EXPLOIT_SIGNATURES = {
  // These identify an integer overflow withdraw pattern in on-chain logs
  OVERFLOW_WITHDRAW: 'Program log: Error: arithmetic operation overflow',
  ABNORMAL_BALANCE_RATIO: 2.0, // withdraw/deposit ratio above this triggers alert
} as const

export interface VaultTransaction {
  signature: string
  slot: number
  blockTime: number | null
  instruction: 'deposit' | 'withdraw' | 'unknown'
  amount?: bigint
  depositor?: string
  success: boolean
  logs: string[]
}

export function classifyTransaction(logs: string[], success: boolean): 'exploit_attempt' | 'normal' | 'unknown' {
  if (!success) return 'unknown'
  const combined = logs.join('\n')
  if (combined.includes(EXPLOIT_SIGNATURES.OVERFLOW_WITHDRAW)) return 'exploit_attempt'
  if (combined.includes('invoke [1]') && combined.includes('withdraw')) {
    // Heuristic: successful withdraw with no balance check log is suspicious
    const hasBalanceCheck = combined.includes('balance_check: ok')
    if (!hasBalanceCheck) return 'exploit_attempt'
  }
  return 'normal'
}
