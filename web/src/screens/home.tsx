import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fromUnits } from "../../../shared/money.ts";
import { navigate } from "../app.tsx";
import { type ParsedIntent, api } from "../lib/api.ts";
import { ago, cadence, ngn, usd, when } from "../lib/format.ts";
import { useHomeward } from "../state.tsx";
import type { SentItem } from "../lib/vault.ts";
import { ErrorLine, TxLink, errorText } from "./ui.tsx";

export function Home() {
  const { vault, balance, rate, orders, config, session } = useHomeward();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (!vault || !session) return null;
  const dollars = balance === null ? null : fromUnits(balance);
  const me = session.account.address.toLowerCase();
  const outgoing = orders.filter((o) => o.active && o.sender.toLowerCase() === me);

  const activity = [
    ...vault.sent.map((s) => ({ at: s.at, key: s.txHash, dir: "out" as const, who: s.to, amount: s.amount, note: s.note, sent: s })),
    ...vault.received.map((r) => ({ at: r.at, key: r.txHash, dir: "in" as const, who: r.from, amount: r.amount, note: r.note, sent: undefined })),
  ].sort((a, b) => b.at - a.at);

  return (
    <section className="home">
      <header className="home-head">
        <span className="wordmark">Homeward</span>
        <button className="avatar" onClick={() => navigate("/me")} aria-label="You">
          {(vault.name || "?").slice(0, 1).toUpperCase()}
        </button>
      </header>

      <div className="balance">
        <span className="label">Your dollars</span>
        <span className="amount display">{dollars === null ? "—" : usd(dollars)}</span>
        {rate && dollars !== null && <span className="sub">≈ {ngn(dollars * rate)}</span>}
      </div>

      <div className="actions">
        <button className="primary" onClick={() => navigate("/send")}>
          Send
        </button>
        <button
          className="secondary"
          onClick={async () => {
            await navigator.clipboard?.writeText(session.account.address).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Address copied" : "Add money"}
        </button>
        <button className="secondary" onClick={() => navigate("/schedule")}>
          Schedule
        </button>
      </div>

      {config?.kimi && <Ask />}

      {outgoing.length > 0 && (
        <div className="card">
          <h3>Standing orders</h3>
          {outgoing.map((o) => (
            <div key={o.id} className="row">
              <span>
                {o.mode === "topup" ? `Keep at ${usd(o.amount)}` : usd(o.amount)} {cadence(o.period)}
              </span>
              <span className="muted">next {when(o.nextDue)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Activity</h3>
        {activity.length === 0 && <p className="muted">Nothing yet. Send someone a few dollars and it shows up here.</p>}
        {activity.map((a) => (
          <div key={a.key}>
            <button className="row activity" onClick={() => setOpen(open === a.key ? null : a.key)} aria-expanded={open === a.key}>
              <span className={`dot ${a.dir}`} aria-hidden />
              <span className="who">
                {a.dir === "in" ? `From ${a.who}` : a.sent?.kind === "link" ? `Link for ${a.who}` : `To ${a.who}`}
                {a.note && <small>“{a.note}”</small>}
              </span>
              <span className={`amt ${a.dir}`}>
                {a.dir === "in" ? "+" : "−"}
                {usd(a.amount)}
                <small>{ago(a.at)}</small>
              </span>
            </button>
            {open === a.key &&
              (a.sent?.kind === "link" && a.sent.claimSecret ? (
                <LinkDetail item={a.sent} />
              ) : (
                <div className="detail">
                  <TxLink hash={a.key} explorer={config?.explorer} />
                </div>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** A link you sent: whether it was received, and a way to re-share or take it back from any device. */
function LinkDetail({ item }: { item: SentItem }) {
  const { config, cancelLink, busy } = useHomeward();
  const secret = item.claimSecret as Hex;
  const [status, setStatus] = useState<"loading" | "waiting" | "received">("loading");
  const [error, setError] = useState<string | null>(null);
  const url = `${location.origin}/c#${secret.slice(2)}`;

  useEffect(() => {
    api
      .link(privateKeyToAccount(secret).address)
      .then((l) => setStatus(l.claimed ? "received" : "waiting"))
      .catch((e) => setError(errorText(e)));
  }, [secret]);

  return (
    <div className="detail">
      <p className="muted small">
        {status === "loading" ? "Checking…" : status === "received" ? "This link has been received." : "Not opened yet."}
      </p>
      {status === "waiting" && (
        <div className="inline">
          <a
            className="primary small"
            href={`https://wa.me/?text=${encodeURIComponent(`I sent you ${usd(item.amount)} on Homeward. Tap to receive it: ${url}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            Share again
          </a>
          <button className="ghost small" onClick={() => navigator.clipboard?.writeText(url)}>
            Copy
          </button>
          <button
            className="ghost small"
            disabled={Boolean(busy)}
            onClick={() =>
              cancelLink(secret)
                .then(() => setStatus("received"))
                .catch((e) => setError(errorText(e)))
            }
          >
            Take it back
          </button>
        </div>
      )}
      <TxLink hash={item.txHash} explorer={config?.explorer} />
      <ErrorLine error={error} />
    </div>
  );
}

/** Plain-language requests, read by Kimi and always confirmed before anything moves. */
function Ask() {
  const { vault } = useHomeward();
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setThinking(true);
    setError(null);
    try {
      setIntent(await api.intent(text, vault?.contacts.map((c) => c.name) ?? []));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setThinking(false);
    }
  }

  function go() {
    if (!intent) return;
    const params = new URLSearchParams();
    if (intent.usd) params.set("usd", intent.usd.toFixed(2));
    if (intent.recipient) params.set("to", intent.recipient);
    if (intent.note) params.set("note", intent.note);
    if (intent.kind === "schedule") {
      if (intent.cadence) params.set("cadence", intent.cadence);
      if (intent.count) params.set("count", String(intent.count));
      if (intent.weekday !== null) params.set("weekday", String(intent.weekday));
      params.set("mode", intent.mode);
      navigate(`/schedule?${params}`);
    } else {
      navigate(`/send?${params}`);
    }
  }

  return (
    <form className="ask" onSubmit={ask}>
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setIntent(null);
        }}
        placeholder="Try “send mum ₦50k every Friday”"
        aria-label="Ask Homeward"
      />
      <button className="icon-btn" disabled={thinking || !text.trim()} aria-label="Ask">
        {thinking ? <span className="spinner" /> : "→"}
      </button>
      {intent && (
        <div className="intent">
          {intent.kind === "unknown" ? (
            <p>I can help send money or set up a regular transfer. Try naming who and how much.</p>
          ) : (
            <>
              <p>{intent.explanation}</p>
              <button type="button" className="primary small" onClick={go}>
                Review
              </button>
            </>
          )}
        </div>
      )}
      <ErrorLine error={error} />
    </form>
  );
}
