import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IndexedPayment } from "../web/src/lib/api.ts";
import { buildActivity } from "../web/src/lib/activity.ts";
import type { VaultData } from "../web/src/lib/vault.ts";

const ME = "0x1111111111111111111111111111111111111111";
const MUM = "0x2222222222222222222222222222222222222222";
const KEY = "0x3333333333333333333333333333333333333333";
const PENDING_KEY = "0x4444444444444444444444444444444444444444";
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const;

const vault: VaultData = {
  v: 1,
  name: "Dimeji",
  handle: null,
  contacts: [{ name: "Mum", address: MUM }],
  sent: [
    { kind: "direct", to: "Mum", toAddress: MUM, amount: "5000000", note: "for bread", txHash: tx(1), at: 1000 },
    // Link made in tx 2, claimed in tx 3: the indexer reports the claim.
    { kind: "link", to: "Mum", amount: "25000000", note: "market", txHash: tx(2), at: 2000, claimSecret: tx(9), claimKey: KEY },
    { kind: "link", to: "Aunty", amount: "10000000", txHash: tx(4), at: 4000, claimSecret: tx(8), claimKey: PENDING_KEY },
  ],
  received: [],
};

const payment = (p: Partial<IndexedPayment>): IndexedPayment => ({
  id: `${p.txHash}-0`,
  kind: "DIRECT",
  from_id: ME,
  to_id: MUM,
  amount: "0",
  ngnPerUsd: null,
  ngnValue: null,
  ref: null,
  link_id: null,
  order_id: null,
  txHash: tx(0),
  timestamp: 0,
  ...p,
});

describe("activity", () => {
  it("falls back to the vault when there is no indexer", () => {
    const rows = buildActivity(vault, ME, null);
    assert.deepEqual(rows.map((r) => r.label), ["Link for Aunty", "Link for Mum", "To Mum"]);
  });

  it("uses indexed payments, keeps notes from the vault, and shows unopened links", () => {
    const rows = buildActivity(vault, ME, [
      payment({ kind: "DIRECT", amount: "5000000", txHash: tx(1), timestamp: 1 }),
      payment({ kind: "LINK", amount: "25000000", link_id: KEY, txHash: tx(3), timestamp: 3 }),
      payment({ kind: "ORDER", amount: "10000000", ngnPerUsd: "1329264038", ngnValue: "13292640380", txHash: tx(5), timestamp: 5 }),
      // Someone we don't know paid us.
      payment({ kind: "DIRECT", from_id: "0x5555555555555555555555555555555555555555", to_id: ME, amount: "2000000", txHash: tx(6), timestamp: 6 }),
    ]);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    assert.equal(rows.find((r) => r.txHash === tx(3))?.note, "market"); // the link payout carries the link's note
    assert.equal(rows.find((r) => r.txHash === tx(1))?.note, "for bread");
    assert.deepEqual(byLabel["Standing order to Mum"].ngn, { value: 13292.64038, rate: 1329.264038 });
    assert.equal(byLabel["From 0x5555…5555"].dir, "in");
    // Aunty hasn't opened her link, so only the vault knows about it.
    assert.ok(byLabel["Link for Aunty"]);
    assert.equal(rows.length, 5);
  });
});
