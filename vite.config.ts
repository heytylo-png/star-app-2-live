import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

function originOf(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Content-Security-Policy for the production build only (Vite dev needs inline
 * scripts + HMR sockets). Protects the xAI / ElevenLabs keys and Spotify tokens
 * in localStorage: no inline or third-party script beyond the Spotify SDK, and
 * network calls only to the hosts the app actually uses.
 * If you add a new external host, add it here or the browser will block it.
 */
function contentSecurityPolicy(env: Record<string, string>): string {
  const spotify = ["https://*.spotify.com", "https://*.scdn.co", "https://*.spotifycdn.com"];
  const extraConnect = [originOf(env.VITE_GROK_PROXY_URL), originOf(env.VITE_API_BASE)].filter(
    (o): o is string => Boolean(o),
  );
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "https://sdk.scdn.co"],
    // React inline style attributes need 'unsafe-inline' for styles (not scripts).
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", ...spotify],
    "media-src": ["'self'", "blob:", ...spotify],
    "connect-src": [
      "'self'",
      "https://api.x.ai",
      "https://api.elevenlabs.io",
      "wss://*.spotify.com",
      ...spotify,
      ...extraConnect,
    ],
    "frame-src": ["https://sdk.scdn.co"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

function cspMeta(env: Record<string, string>): Plugin {
  return {
    name: "star-rai-csp",
    apply: "build",
    transformIndexHtml(html) {
      // Right after the charset meta so the charset stays within the first bytes.
      const charset = '<meta charset="UTF-8" />';
      if (!html.includes(charset)) throw new Error("index.html: charset meta not found for CSP");
      const csp = contentSecurityPolicy(env).replaceAll('"', "&quot;");
      return html.replace(
        charset,
        `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "VITE_");
  return {
    base: "/star-app-2-live/",
    plugins: [react(), tailwindcss(), cspMeta(env)],
    resolve: {
      alias: {
        "@": path.resolve(root, "./src"),
      },
    },
  };
});
