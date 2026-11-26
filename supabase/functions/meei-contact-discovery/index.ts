import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { parsePhoneNumberFromString, type CountryCode } from "npm:libphonenumber-js@1.11.20";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Authentication required" }, 401);

  try {
    // Verify the caller using their own JWT; never trust a user ID supplied in JSON.
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

    // A small per-account hourly allowance prevents bulk phone-number enumeration.
    const { data: allowed, error: limitError } = await userClient.rpc(
      "consume_my_meei_rate_limit",
      { p_action_key: "contact_sync" },
    );
    if (limitError) return json({ error: "Contact discovery is temporarily unavailable" }, 503);
    if (!allowed) return json({ error: "Contact sync limit reached. Please try again later." }, 429);

    const payload = await request.json();
    if (!Array.isArray(payload?.numbers) || payload.numbers.length > 500) {
      return json({ error: "Send up to 500 contact phone numbers per sync." }, 400);
    }

    const defaultCountry = typeof payload.defaultCountry === "string"
      ? payload.defaultCountry.toUpperCase()
      : undefined;
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const raw of payload.numbers) {
      if (typeof raw !== "string" || raw.length > 64) continue;
      const parsed = parsePhoneNumberFromString(
        raw,
        defaultCountry as CountryCode | undefined,
      );
      if (!parsed?.isValid()) continue;
      const e164 = parsed.number;
      if (!seen.has(e164)) {
        seen.add(e164);
        normalized.push(e164);
      }
    }

    if (!normalized.length) return json({ matches: [], checked: 0 });

    // The database RPC accepts only service_role calls and computes keyed HMACs
    // internally. Raw phone numbers are not written to tables or application logs.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: matchedRows, error: matchError } = await admin.rpc(
      "match_meei_contact_numbers",
      {
        p_phone_numbers: normalized,
        p_requester_id: authData.user.id,
      },
    );
    if (matchError) throw matchError;

    const ids = [...new Set((matchedRows || []).map((row: { user_id: string }) => row.user_id))];
    if (!ids.length) return json({ matches: [], checked: normalized.length });

    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, username, display_name, is_private, account_type")
      .in("id", ids);
    if (profileError) throw profileError;

    return json({
      matches: profiles || [],
      checked: normalized.length,
    });
  } catch {
    // Do not log request bodies, contact names, or phone numbers.
    return json({ error: "Contact discovery failed. Please try again." }, 500);
  }
});
