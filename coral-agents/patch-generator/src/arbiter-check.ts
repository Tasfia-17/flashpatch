/**
 * Arbiter check helpers for patch-generator.
 *
 * The patch-generator only needs to verify that the escrow vault is funded —
 * it never signs or moves funds. These helpers are read-only wrappers around
 * the arbiter program's on-chain state.
 */

import { Connection, PublicKey } from '@solana/web3.js'
import { createHash } from 'node:crypto'

const ARBITER_PROGRAM = process.env.ARBITER_PROGRAM_ID ?? 'FJtuVXsyw6CLAqKEiGBzJaFBj4JbhzXC4drMoQ9ktXd'
const RPC             = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'

export function arbitratedEscrowPda(vault: PublicKey, reference: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), vault.toBuffer(), reference.toBuffer()],
    new PublicKey(ARBITER_PROGRAM),
  )
  return pda
}

export function makeArbiterReadOnly() {
  return new Connection(RPC, 'confirmed')
}

/** Check that the arbiter-gated escrow PDA holds at least `expectedSol`. */
export async function isArbiterFunded(
  vault: PublicKey,
  reference: PublicKey,
  expectedSol: number,
): Promise<boolean> {
  const conn = makeArbiterReadOnly()
  const pda  = arbitratedEscrowPda(vault, reference)
  try {
    const balance = await conn.getBalance(pda)
    return balance >= expectedSol * 1e9
  } catch {
    return false
  }
}
