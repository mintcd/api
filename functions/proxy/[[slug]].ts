import { rewriteCss, injectSignalSnippet } from '@/utils/annotation';

export async function onRequestGet(context: any) {
  const { request, params } = context;
  const slug = params.slug || [];

  if (!slug || slug.length === 0) {
    return new Response("Missing target", { status: 400 });
  }

  // Accept both: /proxy/{protocol}/{host}/... and /proxy/{host}/...
  let protocol = "http";
  let host = "";
  let pathParts: string[] = [];

  const first = slug[0];
  if (first === "http" || first === "https") {
    if (slug.length < 2) {
      return new Response("Missing host", { status: 400 });
    }
    protocol = first;
    host = slug[1];
    pathParts = slug.slice(2);
  } else {
    host = first;
    pathParts = slug.slice(1);
  }

  // Rebuild pathname and re-attach the original query string
  const url = new URL(request.url);
  const pathname = "/" + pathParts.join("/");
  const search = url.search || "";
  const targetUrl = `${protocol}://${host}${pathname}${search}`;

  const incomingHost = request.headers.get('host') || 'localhost';
  const forwardedProto = request.headers.get('x-forwarded-proto') || request.headers.get('x-forwarded-protocol');
  const apiBase = forwardedProto ? `${forwardedProto}://${incomingHost}` : `http://${incomingHost}`;

  const upstream = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    redirect: 'follow'
  });

  if (!upstream.ok) {
    console.log(`[Proxy] Upstream fetch failed: ${targetUrl} -> ${upstream.status} ${upstream.statusText}`);
    return new Response(`Upstream fetch failed: ${upstream.status} ${upstream.statusText}`, { status: 502 });
  }


  console.log(`[Proxy] ${targetUrl} -> ${upstream.status} ${upstream.headers.get('content-type')}`);

  // Build response headers
  const headers = new Headers();
  const ct = upstream.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);
  headers.set(
    "Cache-Control",
    upstream.headers.get("Cache-Control") ?? "public, max-age=31536000, immutable"
  );

  // Range support passthrough
  const acceptRanges = upstream.headers.get("Accept-Ranges");
  if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);

  // CORS - echo the request Origin when present and respond to preflight
  const origin = request.headers.get('origin');
  headers.set("Access-Control-Allow-Origin", origin || "*");
  headers.set("Access-Control-Allow-Headers", request.headers.get('access-control-request-headers') || "Range");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (origin) headers.set('Access-Control-Allow-Credentials', 'true');

  // Handle preflight
  if (request.method === 'OPTIONS') {
    const preflight = new Headers();
    preflight.set('Access-Control-Allow-Origin', origin || '*');
    preflight.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    preflight.set('Access-Control-Allow-Headers', request.headers.get('access-control-request-headers') || 'Range');
    preflight.set('Access-Control-Max-Age', '600');
    if (origin) preflight.set('Access-Control-Allow-Credentials', 'true');
    return new Response(null, { status: 204, headers: preflight });
  }

  if (ct && ((ct.includes("javascript") || pathname.endsWith(".js")) || (ct.includes("text/css") || pathname.endsWith(".css")))) {
    let text = await upstream.text();

    const proxyBase = `${apiBase}/proxy/${host}`;
    if (ct.includes("javascript") || pathname.endsWith(".js")) {
      // Fix up any inlined url: 
      text = text.replace(
        /url\s*:\s*["'](\/[^"']*)["']/g,
        (_match, p1) => `url: "${proxyBase}${p1}"`
      );

      text = injectSignalSnippet(text, targetUrl);

      console.log(`[Proxy] Wrapped in signaling code: ${targetUrl}`);
    } else if (ct.includes("text/css") || pathname.endsWith(".css")) {
      text = rewriteCss(text, targetUrl, apiBase);
    }

    const respHeaders = new Headers();
    respHeaders.set('Content-Type', ct);
    respHeaders.set('Cache-Control', upstream.headers.get('Cache-Control') ?? 'public, max-age=3600');
    respHeaders.set('Access-Control-Allow-Origin', origin || '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', request.headers.get('access-control-request-headers') || 'Range');
    if (origin) respHeaders.set('Access-Control-Allow-Credentials', 'true');

    return new Response(text, {
      status: upstream.status,
      headers: respHeaders,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
