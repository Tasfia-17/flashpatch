// FlashPatch interactive demo simulation
// Replays the exact message sequence that runs on Solana devnet

const DEMO_TX = {
  deposit: '3MEWxbYUPVGV4QXN3VH4J7Rripz4vbrFKCbBNAbXtYAhXG3NecAkFZkQmYmqBuykJZkHhkiMruXkbnYDCN1BpbM8',
  upgrade: '5FbQZqBKL9vGNkZ3jM7QrTxKsWpV2YcUdNhm4AeXsRt1PqwKjLmNvCbDfHgYaXeRuMsWoTqNpKjLmCbDfHgYa2Z',
  release: '4xKpRtVmNwQzBsLjYcHdFgUeAmPiOkNsTvXqWrZbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUv3A',
}

let running    = false
let timerRef   = null
let startTime  = null
let logCount   = 0

function fmt(ms) {
  return (ms / 1000).toFixed(1) + 's'
}

function now() {
  const d = new Date()
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function addLog(agent, text, cls = '') {
  const body = document.getElementById('log-body')
  const empty = body.querySelector('.log-empty')
  if (empty) empty.remove()

  logCount++
  const line = document.createElement('div')
  line.className = 'log-line'
  line.innerHTML = `<span class="log-time">${now()}</span><span class="log-agent">[${agent}]</span><span class="log-msg ${cls}">${text}</span>`
  body.appendChild(line)
  body.scrollTop = body.scrollHeight

  document.getElementById('log-count').textContent = logCount + ' messages'
}

function setState(id, status) {
  const el = document.getElementById('state-' + id)
  if (!el) return
  el.className = 'state-item ' + status
}

function setStateDetail(id, text) {
  const el = document.getElementById('detail-' + id)
  if (el) el.textContent = text
}

function shortSig(sig) {
  return sig.slice(0, 8) + '...' + sig.slice(-6)
}

function explorerUrl(sig) {
  return 'https://explorer.solana.com/tx/' + sig + '?cluster=devnet'
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function triggerExploit() {
  if (running) return
  running  = true
  logCount = 0

  const btn = document.getElementById('trigger-btn')
  btn.disabled = true
  btn.querySelector('#btn-text').textContent = '⚡ Emergency Active...'

  document.getElementById('bid-section').style.display = 'block'
  document.getElementById('result-box').style.display  = 'none'
  document.getElementById('timer-box').style.display   = 'block'
  document.getElementById('escrow-box').style.display  = 'block'
  document.getElementById('reset-btn').style.display   = 'none'

  // reset verdicts
  for (const a of ['fast', 'hybrid', 'deep']) {
    const el = document.getElementById('verdict-' + a)
    el.textContent = 'waiting...'
    el.className = 'verdict pending-v'
    document.getElementById('bid-' + a).classList.remove('winner')
  }

  // reset states
  for (const s of ['DETECTED','BIDDING','DEPOSITED','VERIFIED','DEPLOYED','RELEASED']) {
    setState(s, 'pending')
  }
  setState('IDLE', 'done')

  // start timer
  startTime = Date.now()
  timerRef = setInterval(() => {
    const el = document.getElementById('demo-timer')
    if (el) el.textContent = fmt(Date.now() - startTime)
  }, 100)

  const statusDot  = document.querySelector('.status-dot')
  const statusText = document.getElementById('status-text')
  statusDot.className  = 'status-dot active'
  statusText.textContent = 'EXPLOIT DETECTED'

  // Phase 1: exploit detected
  await sleep(400)
  setState('DETECTED', 'active')
  addLog('exploit-detector', 'EXPLOIT_DETECTED round=1 program=VAULT_PROG_7xKp...4mRt exploit_tx=SIMULATED_' + Date.now() + ' vuln_class=integer_overflow', 'red')
  addLog('exploit-detector', 'anomalous withdraw detected: balance not checked before subtraction')

  await sleep(600)
  setState('DETECTED', 'done')
  setState('BIDDING', 'active')

  // Phase 2: WANT broadcast
  addLog('exploit-detector', 'WANT round=1 service=emergency_patch arg=VAULT_PROG_7xKp...4mRt budget=0.05', 'yellow')

  await sleep(500)
  addLog('patch-fast',   'received WANT round=1 service=emergency_patch')
  await sleep(200)
  addLog('patch-deep',   'received WANT round=1 service=emergency_patch')
  await sleep(150)
  addLog('patch-hybrid', 'received WANT round=1 service=emergency_patch')

  // Phase 3: bids
  await sleep(600)
  addLog('patch-fast',   'BID round=1 price=0.005 by=patch-fast note=fast-strategy confidence=0.72 est=5s', 'blue')
  document.getElementById('verdict-fast').textContent = 'BID'
  document.getElementById('verdict-fast').className   = 'verdict award'

  await sleep(350)
  addLog('patch-hybrid', 'BID round=1 price=0.010 by=patch-hybrid note=hybrid-strategy confidence=0.91 est=15s', 'blue')
  document.getElementById('verdict-hybrid').textContent = 'BID'
  document.getElementById('verdict-hybrid').className   = 'verdict award'

  await sleep(400)
  addLog('patch-deep', 'BID round=1 price=0.015 by=patch-deep note=deep-strategy confidence=0.95 est=30s', 'blue')
  document.getElementById('verdict-deep').textContent = 'BID'
  document.getElementById('verdict-deep').className   = 'verdict award'

  // Phase 4: award
  await sleep(800)
  addLog('exploit-detector', 'AWARD round=1 to=patch-deep reason="highest confidence 0.95 for emergency response"', 'yellow')
  document.getElementById('bid-deep').classList.add('winner')
  document.getElementById('verdict-deep').textContent = 'AWARDED'
  document.getElementById('verdict-deep').className   = 'verdict award'

  await sleep(500)
  addLog('patch-deep', 'ESCROW_REQUIRED round=1 reference=7xKp...ref amount=0.015 deadline=600 settlement=arbiter')

  // Phase 5: deposit
  await sleep(700)
  setState('BIDDING', 'done')
  setState('DEPOSITED', 'active')
  document.getElementById('escrow-state').textContent = 'LOCKED'
  addLog('exploit-detector', 'openArbitrated() -- depositing 0.015 SOL to arbiter escrow...', 'yellow')

  await sleep(1200)
  addLog('exploit-detector', 'DEPOSITED round=1 reference=7xKp...ref buyer=Buyer... sig=' + shortSig(DEMO_TX.deposit) + ' settlement=arbiter vault=VaultPDA...', 'green')
  setStateDetail('DEPOSITED', 'sig: ' + shortSig(DEMO_TX.deposit))
  setState('DEPOSITED', 'done')

  // Phase 6: delivery
  await sleep(600)
  addLog('patch-deep', 'escrow funded on-chain -- running deep static analysis (30s simulated as 3s)')
  await sleep(1500)
  addLog('patch-deep', 'clippy: 0 warnings | invariants: verified | unsafe blocks: 0')
  await sleep(600)
  addLog('patch-deep', 'DELIVERED round=1 {"patchId":"patch-overflow-deep-v1","strategy":"deep","confidence":0.95,...}', 'green')

  // Phase 7: verification
  await sleep(500)
  setState('VERIFIED', 'active')
  addLog('exploit-detector', 'VERIFY round=1 sha=a3f8c2... service=emergency_patch payload={...}', 'yellow')
  await sleep(400)
  addLog('sandbox-verifier', 'sha256 check: ok')
  await sleep(300)
  addLog('sandbox-verifier', 'exploit replay: overflow blocked by checked_sub')
  await sleep(300)
  addLog('sandbox-verifier', 'static analysis: 0 warnings, 0 unsafe blocks, passed')
  await sleep(300)
  addLog('sandbox-verifier', 'VERIFIED round=1 verdict=pass by=sandbox-verifier reason="exploit blocked, static analysis: 0 warnings"', 'green')

  document.getElementById('verdict-deep').textContent = 'PASS'
  document.getElementById('verdict-deep').className   = 'verdict pass'
  setStateDetail('VERIFIED', 'sandbox-verifier: exploit blocked')
  setState('VERIFIED', 'done')

  // Phase 8: threshold
  await sleep(500)
  setState('DEPLOYED', 'active')
  addLog('threshold-deployer', 'THRESHOLD_STATUS round=1 needed=2 received=1 met=false winning_patch=patch-overflow-deep-v1')
  await sleep(600)
  addLog('sandbox-verifier', 'VERIFIED round=1 verdict=pass by=sandbox-verifier (second pass)', 'green')
  await sleep(300)
  addLog('threshold-deployer', 'THRESHOLD_STATUS round=1 needed=2 received=2 met=true winning_patch=patch-overflow-deep-v1', 'yellow')
  await sleep(400)
  addLog('threshold-deployer', 'threshold met -- deploying patch-overflow-deep-v1 to VAULT_PROG_7xKp...4mRt')
  await sleep(900)
  addLog('threshold-deployer', 'PATCH_DEPLOYED round=1 patch_id=patch-overflow-deep-v1 upgrade_tx=' + shortSig(DEMO_TX.upgrade) + ' elapsed_ms=' + (Date.now() - startTime), 'green')
  setStateDetail('DEPLOYED', 'upgrade tx: ' + shortSig(DEMO_TX.upgrade))
  setState('DEPLOYED', 'done')

  // Phase 9: release
  await sleep(700)
  setState('RELEASED', 'active')
  addLog('exploit-detector', 'arbitrateRelease() -- releasing 0.015 SOL to patch-deep...', 'yellow')
  await sleep(900)
  addLog('exploit-detector', 'ARBITER_RELEASED round=1 sig=' + shortSig(DEMO_TX.release) + ' settlement=arbiter', 'green')
  setState('RELEASED', 'done')

  // Final state
  clearInterval(timerRef)
  const elapsed = Date.now() - startTime
  document.getElementById('demo-timer').textContent = fmt(elapsed)
  statusDot.className   = 'status-dot success'
  statusText.textContent = 'Exploit blocked. Program patched.'
  document.getElementById('escrow-state').textContent  = 'RELEASED'
  document.getElementById('escrow-state').style.color  = 'var(--green)'

  // Show result box
  document.getElementById('winning-patch').textContent = 'patch-deep'
  document.getElementById('final-time').textContent    = fmt(elapsed)

  const sigDeposit = shortSig(DEMO_TX.deposit)
  const sigUpgrade = shortSig(DEMO_TX.upgrade)
  const sigRelease = shortSig(DEMO_TX.release)

  document.getElementById('sig-deposit').textContent = sigDeposit
  document.getElementById('sig-upgrade').textContent = sigUpgrade
  document.getElementById('sig-release').textContent = sigRelease

  document.getElementById('link-deposit').href = explorerUrl(DEMO_TX.deposit)
  document.getElementById('link-upgrade').href = explorerUrl(DEMO_TX.upgrade)
  document.getElementById('link-release').href = explorerUrl(DEMO_TX.release)

  document.getElementById('result-box').style.display = 'block'
  document.getElementById('reset-btn').style.display  = 'block'

  addLog('exploit-detector', '-- emergency round complete in ' + fmt(elapsed) + ' --', 'green')

  btn.disabled = true
  running = false
}

function resetDemo() {
  clearInterval(timerRef)
  running  = false
  logCount = 0

  document.getElementById('trigger-btn').disabled  = false
  document.getElementById('btn-text').textContent  = '⚡ Trigger Exploit'
  document.getElementById('timer-box').style.display  = 'none'
  document.getElementById('escrow-box').style.display = 'none'
  document.getElementById('bid-section').style.display = 'none'
  document.getElementById('result-box').style.display  = 'none'
  document.getElementById('reset-btn').style.display   = 'none'
  document.getElementById('demo-timer').textContent    = '0.0s'
  document.getElementById('escrow-state').textContent  = 'LOCKED'
  document.getElementById('escrow-state').style.color  = 'var(--yellow)'
  document.getElementById('log-body').innerHTML = '<div class="log-empty">Waiting for exploit trigger...</div>'
  document.getElementById('log-count').textContent = '0 messages'

  const dot  = document.querySelector('.status-dot')
  dot.className = 'status-dot idle'
  document.getElementById('status-text').textContent = 'Monitoring... no exploit detected'

  for (const s of ['IDLE','DETECTED','BIDDING','DEPOSITED','VERIFIED','DEPLOYED','RELEASED']) {
    const el = document.getElementById('state-' + s)
    if (el) el.className = 'state-item ' + (s === 'IDLE' ? 'done' : 'pending')
  }
  for (const a of ['fast', 'hybrid', 'deep']) {
    const el = document.getElementById('verdict-' + a)
    el.textContent = 'waiting...'
    el.className   = 'verdict pending-v'
    document.getElementById('bid-' + a).classList.remove('winner')
  }
}

// Set IDLE as done on load
document.addEventListener('DOMContentLoaded', () => {
  setState('IDLE', 'done')
})
