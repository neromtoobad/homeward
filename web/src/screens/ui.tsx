import type { ReactNode } from "react";
import { navigate } from "../app.tsx";
import { ApiError } from "../lib/api.ts";

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  const err = e as { name?: string; code?: string; message?: string };
  if (err?.name === "NotAllowedError" || err?.code === "PASSKEY_OPERATION_FAILED") return "Passkey was cancelled.";
  if (err?.code === "PRF_UNAVAILABLE")
    return "This device's passkeys can't make Homeward keys yet. Try iCloud Keychain on iOS 18+, Google Password Manager on Android, or 1Password.";
  return err?.message ?? "Something went wrong.";
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error}
    </p>
  );
}

export function TopBar({ title, back = "/" }: { title: string; back?: string }) {
  return (
    <header className="topbar">
      <button className="icon" onClick={() => navigate(back)} aria-label="Back">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <h2>{title}</h2>
      <span className="icon" />
    </header>
  );
}

export function Sheet({ children }: { children: ReactNode }) {
  return <div className="sheet">{children}</div>;
}

export function TxLink({ hash, explorer }: { hash: string; explorer?: string }) {
  if (!explorer) return null;
  return (
    <a className="txlink" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
      View on Monad ↗
    </a>
  );
}
