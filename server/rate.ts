// Naira per dollar, as the median of whichever public sources answer. The
// CRE workflow does the same with node consensus before a rate goes onchain.
type Source = { name: string; url: string; pick: (json: any) => number | undefined };

export const RATE_SOURCES: Source[] = [
  {
    name: "open.er-api.com",
    url: "https://open.er-api.com/v6/latest/USD",
    pick: (j) => j?.rates?.NGN,
  },
  {
    name: "fawazahmed0/currency-api",
    url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    pick: (j) => j?.usd?.ngn,
  },
  {
    name: "currency-api (pages.dev mirror)",
    url: "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
    pick: (j) => j?.usd?.ngn,
  },
];

let cached: { ngnPerUsd: number; sources: string[]; at: number } | undefined;
const TTL_MS = 10 * 60 * 1000;

export async function ngnPerUsd() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached;
  const results = await Promise.all(
    RATE_SOURCES.map(async (s) => {
      try {
        const res = await fetch(s.url, { signal: AbortSignal.timeout(5000) });
        const value = s.pick(await res.json());
        return typeof value === "number" && value > 100 && value < 100000 ? { name: s.name, value } : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  const ok = results.filter((r) => r !== undefined);
  if (!ok.length) {
    if (cached) return cached;
    throw new Error("no naira rate source answered");
  }
  const sorted = ok.map((r) => r.value).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  cached = { ngnPerUsd: median, sources: ok.map((r) => r.name), at: Date.now() };
  return cached;
}
