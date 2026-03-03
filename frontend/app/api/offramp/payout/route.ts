import {NextRequest, NextResponse} from "next/server";
import {insertRow} from "@/lib/server/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const currency = String(body?.currency || "NGN").toUpperCase();
    const amountLocal = Number(body?.amountLocal || 0);
    const usdcAmount = Number(body?.usdcAmount || 0);
    const bankName = String(body?.bankName || "");
    const accountNumber = String(body?.accountNumber || "");
    const accountName = String(body?.accountName || "");
    const wallet = String(body?.wallet || "").toLowerCase();

    if (!amountLocal || !usdcAmount || !bankName || !accountNumber || !accountName) {
      return NextResponse.json({error: "Missing payout fields"}, {status: 400});
    }

    const fiatMode = (process.env.NEXT_PUBLIC_FIAT_MODE || process.env.FIAT_MODE || "beta").toLowerCase();

    // In beta mode, always simulate payout status and do not call live providers.
    if (fiatMode !== "live") {
      const payoutId = `po_${Date.now()}`;
      const accountLast4 = accountNumber.slice(-4);
      try {
        await insertRow("payouts", {
          payout_ref: payoutId,
          user_wallet: wallet || null,
          bank_name: bankName,
          account_number_last4: accountLast4,
          account_name: accountName,
          amount_local: amountLocal,
          currency,
          usdc_amount: usdcAmount,
          status: "pending_settlement",
          mode: "beta",
          created_at: new Date().toISOString()
        });
        await insertRow("transactions", {
          user_wallet: wallet || null,
          type: "bank",
          title: `${bankName} • ${accountLast4}`,
          local_amount: amountLocal,
          local_currency: currency,
          usdc_amount: usdcAmount,
          status: "pending_settlement",
          created_at: new Date().toISOString()
        });
      } catch {
        // persistence should not block beta payout simulation
      }

      return NextResponse.json({
        accepted: true,
        provider: "mock",
        payoutId,
        status: "pending_settlement",
        mode: "beta"
      });
    }

    // Provider integration point: Yellow Card / Flutterwave / Chimoney etc.
    const providerUrl = process.env.YELLOWCARD_API_URL;
    const providerApiKey = process.env.YELLOWCARD_API_KEY;

    if (providerUrl && providerApiKey) {
      const providerRes = await fetch(`${providerUrl}/payouts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${providerApiKey}`
        },
        body: JSON.stringify({
          currency,
          amountLocal,
          usdcAmount,
          bankName,
          accountNumber,
          accountName
        })
      });

      if (!providerRes.ok) {
        const err = await providerRes.text();
        return NextResponse.json({error: `Provider error: ${err}`}, {status: 502});
      }

      const providerJson = await providerRes.json();
      const accountLast4 = accountNumber.slice(-4);
      try {
        await insertRow("payouts", {
          payout_ref: providerJson?.id || `po_${Date.now()}`,
          user_wallet: wallet || null,
          bank_name: bankName,
          account_number_last4: accountLast4,
          account_name: accountName,
          amount_local: amountLocal,
          currency,
          usdc_amount: usdcAmount,
          status: "submitted",
          mode: "live",
          created_at: new Date().toISOString()
        });
        await insertRow("transactions", {
          user_wallet: wallet || null,
          type: "bank",
          title: `${bankName} • ${accountLast4}`,
          local_amount: amountLocal,
          local_currency: currency,
          usdc_amount: usdcAmount,
          status: "submitted",
          created_at: new Date().toISOString()
        });
      } catch {
        // persistence should not block provider response
      }

      return NextResponse.json({
        accepted: true,
        provider: "yellowcard",
        providerResponse: providerJson,
        mode: "live"
      });
    }

    return NextResponse.json({error: "FIAT_MODE is live but provider credentials are missing"}, {status: 500});
  } catch {
    return NextResponse.json({error: "Bad request"}, {status: 400});
  }
}
