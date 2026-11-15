// Wraps the static site so every response carries the security headers.
// wrangler.jsonc: main = this file, assets.binding = "ASSETS", run_worker_first = true.

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=31536000"
};

export default {
  async fetch(request, env) {
    // env.ASSETS.fetch keeps the html_handling and 404-page rules from wrangler.jsonc.
    const response = await env.ASSETS.fetch(request);
    const out = new Response(response.body, response);
    for (const name of Object.keys(HEADERS)) out.headers.set(name, HEADERS[name]);
    return out;
  }
};
