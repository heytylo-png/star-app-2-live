/**
 * Tiny Cloudflare Worker: browser → Worker → api.x.ai
 * Key comes from the client (X-User-Key or Authorization). Worker never stores it.
 */

const XAI_URL = "https://api.x.ai/v1/chat/completions";

export interface Env {
  ALLOWED_ORIGINS?: string;
}

function corsHeaders(origin: string | null, env: Env): HeadersInit {
  const allow = env.ALLOWED_ORIGINS?.trim() || "*";
  const allowed =
    allow === "*"
      ? "*"
      : origin && allow.split(",").map((s) => s.trim()).includes(origin)
        ? origin
        : allow.split(",")[0]?.trim() || "*";

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function extractKey(req: Request): string | null {
  const userKey = req.headers.get("X-User-Key")?.trim();
  if (userKey) return userKey;
  const auth = req.headers.get("Authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const k = auth.slice(7).trim();
    if (k) return k;
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "GET" && (path === "/" || path === "/health")) {
      return new Response(JSON.stringify({ ok: true, proxy: "xai-chat" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    if (!path.endsWith("/v1/chat/completions") && path !== "/v1/chat/completions") {
      // Accept both /v1/chat/completions and /chat/completions
      if (!path.endsWith("/chat/completions")) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }
    }

    const key = extractKey(request);
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing X-User-Key or Authorization" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    let body: string;
    try {
      body = await request.text();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const upstream = await fetch(XAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body,
    });

    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    // Avoid leaking hop-by-hop
    headers.delete("content-encoding");
    headers.delete("content-length");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};
