const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getHeaders() {
  return {
    apikey: supabaseServiceRoleKey as string,
    authorization: `Bearer ${supabaseServiceRoleKey as string}`,
    "content-type": "application/json"
  };
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseServiceRoleKey);
}

export async function insertRow(table: string, payload: Record<string, unknown>) {
  if (!isSupabaseConfigured()) return null;
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      ...getHeaders(),
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase insert failed: ${text}`);
  }

  return response.json();
}

export async function fetchTransactionsByWallet(wallet: string, limit = 50) {
  if (!isSupabaseConfigured()) return [];
  const params = new URLSearchParams({
    select: "id,type,title,local_amount,local_currency,usdc_amount,status,created_at",
    user_wallet: `eq.${wallet.toLowerCase()}`,
    order: "created_at.desc",
    limit: String(limit)
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/transactions?${params.toString()}`, {
    method: "GET",
    headers: getHeaders(),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase read failed: ${text}`);
  }

  return response.json();
}
