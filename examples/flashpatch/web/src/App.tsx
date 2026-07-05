/**
 * FlashPatch Dashboard
 *
 * Polls the feed server (localhost:4040/api/state) every 500ms and renders
 * the live emergency patch lifecycle:
 *
 *   IDLE -> EXPLOIT_DETECTED -> PATCHING -> VERIFIED -> DEPLOYED -> RELEASED
 *
 * Each panel maps to one layer of the swarm:
 *   - Exploit Alert: the detected transaction with Explorer link
 *   - Patch Competition: the three agents bidding with price / confidence
 *   - Sandbox Verification: pass/fail results per patch
 *   - Threshold & Deploy: consensus status and on-chain upgrade tx
 *   - Settlement: escrow deposit -> release Explorer links
 *   - Log Stream: raw agent messages in chronological order
 */

import { useEffect, useRef, useState } from 'react'
import type { FeedState } from './types'

const EXPLORER = (kind: 'tx' | 'address', id: string) =>
  `https://explorer.solana.com/${kind}/${id}?cluster=devnet`

const POLL_MS = 500

// State machine step ordering for the banner
const STATE_STEPS = [
  'IDLE',
  'EXPLOIT_DETECTED',
  'PATCHING',
  'VERIFIED',
  'DEPLOYED',
  'RELEASED',
] as const

function stepStatus(current: string, step: string): 'done' | 'active' | 'pending' {
  const ci = STATE_STEPS.indexOf(current as typeof STATE_STEPS[number])
  const si = STATE_STEPS.indexOf(step as typeof STATE_STEPS[number])
  if (si < ci) return 'done'
  if (si === ci) return 'active'
  return 'pending'
}

function elapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function shortSig(sig: string): string {
  if (sig.startsWith('SIMULATED_') || sig.startsWith('DEPLOY_SIMULATED_')) return sig
  return `${sig.slice(0, 8)}...${sig.slice(-6)}`
}

