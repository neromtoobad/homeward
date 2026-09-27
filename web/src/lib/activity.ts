// One Activity list from two sources: the Envio indexer knows every payment
// that happened onchain, and the encrypted vault knows who people are and
// what the notes said. Without the indexer, the vault alone is used.
import type { Address, Hex } from "viem";
import type { IndexedPayment } from "./api.ts";
import { short } from "./format.ts";
import type { SentItem, VaultData } from "./vault.ts";

export type ActivityRow = {
  key: string;
  at: number;
  dir: "in" | "out";
  label: string;
  amount: string;
  note?: string;
  /** For standing-order payouts: what it was worth in naira, and at what rate. */
  ngn?: { value: number; rate: number };
  txHash: Hex;
  sent?: SentItem;
};

function nameFor(vault: VaultData, address: Address) {
  const c = vault.contacts.find((x) => x.address.toLowerCase() === address.toLowerCase());
  return c?.name ?? short(address);
}

export function buildActivity(vault: VaultData, me: Address, payments: IndexedPayment[] | null): ActivityRow[] {
  const fromVault: ActivityRow[] = [
    ...vault.sent.map((s) => ({
      key: s.txHash,
      at: s.at,
      dir: "out" as const,
      label: s.kind === "link" ? `Link for ${s.to}` : `To ${s.to}`,
      amount: s.amount,
      note: s.note,
      txHash: s.txHash,
      sent: s,
    })),
    ...vault.received.map((r) => ({
      key: r.txHash,
      at: r.at,
      dir: "in" as const,
      label: `From ${r.from}`,
      amount: r.amount,
      note: r.note,
      txHash: r.txHash,
    })),
  ];
  if (!payments) return fromVault.sort((a, b) => b.at - a.at);

  const lower = me.toLowerCase();
  const rows: ActivityRow[] = payments.map((p) => {
    const out = p.from_id.toLowerCase() === lower && p.to_id.toLowerCase() !== lower;
    const sent =
      vault.sent.find((s) => s.txHash === p.txHash) ??
      (p.link_id ? vault.sent.find((s) => s.claimKey?.toLowerCase() === p.link_id?.toLowerCase()) : undefined);
    const received = vault.received.find((r) => r.txHash === p.txHash);
    const other = out ? p.to_id : p.from_id;
    const who = out ? (sent?.to && sent.to !== "a link" ? sent.to : nameFor(vault, other)) : (received?.from ?? nameFor(vault, other));
    const label =
      p.kind === "ORDER" ? (out ? `Standing order to ${who}` : `Standing order from ${who}`) : out ? `To ${who}` : `From ${who}`;
    return {
      key: p.id,
      at: p.timestamp * 1000,
      dir: out ? "out" : "in",
      label,
      amount: p.amount,
      note: sent?.note ?? received?.note,
      ngn: p.ngnValue && p.ngnPerUsd ? { value: Number(p.ngnValue) / 1e6, rate: Number(p.ngnPerUsd) / 1e6 } : undefined,
      txHash: p.txHash,
      sent,
    };
  });

  // Links nobody has opened yet exist only in the vault.
  const claimed = new Set(payments.filter((p) => p.link_id).map((p) => p.link_id!.toLowerCase()));
  const pending = fromVault.filter((r) => r.sent?.kind === "link" && r.sent.claimKey && !claimed.has(r.sent.claimKey.toLowerCase()));
  return [...rows, ...pending].sort((a, b) => b.at - a.at);
}
