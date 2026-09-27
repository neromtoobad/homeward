import { useMemo, useState } from "react";
import type { Hex } from "viem";
import { fromUnits } from "../../../shared/money.ts";
import { navigate } from "../app.tsx";
import { ngn, seconds, usd } from "../lib/format.ts";
import { PROMPT_FREE_LIMIT_USD } from "../lib/keys.ts";
import type { Contact } from "../lib/vault.ts";
import { useHomeward } from "../state.tsx";
import { ErrorLine, TopBar, TxLink, errorText } from "./ui.tsx";

type Target = { kind: "contact"; contact: Contact } | { kind: "link"; label: string };

export function Send() {
  const { vault, rate, balance, config, sendTo, makeLink, resolveRecipient, busy } = useHomeward();
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const [currency, setCurrency] = useState<"USD" | "NGN">("USD");
  const [amount, setAmount] = useState(params.get("usd") ?? "");
  const [note, setNote] = useState(params.get("note") ?? "");
  const [target, setTarget] = useState<Target | null>(() => {
    const to = params.get("to")?.toLowerCase();
    const c = vault?.contacts.find((x) => x.name.toLowerCase() === to);
    return c ? { kind: "contact", contact: c } : null;
  });
  const [lookup, setLookup] = useState(params.get("to") ?? "");
  const [linkLabel, setLinkLabel] = useState(params.get("to") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: Hex; ms: number; url?: string } | null>(null);

  if (!vault) return null;
  const n = Number(amount);
  const usdAmount = currency === "USD" ? n : rate ? n / rate : 0;
  const valid = usdAmount >= 0.01 && (balance === null || usdAmount <= fromUnits(balance));

  async function find() {
    setError(null);
    try {
      const c = await resolveRecipient(lookup);
      setTarget({ kind: "contact", contact: c });
    } catch (e) {
      setError(errorText(e).includes("no such handle") ? "No Homeward with that name. Send them a link instead." : errorText(e));
    }
  }

  async function submit() {
    if (!target) return;
    setError(null);
    try {
      const rounded = Math.round(usdAmount * 100) / 100;
      if (target.kind === "contact") setDone(await sendTo(target.contact, rounded, note));
      else setDone(await makeLink(rounded, note, target.label));
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (done) return <Done hash={done.hash} ms={done.ms} url={done.url} amount={usdAmount} explorer={config?.explorer} />;

  return (
    <section className="send">
      <TopBar title="Send" />

      <div className="amount-entry">
        <div className="amount-input">
          <span className="currency">{currency === "USD" ? "$" : "₦"}</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0"
            aria-label="Amount"
            className="display"
            style={{ width: `${Math.max(1, amount.length) + 0.3}ch` }}
          />
        </div>
        <button
          className="chip"
          onClick={() => {
            if (!rate) return;
            if (n) setAmount(currency === "USD" ? String(Math.round(n * rate)) : (n / rate).toFixed(2));
            setCurrency(currency === "USD" ? "NGN" : "USD");
          }}
        >
          {currency === "USD"
            ? rate && n
              ? `≈ ${ngn(n * rate)} · switch to ₦`
              : "Switch to ₦"
            : `≈ ${usd(usdAmount)} · switch to $`}
        </button>
        {balance !== null && <p className="muted small">You have {usd(balance)}</p>}
      </div>

      <div className="card">
        <h3>To</h3>
        {target ? (
          <div className="row">
            <span>{target.kind === "contact" ? target.contact.name : `A link${target.label ? ` for ${target.label}` : ""}`}</span>
            <button className="ghost small" onClick={() => setTarget(null)}>
              Change
            </button>
          </div>
        ) : (
          <>
            {vault.contacts.length > 0 && (
              <div className="contacts">
                {vault.contacts.map((c) => (
                  <button key={c.address} className="contact" onClick={() => setTarget({ kind: "contact", contact: c })}>
                    <span className="avatar small">{c.name.replace("@", "").slice(0, 1).toUpperCase()}</span>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className="inline">
              <input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="@name or 0x address" />
              <button className="secondary small" disabled={!lookup.trim()} onClick={find}>
                Find
              </button>
            </div>
            <div className="or">or, for someone new</div>
            <div className="inline">
              <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Who is it for? (e.g. Mum)" />
              <button className="secondary small" onClick={() => setTarget({ kind: "link", label: linkLabel.trim() })}>
                Make a link
              </button>
            </div>
          </>
        )}
      </div>

      <label className="field">
        <span>Note (only they can read it)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="For school fees" maxLength={140} />
      </label>

      <ErrorLine error={error} />
      <button className="primary big" disabled={!valid || !target || Boolean(busy)} onClick={submit}>
        {target?.kind === "link" ? "Make link for" : "Send"} {valid ? usd(usdAmount) : ""}
      </button>
      {usdAmount > PROMPT_FREE_LIMIT_USD && <p className="muted small center">Over {usd(PROMPT_FREE_LIMIT_USD)} asks for your passkey again.</p>}
    </section>
  );
}

function Done({ hash, ms, url, amount, explorer }: { hash: Hex; ms: number; url?: string; amount: number; explorer?: string }) {
  const message = `I sent you ${usd(amount)} on Homeward. Tap to receive it: ${url}`;
  return (
    <section className="done">
      <div className="check" aria-hidden>
        ✓
      </div>
      <h2 className="display">{url ? "Your link is ready" : "Sent"}</h2>
      {url ? (
        <>
          <p className="lede">Anyone with this link can receive {usd(amount)}. Share it only with them. It comes back to you after 14 days if nobody opens it.</p>
          <div className="stack">
            <a className="primary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
              Share on WhatsApp
            </a>
            {"share" in navigator && (
              <button className="secondary" onClick={() => navigator.share({ text: message }).catch(() => {})}>
                Share another way
              </button>
            )}
            <button className="ghost" onClick={() => navigator.clipboard?.writeText(url)}>
              Copy link
            </button>
          </div>
        </>
      ) : (
        <p className="lede">
          {usd(amount)} arrived. Confirmed on Monad in {seconds(ms)}.
        </p>
      )}
      <TxLink hash={hash} explorer={explorer} />
      <button className="ghost" onClick={() => navigate("/")}>
        Done
      </button>
    </section>
  );
}
