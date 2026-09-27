# Homeward

**Send dollars home in one tap.** Homeward moves Agora dollars (AUSD) across borders on Monad. The sender and the person receiving need nothing but a phone: no seed phrase, no gas, no app store, and nobody holds their money for them.

Built for [Monad Metropolis](https://monad.xyz/developers/hackathons/metropolis), Track 02: Consumer Products & Payments.

> Status: working end to end on a local fork of Monad testnet against Agora's real AUSD contract. Mainnet deployment is next. See [Status](#status).

## The problem

Sending $50 from London or Houston to a mother in Lagos still means a remittance counter, a bank account on both ends, days of waiting, and fees that eat into small amounts. Crypto rails are fast, but they ask the person receiving to install a wallet, write down twelve words, and buy gas before she can touch the money. Most people's mothers will not do that, and they shouldn't have to.

## How it works

**Onboarding is one passkey.** "Create my Homeward" runs a single WebAuthn ceremony. [Mera](https://mera.category.xyz) turns the passkey's PRF output into the account key. Nothing is stored, on the phone or on our server. Every unlock rebuilds the account from the passkey, so clearing the browser or switching phones loses nothing.

**Sending to someone new is a link.** The sender signs once and gets a link to share on WhatsApp. The recipient opens it and sees who sent how much, plus a private note. One tap with her face or fingerprint creates her Homeward and the dollars land. She never needs MON.

**Sending to someone you know is instant.** AUSD supports EIP-3009, so every transfer is a signature that our relayer submits. The money settles on Monad in under a second.

**Standing orders.** "$50 to Mum every Friday", or "keep Mum's balance at $100". The sender prepays and the escrow holds the funds. A Chainlink CRE workflow releases each payment when it's due and writes the naira rate it used on-chain, so every receipt says what the money was worth where it landed.

**Plain-language requests.** Type "send mum ₦50k every Friday" and Kimi turns it into a transfer you confirm. Kimi sees the sentence and your contacts' nicknames, never addresses or balances, and nothing moves without a tap.

## One passkey, many keys

Homeward's WebAuthn client asks each passkey ceremony for **two independent PRF evaluations**:

| PRF salt | Becomes | Used for |
|---|---|---|
| `homeward.account.v1` | secp256k1 account key (via BIP-39/BIP-32, so it can be exported to any wallet) | Signing transfers and API requests |
| `homeward.private.v1` | AES-256-GCM vault key and an X25519 inbox key (HKDF-separated) | Encrypting your contacts, sent links and notes; receiving sealed notes from other people |

The two outputs are unrelated. Knowing the wallet key reveals nothing about the vault, and the server stores only ciphertext. Links carry a third secret: a one-off claim key in the URL fragment, which browsers never send to a server. It also encrypts the note inside the link.

**Session policy** (see `web/src/lib/keys.ts`):
- One prompt unlocks both key families.
- Sends up to $100 sign inside the session with no prompt. Anything larger asks for the passkey again and checks that it's the same account.
- The session ends after 10 minutes idle or 2 minutes in the background, and the key material is zeroed.
- Showing the recovery phrase always requires a fresh passkey check.

## Architecture

```
 phone (PWA)                         Homeward server                 Monad
 ─────────────                       ───────────────                 ─────
 Mera passkey ──► account key ──► signs EIP-3009 / EIP-191 ──► relayer ──► AUSD (Agora)
             └──► private keys ─► vault ciphertext ────────► SQLite     │
                                  sealed notes ────────────► SQLite     ├─► HomewardEscrow
                                                                        │     links: createLink / claim / refund
 Chainlink CRE workflow ── cron ─► read dueOrders ─► FX rate (HTTP, consensus) ─► onReport
                                                                        │     orders: createOrder / onReport / closeOrder
```

- `contracts/HomewardEscrow.sol` holds AUSD for claim links and prepaid standing orders. Every deposit uses `receiveWithAuthorization`, and the signed EIP-3009 nonce is derived from the deposit's parameters. The relayer can submit a deposit but cannot change who it's for, when it expires, or how it pays out. A claim is signed by the link's own key and names the recipient, so a front-runner can't redirect it.
- `server/` holds the relayer (simulates before sending, pads gas because Monad bills the gas limit), the ciphertext vault store, profiles (handle and inbox public key), the naira rate as a median of public sources, and the Kimi intent parser. It also serves the web app.
- `web/` is a React PWA: onboarding, send, claim, standing orders and settings.
- `shared/` has network config and the signing helpers, used by both the web app and the tests.

## Sponsor integrations

| Sponsor | What Homeward uses it for | Status |
|---|---|---|
| **Agora (AUSD)** | The currency. EIP-3009 transfers make every flow gasless; `receiveWithAuthorization` funds the escrow. | Working (fork of testnet) |
| **Mera** | The entire account layer; the dual-salt client adds a second, non-wallet key family. | Working |
| **Chainlink CRE** | Orchestrates standing orders: cron trigger, EVM read of due orders, FX rate over HTTP with consensus, report to `onReport`. | Contract side working; workflow in progress |
| **Kimi** | Natural-language send and schedule requests. | Built, needs an API key |
| **Envio** | History and receipts indexed from escrow and AUSD events. | Planned |
| **Aurora Intents** | "Add money" from any chain: USDC from Base, Arbitrum and others arrives as AUSD. | Planned |
| **Monad** | ~400 ms blocks make a claim feel instant; the P256 precompile and EIP-7702 are live but not needed for this design. | — |

## Run it locally

Requires Node 24 (the server uses the built-in `node:sqlite`).

```bash
npm install
npm run compile            # contracts -> out/ and shared/escrow-abi.json
npm test                   # escrow + client signing tests on a Monad testnet fork
npm run build              # web app -> web/dist
```

End to end against a local fork of Monad testnet (real AUSD, a fresh escrow, a funded relayer):

```bash
cp .env.example .env       # set RELAYER_PRIVATE_KEY
npx tsx scripts/local-chain.ts
# prints the escrow address; RPC on :8545, test-dollar faucet on :8546
NETWORK=testnet RPC_URL=http://localhost:8545 ESCROW_ADDRESS=0x... npx tsx server/index.ts
curl -X POST localhost:8546/faucet -d '{"address":"0x...","usd":250}'
```

Passkeys with PRF need iCloud Keychain on iOS 18+, Google Password Manager on Android, or 1Password. A desktop Chrome profile passkey won't work.

## Status

Done and tested:
- Escrow contract: links, claims, refunds, fixed and top-up standing orders, CRE report entry point. Covered by tests against real AUSD on a fork.
- Client signing helpers, verified against the contract's own nonce and digest functions.
- Web app: onboarding, unlock (including with no local state), send by link or directly, claim, encrypted notes and vault, re-share or take back a link, standing orders.

Next:
- Mainnet deployment and a public URL
- The Chainlink CRE workflow package
- Envio indexer for full history
- Aurora Intents deposits
- Android wrapper (Trusted Web Activity)
- Cash-out routes to naira

Unaudited software handling real money. Use small amounts.

## Built with AI

In line with the Metropolis rules (§4.1.4): Homeward was written with **Claude Code** (Anthropic) as a coding assistant, working alongside the author, who directed the product and reviewed the work.

## License

MIT
