import {NextRequest, NextResponse} from "next/server";
import {insertRow} from "@/lib/server/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const provider = String(body?.provider || "card_processor");
    const transactionId = String(body?.transactionId || "");
    const amountLocal = Number(body?.amountLocal || 0);
    const currency = String(body?.currency || "NGN").toUpperCase();
    const usdcEquivalent = Number(body?.usdcEquivalent || 0);
    const wallet = String(body?.wallet || "").toLowerCase();
    const merchant = String(body?.merchant || "Card spend");

    if (!transactionId || !amountLocal || !usdcEquivalent) {
      return NextResponse.json({error: "Invalid webhook payload"}, {status: 400});
    }

    const cardMode = (process.env.NEXT_PUBLIC_CARD_MODE || process.env.CARD_MODE || "beta").toLowerCase();

    // In beta mode, accept simulated webhook payloads and mark them as test events.
    if (cardMode !== "live") {
      try {
        await insertRow("card_events", {
          provider_tx_id: transactionId,
          provider: "mock-card",
          user_wallet: wallet || null,
          merchant,
          amount_local: amountLocal,
          currency,
          usdc_equivalent: usdcEquivalent,
          status: "simulated",
          mode: "beta",
          created_at: new Date().toISOString()
        });
        await insertRow("transactions", {
          user_wallet: wallet || null,
          type: "card",
          title: merchant,
          local_amount: amountLocal,
          local_currency: currency,
          usdc_amount: usdcEquivalent,
          status: "simulated",
          created_at: new Date().toISOString()
        });
      } catch {
        // persistence should not block webhook acknowledgement
      }

      return NextResponse.json({
        received: true,
        provider: "mock-card",
        mode: "beta",
        transactionId,
        amountLocal,
        currency,
        usdcEquivalent,
        status: "simulated"
      });
    }

    // TODO: verify HMAC signature from provider before processing.
    // TODO: trigger confidential settlement transfer debit for linked wallet.
    // TODO: persist transaction and surface in history feed.
    try {
      await insertRow("card_events", {
        provider_tx_id: transactionId,
        provider,
        user_wallet: wallet || null,
        merchant,
        amount_local: amountLocal,
        currency,
        usdc_equivalent: usdcEquivalent,
        status: "received",
        mode: "live",
        created_at: new Date().toISOString()
      });
      await insertRow("transactions", {
        user_wallet: wallet || null,
        type: "card",
        title: merchant,
        local_amount: amountLocal,
        local_currency: currency,
        usdc_amount: usdcEquivalent,
        status: "received",
        created_at: new Date().toISOString()
      });
    } catch {
      // persistence should not block webhook acknowledgement
    }

    return NextResponse.json({
      received: true,
      provider,
      mode: "live",
      transactionId,
      amountLocal,
      currency,
      usdcEquivalent
    });
  } catch {
    return NextResponse.json({error: "Bad request"}, {status: 400});
  }
}
