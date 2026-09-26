// Turns "send mum 50k every Friday" into a transfer the app can show for
// confirmation. Kimi only sees the sentence and contact nicknames, never
// addresses or balances, and nothing executes without the user confirming.

export type Intent = {
  kind: "send" | "schedule" | "unknown";
  recipient: string | null;
  amount: number | null;
  currency: "USD" | "NGN" | null;
  mode: "fixed" | "topup";
  cadence: "daily" | "weekly" | "monthly" | null;
  weekday: number | null; // 0 = Sunday
  count: number | null;
  note: string | null;
  explanation: string;
};

const SYSTEM = `You turn a remittance request into JSON for a money app that sends US dollars (AUSD) to family, mostly in Nigeria.
Reply with one JSON object only, with these keys:
- kind: "send" for a one-off transfer, "schedule" for a repeating one, "unknown" if it isn't a request to send money.
- recipient: the person exactly as they appear in the contacts list, or the name the user wrote if they're not in it, or null.
- amount: a number. "50k" means 50000. null if missing.
- currency: "NGN" when the user means naira (₦, naira, or a large round number like 50k for a Nigerian recipient with no currency), otherwise "USD".
- mode: "topup" when the user wants to keep someone's balance at a level ("keep mum at $100", "top up to"), otherwise "fixed".
- cadence: "daily", "weekly", "monthly" or null.
- weekday: 0-6 (Sunday = 0) if a day of the week is named, else null.
- count: how many times, if the user says ("for 3 months" weekly = 13), else null.
- note: a short message to attach if the user included one ("for school fees"), else null.
- explanation: one short plain-English sentence describing what will happen, for the confirm screen.`;

export async function parseIntent(text: string, contacts: string[]): Promise<Intent> {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) throw new Error("KIMI_API_KEY is not set");
  const res = await fetch(`${process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1"}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: process.env.KIMI_MODEL ?? "kimi-k2.6",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Today is ${new Date().toDateString()}.\nContacts: ${contacts.length ? contacts.join(", ") : "(none)"}\nRequest: ${text}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Kimi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const parsed = JSON.parse(json.choices[0].message.content) as Partial<Intent>;
  return {
    kind: parsed.kind === "send" || parsed.kind === "schedule" ? parsed.kind : "unknown",
    recipient: parsed.recipient ?? null,
    amount: typeof parsed.amount === "number" && parsed.amount > 0 ? parsed.amount : null,
    currency: parsed.currency === "NGN" ? "NGN" : parsed.currency === "USD" ? "USD" : null,
    mode: parsed.mode === "topup" ? "topup" : "fixed",
    cadence: parsed.cadence ?? null,
    weekday: typeof parsed.weekday === "number" ? parsed.weekday : null,
    count: typeof parsed.count === "number" ? parsed.count : null,
    note: parsed.note ?? null,
    explanation: parsed.explanation ?? "",
  };
}
