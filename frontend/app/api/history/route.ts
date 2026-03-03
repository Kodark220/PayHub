import {NextRequest, NextResponse} from "next/server";
import {fetchTransactionsByWallet} from "@/lib/server/supabase";

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
