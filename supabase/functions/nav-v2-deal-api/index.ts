import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type NavV2Action =
  | "get_deal_card"
  | "get_deal_card_lite"
  | "add_comment"
  | "update_deal_status"
  | "update_document_status"
  | "update_document_workflow"
  | "update_task_status";

type AuthUser = {
  id: string;
  email?: string;
};

const allowedActions = new Set<NavV2Action>([
  "get_deal_card",
  "get_deal_card_lite",
  "add_comment",
  "update_deal_status",
  "update_document_status",
  "update_document_workflow",
  "update_task_status",
]);

const dealStatuses = new Set([
  "draft",
  "need_info",
  "need_lawyer",
  "need_broker",
  "need_documents",
  "ready_for_deposit",
  "deposit_done",
  "preparing_deal",
  "ready_for_deal",
  "registration",
  "registered",
  "closed",
  "cancelled",
]);

const documentStatuses = new Set(["needed", "missing", "requested", "received", "checked", "problem"]);
const taskStatuses = new Set(["open", "in_progress", "done", "cancelled"]);
const commentVisibilities = new Set(["team", "private", "public"]);
const roles = new Set(["owner", "admin", "manager", "spn", "lawyer", "broker", "viewer"]);

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function getString(body: Record<string, unknown>, keys: string[], label: string, required = true): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }

  if (required) throw new Error(`${label} is required`);
  return null;
}

function parseUuid(body: Record<string, unknown>, keys: string[], label: string): string {
  const value = getString(body, keys, label, true);
  if (!value || !uuidRe.test(value)) throw new Error(`${label} must be a valid UUID`);
  return value;
}

function parseEnum(body: Record<string, unknown>, keys: string[], allowed: Set<string>, label: string): string {
  const value = getString(body, keys, label, true);
  if (!value || !allowed.has(value)) throw new Error(`Unsupported ${label}`);
  return value;
}

function parseOptionalUuid(body: Record<string, unknown>, keys: string[], label: string): string | null {
  const value = getString(body, keys, label, false);
  if (!value) return null;
  if (!uuidRe.test(value)) throw new Error(`${label} must be a valid UUID`);
  return value;
}

function parseOptionalRole(body: Record<string, unknown>, keys: string[], label: string): string | null {
  const value = getString(body, keys, label, false);
  if (!value) return null;
  if (!roles.has(value)) throw new Error(`Unsupported ${label}`);
  return value;
}

function parseOptionalDate(body: Record<string, unknown>, keys: string[], label: string): string | null {
  const value = getString(body, keys, label, false);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be YYYY-MM-DD`);
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
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object");
  }

  return body as Record<string, unknown>;
}

function parseAction(body: Record<string, unknown>): NavV2Action {
  const action = body.action;
  if (typeof action !== "string" || !allowedActions.has(action as NavV2Action)) {
    throw new Error("Unsupported Navigator v2 action");
  }
  return action as NavV2Action;
}

async function callUserRpc<T>(req: Request, rpcName: string, payload: Record<string, unknown>): Promise<T> {
  const token = getBearerToken(req);
  if (!token) throw new Error("Missing bearer token");

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : `RPC ${rpcName} failed`;
    throw new Error(message);
  }
  return data as T;
}

async function handleAction(req: Request, action: NavV2Action, body: Record<string, unknown>): Promise<unknown> {
  if (action === "get_deal_card" || action === "get_deal_card_lite") {
    const dealId = parseUuid(body, ["deal_id", "id", "p_deal_id"], "deal_id");
    const wantsLite = action === "get_deal_card_lite" || body.lite === true;
    return await callUserRpc(req, wantsLite ? "nav_v2_get_deal_card_lite" : "nav_v2_get_deal_card", { p_deal_id: dealId });
  }

  if (action === "add_comment") {
    const dealId = parseUuid(body, ["deal_id", "p_deal_id"], "deal_id");
    const bodyText = getString(body, ["body", "comment", "p_body"], "body", true);
    const visibility = getString(body, ["visibility", "p_visibility"], "visibility", false) || "team";
    if (!commentVisibilities.has(visibility)) throw new Error("Unsupported visibility");
    return await callUserRpc(req, "nav_v2_add_comment", {
      p_deal_id: dealId,
      p_body: bodyText,
      p_visibility: visibility,
    });
  }

  if (action === "update_deal_status") {
    const dealId = parseUuid(body, ["deal_id", "p_deal_id"], "deal_id");
    const status = parseEnum(body, ["status", "p_status"], dealStatuses, "deal status");
    return await callUserRpc(req, "nav_v2_update_deal_status", {
      p_deal_id: dealId,
      p_status: status,
    });
  }

  if (action === "update_document_status") {
    const documentId = parseUuid(body, ["document_id", "p_document_id", "id"], "document_id");
    const status = parseEnum(body, ["status", "p_status"], documentStatuses, "document status");
    return await callUserRpc(req, "nav_v2_update_document_status", {
      p_document_id: documentId,
      p_status: status,
    });
  }

  if (action === "update_document_workflow") {
    const documentId = parseUuid(body, ["document_id", "p_document_id", "id"], "document_id");
    const status = getString(body, ["status", "p_status"], "document status", false);
    if (status && !documentStatuses.has(status)) throw new Error("Unsupported document status");
    return await callUserRpc(req, "nav_v2_update_document_workflow", {
      p_document_id: documentId,
      p_status: status,
      p_assigned_to: parseOptionalUuid(body, ["assigned_to", "p_assigned_to"], "assigned_to"),
      p_responsible_role: parseOptionalRole(body, ["responsible_role", "p_responsible_role"], "responsible_role"),
      p_due_date: parseOptionalDate(body, ["due_date", "p_due_date"], "due_date"),
      p_note: getString(body, ["note", "p_note"], "note", false),
    });
  }

  if (action === "update_task_status") {
    const taskId = parseUuid(body, ["task_id", "p_task_id", "id"], "task_id");
    const status = parseEnum(body, ["status", "p_status"], taskStatuses, "task status");
    return await callUserRpc(req, "nav_v2_update_task_status", {
      p_task_id: taskId,
      p_status: status,
    });
  }

  throw new Error("Unsupported Navigator v2 action");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const [user, body] = await Promise.all([getAuthUser(req), readBody(req)]);
    const action = parseAction(body);
    const data = await handleAction(req, action, body);
    return jsonResponse({ ok: true, action, user_id: user.id, data });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
