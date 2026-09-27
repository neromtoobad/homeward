import { useState } from "react";
import { CREATURES, type Creature, CourierSprite, CreaturePicker, CreatureSprite } from "../cast.tsx";
import { useHomeward } from "../state.tsx";
import { ErrorLine, errorText } from "./ui.tsx";

export function Welcome({ returning }: { returning: boolean }) {
  const { create, unlock, busy } = useHomeward();
  const [name, setName] = useState("");
  const [creature, setCreature] = useState<Creature | null>(null);
  const [mode, setMode] = useState<"start" | "create">("start");
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <section className="welcome">
      <div className="welcome-hero" aria-hidden>
        <CourierSprite pose="fly-up" size={132} />
        <div className="stage">
          {CREATURES.map((c) => (
            <CreatureSprite key={c} kind={c} pose="idle" size={78} />
          ))}
        </div>
      </div>
      <h1 className="display">
        Send dollars home
        <br />
        in one tap.
      </h1>
      <p className="lede">
        Money lands in seconds, as real dollars. No bank, no app to learn, no seed phrase. Your face or fingerprint is the key.
      </p>

      {mode === "create" ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && creature) run(() => create(name.trim(), creature));
          }}
        >
          <label className="field">
            <span>What should we call you?</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your first name"
              autoComplete="given-name"
              maxLength={40}
            />
          </label>
          <span className="field-label">Pick your creature</span>
          <CreaturePicker value={creature} onChange={setCreature} />
          <button className="primary" disabled={!name.trim() || !creature || Boolean(busy)}>
            Create with passkey
          </button>
          <button type="button" className="ghost" onClick={() => setMode("start")}>
            Back
          </button>
        </form>
      ) : (
        <div className="stack">
          <button className="primary" onClick={() => setMode("create")} disabled={Boolean(busy)}>
            Create my Homeward
          </button>
          <button className="secondary" onClick={() => run(unlock)} disabled={Boolean(busy)}>
            {returning ? "Unlock" : "I already have one"}
          </button>
        </div>
      )}
      <ErrorLine error={error} />
      <p className="fineprint">
        Homeward sends Agora dollars (AUSD) on Monad. Your passkey stays on your phone, and we never hold your money.
      </p>
    </section>
  );
}

export function HouseMark() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48">
      <path d="M8 22 24 9l16 13v17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2Z" fill="var(--accent)" />
      <path d="M19 41V29h10v12" fill="var(--paper)" />
      <circle cx="24" cy="21" r="3" fill="var(--paper)" />
    </svg>
  );
}
