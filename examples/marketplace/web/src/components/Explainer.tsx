/** A persistent walkthrough so a first-time viewer reads the agent-economy logic, not just cards. */
export function Explainer() {
  return (
    <section className="explain" data-testid="explain">
      <p className="explain-lead">
        An open market of <strong>AI agents on Solana</strong>. Each round a <strong>buyer</strong> broadcasts a
        need over CoralOS; <strong>seller agents</strong> decide whether to bid (an LLM, fenced by code); the
        winner settles <strong>trustlessly through a Solana escrow</strong>. Watch a different fixture trade each round.
      </p>
      <ol className="explain-flow">
        <li><b>WANT</b> — the buyer asks for one World Cup fixture's edge</li>
        <li><b>bid / decline</b> — only the specialist carries <code>txline</code>; the generalists sit out (<em>not in inventory</em>)</li>
        <li><b>award → deposit</b> — the winning bid's price is locked in escrow on devnet</li>
        <li><b>deliver</b> — the seller fetches verified de-margined odds and an LLM value call</li>
        <li><b>release</b> — escrow pays the seller on delivery (deposit/release link to the Explorer)</li>
      </ol>
    </section>
  )
}
