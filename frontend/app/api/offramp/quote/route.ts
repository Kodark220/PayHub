import {NextRequest, NextResponse} from "next/server";

const fallbackRates: Record<string, number> = {
  NGN: 1550,
  GHS: 14.8,
  KES: 132
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const amountLocal = Number(body?.amountLocal || 0);
    const currency = String(body?.currency || "NGN").toUpperCase();

    if (!amountLocal || amountLocal <= 0) {
      return NextResponse.json({error: "Invalid amount"}, {status: 400});
    }

    let localPerUsd = fallbackRates[currency] || fallbackRates.NGN;
    const fxApi = process.env.EXCHANGE_RATE_API_URL;

    if (fxApi) {
      try {
        const candidates = [
          `${fxApi}?base=USD&symbols=${currency}`,
          `${fxApi.replace(/\/$/, "")}/USD`
        ];

        for (const url of candidates) {
          const fxRes = await fetch(url, {cache: "no-store"});
          if (!fxRes.ok) continue;

          const fxJson = await fxRes.json();
          const r = Number(fxJson?.rates?.[currency]);
          if (r > 0) {
            localPerUsd = r;
            break;
          }
        }
      } catch {
        // fallback rate is used if provider is unavailable
      }
    }

    const usdcAmount = amountLocal / localPerUsd;
    const feeLocal = Math.max(25, Math.round(amountLocal * 0.0065));

    return NextResponse.json({
      currency,
      amountLocal: amountLocal.toFixed(2),
      usdcAmount: usdcAmount.toFixed(6),
      rate: localPerUsd,
      feeLocal,
      quoteId: `q_${Date.now()}`,
      expiresAt: Date.now() + 45_000
    });
  } catch {
    return NextResponse.json({error: "Bad request"}, {status: 400});
  }
}
