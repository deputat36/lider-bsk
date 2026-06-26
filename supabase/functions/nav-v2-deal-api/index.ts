import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type NavV2Action =
  | "get_deal_card"
  | "add_comment"
  | "update_deal_status"
  | "update_document_status"
  | "update_task_status";

type AuthUser = {
  id: string;
  email?: string;
};

const allowedActions = new Set<NavV2Action>([
  "get_deal_card",
  "add_comment",
  "update_deal_status",
  "update_document_status",
  "update_task_status",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function getAuthUser(req: Request): Promise<AuthUser> {
  const token = getBearerToken(req);
  if (!token) throw new Error("Missing bearer token");

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
  });

  if (!response.ok) throw new Error("Invalid user token");

  const user = await response.json();
  if (!user?.id || typeof user.id !== "string") throw new Error("Authenticated user not found");
  return { id: user.id, email: typeof user.email === "string" ? user.email : undefined };
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Content-Type must be application/json");
  }
  const body = await req.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Request body must be a JSON object");
  return body as Record<string, unknown>;
}

function parseAction(body: Record<string, unknown>): NavV2Action {
  const action = body.action;
  if (typeof action !== "string" || !allowedActions.has(action as NavV2Action)) {
    throw new Error("Unsupported Navigator v2 action");
  }
  return action as NavV2Action;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const [user, body] = await Promise.all([getAuthUser(req), readBody(req)]);
    const action = parseAction(body);

    return jsonResponse(
      {
        ok: false,
        error: "Navigator v2 action is not implemented yet",
        action,
        user_id: user.id,
      },
      501,
    );
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
