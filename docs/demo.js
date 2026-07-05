// ═══════════════════════════════════════════════════════════════
//  FlashPatch Demo Simulator — tabibito aesthetic
//  Simulates the exact CoralOS message sequence with real timing
// ═══════════════════════════════════════════════════════════════

// ── Real devnet-style tx sigs ──────────────────────────────────
const SIGS = {
  escrow:  '3xKpL9mN2qR7vT4wY8uA1bCdEfGhIjKlMnOpQrStUvWxYz5ABC1234abcdef567890WXYZ',
  deposit: '5vBnM3kL7jH2pR9tQ6wE4yU8iO1sD0fGaZxCvNbMqWsEdRfTgYhUjIkOlPzXcVbNmQwEr',
  upgrade: '7mRtY4kNpQwE2sAfZxCvBnMjHgTyUiOlKsWdXrCvBnMqAsZxDwErTyUiOpLkJhGfDsAq',
  release: '9sAfZxCvBnMjHgTyUiOlKsWdXrCvBnMqAsZxDwErTyUiOpLkJhGfDsAqWsEdRfTgYhUj',
};

const EXPLORER = 'https://explorer.solana.com/tx/';

// ── State ──────────────────────────────────────────────────────
let running = false;
let startTime = null;
let timerInterval = null;
let logCount = 0;

// ── Helpers ───────────────────────────────────────────────────
function ts() {
  const now = startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : '0.0';
  return now + 's';
}

function log(agent, agentClass, msg, highlight = false) {
  const stream = document.getElementById('logStream');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML =
    `<span class="log-ts">[${ts()}]</span>` +
    `<span class="log-agent ${agentClass}">${agent}</span>` +
    `<span class="log-msg${highlight ? ' highlight' : ''}">${msg}</span>`;
  stream.appendChild(entry);
  // Keep last 200 lines
  logCount++;
  if (logCount > 200) { stream.removeChild(stream.firstChild); }
  stream.scrollTop = stream.scrollHeight;
}

function setState(stateName) {
  document.querySelectorAll('.state-step').forEach(el => {
    const s = el.dataset.state;
    el.classList.remove('active', 'done');
    // mark previous states as done
  });
  const steps = [...document.querySelectorAll('.state-step')];
  let found = false;
  steps.forEach(el => {
    if (found) return;
    if (el.dataset.state === stateName) {
      el.classList.add('active');
      found = true;
    } else {
      el.classList.add('done');
    }
  });
}

function setStat(id, val) {
  document.getElementById(id).textContent = val;
}

function setBid(agent, price, conf, verdict) {
  if (price)   document.getElementById(`price-${agent}`).textContent = price;
  if (conf)    document.getElementById(`conf-${agent}`).textContent = conf;
  if (verdict) {
    const el = document.getElementById(`verdict-${agent}`);
    el.textContent = verdict;
    el.className = `bid-verdict ${verdict}`;
  }
}

function setWinner(agent) {
  document.querySelectorAll('.bid-card').forEach(c => c.classList.remove('winner'));
  document.getElementById(`bid-${agent}`).classList.add('winner');
}

function setThreshold(n, total) {
  document.getElementById('thresholdText').textContent = `${n} / ${total}`;
  document.getElementById('thresholdFill').style.width = `${(n / total) * 100}%`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function triggerSweep() {
  const overlay = document.getElementById('tfxOverlay');
  overlay.classList.remove('tfx-active');
  void overlay.offsetWidth; // reflow
  overlay.classList.add('tfx-active');
  setTimeout(() => overlay.classList.remove('tfx-active'), 700);
}

function copyCode(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1800);
  });
}

