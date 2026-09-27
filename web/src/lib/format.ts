import { fromUnits } from "../../../shared/money.ts";

const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const ngnFmt = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

export function usd(units: bigint | string | number) {
  return usdFmt.format(typeof units === "number" ? units : fromUnits(units));
}

export function ngn(amount: number) {
  return ngnFmt.format(amount);
}

export function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ago(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function when(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function cadence(period: number) {
  if (period === 86400) return "every day";
  if (period === 7 * 86400) return "every week";
  if (period === 14 * 86400) return "every 2 weeks";
  if (period >= 28 * 86400 && period <= 31 * 86400) return "every month";
  return `every ${Math.round(period / 86400)} days`;
}
