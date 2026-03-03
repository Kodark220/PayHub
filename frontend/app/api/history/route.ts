import {NextRequest, NextResponse} from "next/server";
import {fetchTransactionsByWallet, insertRow} from "@/lib/server/supabase";

export async function GET(request: NextRequest) {
  try {
    const wallet = String(request.nextUrl.searchParams.get("wallet") || "").toLowerCase();
    if (!wallet) {
      return NextResponse.json({transactions: []});
    }

    const rows = await fetchTransactionsByWallet(wallet, 50);
    return NextResponse.json({transactions: rows});
  } catch {
    return NextResponse.json({transactions: []});
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const wallet = String(body?.wallet || "").toLowerCase();
    const type = String(body?.type || "send");
    const title = String(body?.title || "Transfer");
    const localAmount = Number(body?.localAmount || 0);
    const localCurrency = String(body?.localCurrency || "NGN");
    const usdcAmount = Number(body?.usdcAmount || 0);
    const status = String(body?.status || "submitted");

    if (!wallet) {
      return NextResponse.json({ok: false, error: "wallet is required"}, {status: 400});
    }

    await insertRow("transactions", {
      user_wallet: wallet,
      type,
      title,
      local_amount: localAmount,
      local_currency: localCurrency,
      usdc_amount: usdcAmount,
      status,
      created_at: new Date().toISOString()
    });

    return NextResponse.json({ok: true});
  } catch {
    return NextResponse.json({ok: false, error: "unable to persist history"}, {status: 500});
  }
}