// ── Main simulation ────────────────────────────────────────────
async function startDemo() {
  if (running) return;
  running = true;

  // Reset UI
  document.getElementById('logStream').innerHTML = '';
  logCount = 0;
  document.getElementById('triggerBtn').style.display = 'none';
  document.getElementById('resetBtn').style.display = 'none';
  document.getElementById('finalBanner').style.display = 'none';
  ['fast','hybrid','deep'].forEach(a => {
    setBid(a, '—', '—', 'waiting');
    document.getElementById(`bid-${a}`).classList.remove('winner');
  });
  setThreshold(0, 2);
  setStat('elapsedTime', '0.0s');
  setStat('bidCount', '0 / 3');
  setStat('verifiedCount', '0 / 2');
  setStat('escrowedSOL', '— SOL');
  setState('IDLE');

  triggerSweep();
  startTime = Date.now();

  // Live timer
  timerInterval = setInterval(() => {
    setStat('elapsedTime', ((Date.now() - startTime) / 1000).toFixed(1) + 's');
  }, 100);

  await sleep(400);

  // ── Phase 1: Exploit Detection ──────────────────────────────
  setState('EXPLOIT_DETECTED');
  log('exploit-detector', 'detector', '🔍 polling Solana RPC for anomalous txs...');
  await sleep(600);
  log('exploit-detector', 'detector', '🚨 INTEGER_OVERFLOW detected on vault program', true);
  log('exploit-detector', 'detector', '   program: VaultProg111111111111111111111111111111');
  log('exploit-detector', 'detector', '   at-risk: 847.3 SOL');
  await sleep(300);
  log('exploit-detector', 'detector', '📢 broadcast → EXPLOIT_DETECTED (round=fp-001)', true);
  await sleep(200);
  log('exploit-detector', 'detector', '📢 broadcast → WANT(service=emergency_patch, round=fp-001)', true);

  // ── Phase 2: Bidding ────────────────────────────────────────
  await sleep(400);
  setState('BIDDING');
  log('patch-fast', 'patch-fast', '📩 received WANT — preparing bid...');
  await sleep(200);
  log('patch-hybrid', 'patch-hybrid', '📩 received WANT — preparing bid...');
  await sleep(100);
  log('patch-deep', 'patch-deep', '📩 received WANT — preparing bid...');
  await sleep(300);

  // fast bids first
  log('patch-fast', 'patch-fast', '💬 BID: 0.005 SOL · confidence=0.72 · est=5s', true);
  setBid('fast', '0.005 SOL', 'conf: 0.72', 'waiting');
  setStat('bidCount', '1 / 3');
  await sleep(180);

  // hybrid bids
  log('patch-hybrid', 'patch-hybrid', '💬 BID: 0.010 SOL · confidence=0.91 · est=15s', true);
  setBid('hybrid', '0.010 SOL', 'conf: 0.91', 'waiting');
  setStat('bidCount', '2 / 3');
  await sleep(150);

  // deep bids
  log('patch-deep', 'patch-deep', '💬 BID: 0.015 SOL · confidence=0.95 · est=30s', true);
  setBid('deep', '0.015 SOL', 'conf: 0.95', 'waiting');
  setStat('bidCount', '3 / 3');
  await sleep(400);

  // Detector awards deep (highest confidence)
  log('exploit-detector', 'detector', '🏆 AWARD → patch-deep (confidence 0.95 wins)', true);
  setBid('deep', null, null, 'award');
  setBid('fast', null, null, 'waiting');
  setBid('hybrid', null, null, 'waiting');
  setWinner('deep');
  await sleep(300);

  // Escrow
  log('exploit-detector', 'detector', '🔐 opening arbiter escrow on devnet...');
  await sleep(600);
  log('exploit-detector', 'detector', `✅ ESCROW_DEPOSITED sig: ${SIGS.deposit.slice(0,20)}...`, true);
  setStat('escrowedSOL', '0.015 SOL');
  log('patch-deep', 'patch-deep', '📩 ESCROW_REQUIRED confirmed on-chain — generating patch...');

  // ── Phase 3: Patching ───────────────────────────────────────
  await sleep(500);
  setState('PATCHING');
  log('patch-deep', 'patch-deep', '⚙️  running deep strategy: invariant assertions + static analysis');
  await sleep(800);
  log('patch-deep', 'patch-deep', '📦 DELIVERED: patch artifact ready', true);
  log('patch-deep', 'patch-deep', '   patchId: fp-001-deep-8a3f');
  log('patch-deep', 'patch-deep', '   instruction: "use checked_sub + invariant bounds check"');
  log('patch-deep', 'patch-deep', '   confidence: 0.95');
  await sleep(200);

  // ── Phase 4: Verifying ──────────────────────────────────────
  await sleep(300);
  setState('VERIFYING');
  log('sandbox-verifier', 'verifier', '📩 VERIFY request received');
  await sleep(400);
  log('sandbox-verifier', 'verifier', '🔍 SHA-256 hash match: ✅');
  await sleep(200);
  log('sandbox-verifier', 'verifier', '🔍 JSON structure valid: ✅');
  await sleep(250);
  log('sandbox-verifier', 'verifier', '🔍 exploit replay simulation: ✅ patched');
  await sleep(200);
  log('sandbox-verifier', 'verifier', '🔍 static analysis: ✅ no new vulnerabilities');
  await sleep(300);
  log('sandbox-verifier', 'verifier', '✅ VERIFIED PASS (round=fp-001)', true);
  setStat('verifiedCount', '1 / 2');
  setThreshold(1, 2);
  setBid('deep', null, null, 'pass');

  // Second verification pass (fast patch verifies too for threshold)
  await sleep(500);
  log('exploit-detector', 'detector', '📢 broadcast → WANT(second_verify, round=fp-001)');
  await sleep(300);
  log('patch-fast', 'patch-fast', '⚙️  running fast strategy patch...');
  await sleep(400);
  log('patch-fast', 'patch-fast', '📦 DELIVERED: patch artifact ready', true);
  await sleep(300);
  log('sandbox-verifier', 'verifier', '🔍 verifying fast patch...');
  await sleep(500);
  log('sandbox-verifier', 'verifier', '✅ VERIFIED PASS (round=fp-001, fast)', true);
  setStat('verifiedCount', '2 / 2');
  setThreshold(2, 2);
  setBid('fast', null, null, 'pass');

  // ── Phase 5: Threshold + Deploy ─────────────────────────────
  await sleep(400);
  log('threshold-deployer', 'deployer', '📊 THRESHOLD_STATUS: 2/2 — threshold reached!', true);
  setState('DEPLOYED');
  await sleep(300);
  log('threshold-deployer', 'deployer', '🏆 winner: patch-deep (confidence 0.95)');
  await sleep(300);
  log('threshold-deployer', 'deployer', '🔏 signing upgrade-authority memo on devnet...');
  await sleep(600);
  log('threshold-deployer', 'deployer', `✅ PATCH_DEPLOYED sig: ${SIGS.upgrade.slice(0,20)}...`, true);
  log('threshold-deployer', 'deployer', `   elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  // ── Phase 6: Escrow Release ─────────────────────────────────
  await sleep(400);
  setState('RELEASED');
  log('exploit-detector', 'detector', '💸 arbiter releasing escrow to patch-deep...');
  await sleep(500);
  log('exploit-detector', 'detector', `✅ ARBITER_RELEASED sig: ${SIGS.release.slice(0,20)}...`, true);
  log('exploit-detector', 'detector', '🎉 FlashPatch complete! Vault secured.', true);

  // Stop timer
  clearInterval(timerInterval);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  setStat('elapsedTime', elapsed + 's');

  // Final banner
  const banner = document.getElementById('finalBanner');
  banner.style.display = 'block';
  document.getElementById('finalLinks').innerHTML =
    `<a href="${EXPLORER}${SIGS.deposit}?cluster=devnet" target="_blank">🔐 Escrow Deposit Tx ↗</a>` +
    `<a href="${EXPLORER}${SIGS.upgrade}?cluster=devnet" target="_blank">🚀 Upgrade Authority Tx ↗</a>` +
    `<a href="${EXPLORER}${SIGS.release}?cluster=devnet" target="_blank">💸 Escrow Release Tx ↗</a>`;

  triggerSweep();

  document.getElementById('resetBtn').style.display = 'inline-flex';
  running = false;
}

function resetDemo() {
  if (timerInterval) clearInterval(timerInterval);
  running = false;
  startTime = null;
  logCount = 0;

  document.getElementById('logStream').innerHTML =
    '<div class="log-idle">Press "Trigger Exploit" to start the simulation ↓</div>';
  document.getElementById('triggerBtn').style.display = 'inline-flex';
  document.getElementById('resetBtn').style.display = 'none';
  document.getElementById('finalBanner').style.display = 'none';

  ['fast','hybrid','deep'].forEach(a => {
    setBid(a, '—', '—', 'waiting');
    document.getElementById(`bid-${a}`).classList.remove('winner');
  });

  setThreshold(0, 2);
  setStat('elapsedTime', '0.0s');
  setStat('bidCount', '0 / 3');
  setStat('verifiedCount', '0 / 2');
  setStat('escrowedSOL', '— SOL');
  setState('IDLE');
  triggerSweep();
}

// ── Intersection Observer for fade-in cards ────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.animationPlayState = 'running';
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.fade-in').forEach(el => {
    el.style.animationPlayState = 'paused';
    obs.observe(el);
  });
});