export default function App() {
  const [state, setState] = useState<FeedState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      if (cancelled) return
      try {
        const res = await fetch('/api/state')
        if (!res.ok) throw new Error(`feed returned ${res.status}`)
        const data = await res.json() as FeedState
        if (!cancelled) {
          setState(data)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
      if (!cancelled) setTimeout(poll, POLL_MS)
    }

    poll()
    return () => { cancelled = true }
  }, [])

  // Auto-scroll the log stream
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [state?.logs])

  if (error) {
    return (
      <div>
        <div className="header">
          <div className="pulse-dot idle" />
          <div>
            <div className="header h1">FlashPatch</div>
          </div>
        </div>
        <div className="idle-banner">
          <h2>Feed server not running</h2>
          <p>Start with: <code>npm run flashpatch:feed</code></p>
          <p style={{ marginTop: 8, color: '#ef4444' }}>{error}</p>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="idle-banner" style={{ paddingTop: 80 }}>
        <p>Connecting to feed...</p>
      </div>
    )
  }

  const phase = state.phase ?? 'IDLE'
  const isLive = phase !== 'IDLE'

  return (
    <div>
      {/* Header */}
      <div className="header">
        <div className={`pulse-dot ${isLive ? 'active' : 'idle'}`} />
        <div>
          <div className="header h1" style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>
            FlashPatch
          </div>
          <div className="subtitle">
            Autonomous Emergency Patch Swarm for Solana Programs
          </div>
        </div>
        {state.round != null && state.round > 0 && (
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#475569' }}>
            Round {state.round}
          </div>
        )}
      </div>

      {/* State machine banner */}
      <div className="state-banner">
        {STATE_STEPS.map((step, i) => (
          <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`state-step ${stepStatus(phase, step)}`}>
              <span className="label">{step}</span>
            </div>
            {i < STATE_STEPS.length - 1 && (
              <span className="state-arrow">&#8594;</span>
            )}
          </div>
        ))}
      </div>

      {/* IDLE state */}
      {phase === 'IDLE' && (
        <div className="idle-banner">
          <h2>Monitoring {state.programId ? state.programId.slice(0, 16) + '...' : 'program'}</h2>
          <p>Polling every 2s. Waiting for exploit signature...</p>
          {state.simulateMode && (
            <p style={{ color: '#fbbf24', marginTop: 8 }}>
              SIMULATE_EXPLOIT=1 — demo exploit will fire in ~5s after agent startup
            </p>
          )}
        </div>
      )}

      {/* Active emergency */}
      {phase !== 'IDLE' && (
        <>
          {/* Exploit alert */}
          {state.exploit && (
            <div className="exploit-alert">
              <div className="alert-title">
                <span>&#x26A0;</span>
                EXPLOIT DETECTED
              </div>
              <div className="alert-row">
                <span>Program:</span>
                {state.exploit.programId}
              </div>
              <div className="alert-row">
                <span>Exploit Tx:</span>
                {state.exploit.exploitTxSig.startsWith('SIMULATED_') ? (
                  <span style={{ color: '#fbbf24' }}>{state.exploit.exploitTxSig} (demo)</span>
                ) : (
                  <a href={EXPLORER('tx', state.exploit.exploitTxSig)} target="_blank" rel="noreferrer">
                    {shortSig(state.exploit.exploitTxSig)} &#x2197;
                  </a>
                )}
              </div>
              <div className="alert-row">
                <span>Vuln class:</span>
                {state.exploit.vulnerabilityClass}
              </div>
              <div className="alert-row">
                <span>Detected:</span>
                {new Date(state.exploit.detectedAt).toISOString()}
              </div>
            </div>
          )}

          {/* Stats row */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Elapsed</div>
              <div className={`stat-value ${phase === 'RELEASED' ? 'success' : 'warning'}`}>
                {state.elapsedMs != null ? elapsed(state.elapsedMs) : '--'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Bids</div>
              <div className="stat-value info">{state.bids?.length ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Verified</div>
              <div className={`stat-value ${(state.verifiedCount ?? 0) >= 2 ? 'success' : 'warning'}`}>
                {state.verifiedCount ?? 0} / {state.threshold ?? 2}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Escrow</div>
              <div className={`stat-value ${phase === 'RELEASED' ? 'success' : 'info'}`}>
                {state.depositedSol != null ? `${state.depositedSol} SOL` : '--'}
              </div>
            </div>
          </div>

          {/* Deployed banner */}
          {phase === 'RELEASED' && state.deployedPatch && (
            <div className="deployed-banner">
              <h2>&#x2705; Patch Deployed &amp; Escrow Released</h2>
              <p>Patch: <strong>{state.deployedPatch.patchId}</strong></p>
              <p>Strategy: <strong>{state.deployedPatch.strategy}</strong></p>
              <p>Time to patch: <strong>{elapsed(state.elapsedMs ?? 0)}</strong></p>
              {state.deployedPatch.upgradeTxSig && !state.deployedPatch.upgradeTxSig.startsWith('DEPLOY_SIMULATED_') && (
                <p style={{ marginTop: 8 }}>
                  <a className="tx-link" href={EXPLORER('tx', state.deployedPatch.upgradeTxSig)} target="_blank" rel="noreferrer">
                    Upgrade Tx: {shortSig(state.deployedPatch.upgradeTxSig)} &#x2197;
                  </a>
                </p>
              )}
              {state.releaseSig && !state.releaseSig.startsWith('SIM') && (
                <p>
                  <a className="tx-link" href={EXPLORER('tx', state.releaseSig)} target="_blank" rel="noreferrer">
                    Escrow Release: {shortSig(state.releaseSig)} &#x2197;
                  </a>
                </p>
              )}
            </div>
          )}

          <div className="grid">
            {/* Patch competition panel */}
            <div className="panel">
              <div className="panel-header">
                Patch Competition
                <span style={{ fontSize: 10, color: '#475569' }}>3 agents competing</span>
              </div>
              <div className="panel-body">
                {(!state.bids || state.bids.length === 0) ? (
                  <div className="empty-state">
                    <div className="empty-icon">&#x23F3;</div>
                    <div>Waiting for bids...</div>
                  </div>
                ) : (
                  <div className="bid-list">
                    {state.bids.map(bid => {
                      const isWinner = bid.by === state.winner
                      const vr = state.verificationResults?.find(r => r.by === bid.by)
                      const cardClass = isWinner && phase === 'RELEASED' ? 'winner'
                        : vr?.blocked === false ? 'failed'
                        : vr ? 'verifying'
                        : ''
                      return (
                        <div key={bid.by} className={`bid-card ${cardClass}`}>
                          <div className="agent-name">
                            {bid.by}
                            <span className={`strategy-badge ${bid.strategy ?? 'fast'}`}>
                              {bid.strategy ?? 'fast'}
                            </span>
                          </div>
                          <div className="bid-right">
                            <span className="confidence">{bid.confidence != null ? `${(bid.confidence * 100).toFixed(0)}%` : ''}</span>
                            <span className="price">{bid.priceSol} SOL</span>
                            {isWinner ? (
                              <span className="status-tag awarded">AWARDED</span>
                            ) : vr ? (
                              <span className={`status-tag ${vr.blocked ? 'pass' : 'fail'}`}>
                                {vr.blocked ? 'PASS' : 'FAIL'}
                              </span>
                            ) : (
                              <span className="status-tag waiting">BID</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Settlement timeline panel */}
            <div className="panel">
              <div className="panel-header">
                Settlement Timeline
              </div>
              <div className="panel-body">
                <div className="timeline">
                  <TimelineItem
                    label="EXPLOIT_DETECTED"
                    status={phase !== 'IDLE' ? 'done' : 'pending'}
                    detail={state.exploit ? new Date(state.exploit.detectedAt).toLocaleTimeString() : undefined}
                  />
                  <TimelineItem
                    label="WANT broadcasted"
                    status={['PATCHING','VERIFIED','DEPLOYED','RELEASED'].includes(phase) ? 'done' : phase === 'EXPLOIT_DETECTED' ? 'active' : 'pending'}
                  />
                  <TimelineItem
                    label="AWARD + ESCROW_REQUIRED"
                    status={['VERIFIED','DEPLOYED','RELEASED'].includes(phase) ? 'done' : phase === 'PATCHING' ? 'active' : 'pending'}
                    detail={state.winner ? `Winner: ${state.winner}` : undefined}
                  />
                  <TimelineItem
                    label="DEPOSITED"
                    status={['VERIFIED','DEPLOYED','RELEASED'].includes(phase) ? 'done' : phase === 'PATCHING' && state.depositSig ? 'active' : 'pending'}
                    detail={state.depositSig && !state.depositSig.startsWith('SIM') ? (
                      <a href={EXPLORER('tx', state.depositSig)} target="_blank" rel="noreferrer">
                        {shortSig(state.depositSig)} &#x2197;
                      </a>
                    ) : state.depositedSol ? `${state.depositedSol} SOL locked` : undefined}
                  />
                  <TimelineItem
                    label="SANDBOX VERIFIED"
                    status={['DEPLOYED','RELEASED'].includes(phase) ? 'done' : phase === 'VERIFIED' ? 'active' : 'pending'}
                    detail={state.verifiedCount != null ? `${state.verifiedCount}/${state.threshold} passed` : undefined}
                  />
                  <TimelineItem
                    label="PATCH_DEPLOYED"
                    status={phase === 'RELEASED' ? 'done' : phase === 'DEPLOYED' ? 'active' : 'pending'}
                    detail={state.deployedPatch?.upgradeTxSig && !state.deployedPatch.upgradeTxSig.startsWith('DEPLOY_SIMULATED_') ? (
                      <a href={EXPLORER('tx', state.deployedPatch.upgradeTxSig)} target="_blank" rel="noreferrer">
                        {shortSig(state.deployedPatch.upgradeTxSig)} &#x2197;
                      </a>
                    ) : undefined}
                  />
                  <TimelineItem
                    label="ARBITER_RELEASED"
                    status={phase === 'RELEASED' ? 'done' : 'pending'}
                    detail={state.releaseSig && !state.releaseSig.startsWith('SIM') ? (
                      <a href={EXPLORER('tx', state.releaseSig)} target="_blank" rel="noreferrer">
                        {shortSig(state.releaseSig)} &#x2197;
                      </a>
                    ) : undefined}
                  />
                </div>
              </div>
            </div>

            {/* Verification results panel */}
            {state.verificationResults && state.verificationResults.length > 0 && (
              <div className="panel">
                <div className="panel-header">Sandbox Verification</div>
                <div className="panel-body">
                  <div className="bid-list">
                    {state.verificationResults.map(r => (
                      <div key={r.patchId} className={`bid-card ${r.blocked ? 'winner' : 'failed'}`}>
                        <div className="agent-name">
                          {r.patchId}
                        </div>
                        <div className="bid-right">
                          <span style={{ fontSize: 11, color: '#64748b' }}>
                            {r.testsPassed}&#x2713; {r.testsFailed}&#x2717;
                          </span>
                          <span className={`status-tag ${r.blocked ? 'pass' : 'fail'}`}>
                            {r.blocked ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Threshold panel */}
            {state.thresholdStatus && (
              <div className="panel">
                <div className="panel-header">Threshold Consensus</div>
                <div className="panel-body">
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Consensus progress</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        flex: 1, height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.min(100, (state.thresholdStatus.agreementsReceived / state.thresholdStatus.agreementsNeeded) * 100)}%`,
                          background: state.thresholdStatus.met ? '#22c55e' : '#fbbf24',
                          borderRadius: 4,
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: state.thresholdStatus.met ? '#22c55e' : '#fbbf24' }}>
                        {state.thresholdStatus.agreementsReceived}/{state.thresholdStatus.agreementsNeeded}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Winning patch: <span style={{ color: '#f8fafc' }}>{state.thresholdStatus.winningPatchId}</span>
                  </div>
                  {state.thresholdStatus.met && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
                      &#x2705; Threshold met — deploying
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Log stream */}
          <div className="panel full-width">
            <div className="panel-header">
              Live Agent Messages
              <span style={{ fontSize: 10, color: '#334155' }}>{state.logs?.length ?? 0} messages</span>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              <div className="log-stream" ref={logRef}>
                {(!state.logs || state.logs.length === 0) ? (
                  <div style={{ color: '#334155', padding: '4px 0' }}>No messages yet.</div>
                ) : (
                  state.logs.map((log, i) => (
                    <div key={i} className="log-line">
                      <span className="log-time">{new Date(log.ts).toLocaleTimeString('en-US', { hour12: false })}</span>
                      <span className="log-agent">[{log.agent}]</span>
                      <span className={`log-msg ${log.highlight ? 'highlight' : log.error ? 'error' : ''}`}>
                        {log.text}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface TimelineItemProps {
  label: string
  status: 'done' | 'active' | 'pending'
  detail?: React.ReactNode
}

function TimelineItem({ label, status, detail }: TimelineItemProps) {
  return (
    <div className="timeline-item">
      <div className={`timeline-dot ${status}`} />
      <div className="timeline-content">
        <div className={`timeline-label ${status}`}>{label}</div>
        {detail && <div className="timeline-detail">{detail}</div>}
      </div>
    </div>
  )
}
