// The app's signing helpers (shared/money.ts), checked against the deployed
// contract and real AUSD on a Monad testnet fork. If client and contract ever
// disagree about a nonce or digest, these fail.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { type Address, type Hex, encodeAbiParameters, keccak256, parseSignature, toBytes } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { type Ctx, linkNonce, orderNonce, sendNonce, signClaim, signClose, signLink, signOrder, signSend } from "../shared/money.ts";
import { AUSD, WHALE, ausdAbi, balance, client, deployEscrow, escrowAbi, now, send, usd, warp } from "./fork.ts";

const alice = privateKeyToAccount(generatePrivateKey());
const mum = privateKeyToAccount(generatePrivateKey());
const relayer = privateKeyToAccount(generatePrivateKey());
const forwarder = privateKeyToAccount(generatePrivateKey());
let ctx: Ctx;

function vrs(signature: Hex) {
  const { v, r, s } = parseSignature(signature);
  return [Number(v), r, s] as const;
}

describe("client signing helpers against the escrow", () => {
  before(async () => {
    const escrow = await deployEscrow(relayer.address, forwarder.address);
    ctx = { chainId: await client.getChainId(), ausd: AUSD, escrow };
    await send(WHALE, AUSD, ausdAbi, "transfer", [alice.address, usd(300)]);
  });

  it("computes the same link and order nonces as the contract", async () => {
    const claimKey = privateKeyToAccount(generatePrivateKey()).address;
    const expiry = 1_900_000_000;
    assert.equal(
      linkNonce(ctx.escrow, claimKey, expiry),
      await client.readContract({ address: ctx.escrow, abi: escrowAbi, functionName: "linkNonce", args: [claimKey, expiry] }),
    );
    const o = {
      recipient: mum.address,
      amount: usd(10),
      budget: usd(40),
      firstDue: 1_900_000_000,
      period: 604800,
      mode: 1 as const,
      salt: `0x${"ab".repeat(32)}` as Hex,
    };
    assert.equal(
      orderNonce(ctx.escrow, o),
      await client.readContract({
        address: ctx.escrow,
        abi: escrowAbi,
        functionName: "orderNonce",
        args: [o.recipient, o.amount, o.budget, o.firstDue, o.period, o.mode, o.salt],
      }),
    );
  });

  it("sends directly through the escrow, with the note hash onchain", async () => {
    const ref = keccak256(toBytes("sealed-note-ciphertext"));
    assert.equal(
      sendNonce(ctx.escrow, mum.address, ref),
      await client.readContract({ address: ctx.escrow, abi: escrowAbi, functionName: "sendNonce", args: [mum.address, ref] }),
    );
    const t = await signSend(alice, ctx, mum.address, usd(12.5), ref);
    const res = await send(relayer.address, ctx.escrow, escrowAbi, "send", [
      t.from, t.to, t.amount, t.validBefore, t.ref, ...vrs(t.signature),
    ]);
    assert.equal(await balance(mum.address), usd(12.5));
    assert.equal(await balance(ctx.escrow), 0n);
    const sent = res.logs?.find((l: any) => l.address.toLowerCase() === ctx.escrow.toLowerCase());
    assert.ok(sent, "Sent event emitted");
    assert.equal(sent.topics[3], ref);

    // The same authorization can't be replayed to someone else.
    await assert.rejects(
      send(relayer.address, ctx.escrow, escrowAbi, "send", [t.from, relayer.address, t.amount, t.validBefore, t.ref, ...vrs(t.signature)]),
    );
  });

  it("creates and claims a link", async () => {
    const claimAccount = privateKeyToAccount(generatePrivateKey());
    const expiry = Number(await now()) + 86400;
    const l = await signLink(alice, ctx, claimAccount.address, usd(40), expiry);
    await send(relayer.address, ctx.escrow, escrowAbi, "createLink", [
      l.sender, l.amount, l.validBefore, l.claimKey, l.expiry, ...vrs(l.signature),
    ]);
    const before = await balance(mum.address);
    const c = await signClaim(claimAccount, ctx, mum.address);
    await send(relayer.address, ctx.escrow, escrowAbi, "claim", [c.claimKey, c.recipient, ...vrs(c.signature)]);
    assert.equal(await balance(mum.address), before + usd(40));
  });

  it("creates, pays and closes a standing order", async () => {
    const firstDue = Number(await now()) + 10;
    const o = await signOrder(alice, ctx, {
      recipient: mum.address,
      amount: usd(15),
      budget: usd(45),
      firstDue,
      period: 86400,
      mode: 0,
    });
    await send(relayer.address, ctx.escrow, escrowAbi, "createOrder", [
      o.sender, o.recipient, o.amount, o.budget, o.firstDue, o.period, o.mode, o.salt, o.validBefore,
      ...vrs(o.signature),
    ]);
    const id = ((await client.readContract({ address: ctx.escrow, abi: escrowAbi, functionName: "ordersLength" })) as bigint) - 1n;
    await warp(11n);
    const before = await balance(mum.address);
    const report = encodeAbiParameters([{ type: "uint256[]" }, { type: "uint256" }], [[id], 1_329_000000n]);
    await send(forwarder.address, ctx.escrow, escrowAbi, "onReport", ["0x", report]);
    assert.equal(await balance(mum.address), before + usd(15));

    const aliceBefore = await balance(alice.address as Address);
    const close = await signClose(alice, ctx, id);
    await send(relayer.address, ctx.escrow, escrowAbi, "closeOrder", [close.orderId, ...vrs(close.signature)]);
    assert.equal(await balance(alice.address), aliceBefore + usd(30));
  });
});
