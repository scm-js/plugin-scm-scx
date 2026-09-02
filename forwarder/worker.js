/**
 * A forwarder for scmscx.com as a Cloudflare Worker.
 *
 * scmscx.com sends no CORS header, so a browser page served from anywhere else cannot
 * read its API. This worker passes each request on to the site unchanged and adds the
 * header to the answer. Deploy it, then enter the worker's address in the plugin's
 * Settings (Plugins ▸ scmscx.com Settings…) — or put it in `DEFAULT_SETTINGS.forwarder`
 * in `plugin.ts` so nobody has to.
 *
 * Only GET (and the browser's preflight OPTIONS), only paths under `/api/`, and only the
 * routes the plugin uses; anything else is refused, so the worker cannot be pointed at
 * the rest of the site. Set ORIGINS to the pages allowed to use it, or leave `*`.
 */

const SITE = "https://scmscx.com";
const ORIGINS = "*";
const ROUTES = [/^\/api\/uiv2\/search(\/|$)/, /^\/api\/uiv2\/random(\/|$)/, /^\/api\/uiv2\/map_info\//, /^\/api\/uiv2\/filenames2\//, /^\/api\/uiv2\/minimap\//, /^\/api\/maps\//];

const cors = {
  "access-control-allow-origin": ORIGINS,
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "accept",
  "access-control-max-age": "86400",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return new Response("GET only", { status: 405, headers: cors });
    if (!ROUTES.some((r) => r.test(url.pathname))) return new Response("not a route this forwarder passes on", { status: 404, headers: cors });

    const upstream = await fetch(`${SITE}${url.pathname}${url.search}`, {
      headers: { accept: request.headers.get("accept") ?? "*/*", "user-agent": "scmjs-plugin-scm-scx forwarder (+https://github.com/scm-js/plugin-scm-scx)" },
    });
    const headers = new Headers(cors);
    for (const name of ["content-type", "content-length", "cache-control", "last-modified", "etag"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
