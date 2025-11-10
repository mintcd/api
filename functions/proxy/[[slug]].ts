import { injectSignalSnippet } from '@/utils/signal';
import { rewriteCssCode } from '@/utils/clone-helpers';

export async function onRequest(context: any) {
  const { request, params } = context;
  const slug = params.slug || [];

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!slug || slug.length === 0) {
    return new Response("Missing target", { status: 400 });
  }

  // Accept both: /proxy/{protocol}/{host}/... and /proxy/{host}/...
  let protocol = "https";
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

  // Basic sanity checks
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    return new Response("Invalid host", { status: 400 });
  }
  if (protocol !== "http" && protocol !== "https") {
    return new Response("Invalid protocol", { status: 400 });
  }

  const targetUrl = `${protocol}://${host}${pathname}${search}`;

  // Construct API base from the incoming request
  const incomingHost = request.headers.get('host') || 'localhost';
  const incomingProto = request.headers.get('x-forwarded-proto') || request.headers.get('x-forwarded-protocol') || 'https';
  const apiBase = `${incomingProto}://${incomingHost}`;

  // Forward request to upstream
  const upstream = await fetch(targetUrl, {
    method: "GET",
    redirect: "follow"
  });

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

  // CORS
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Range");

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

      console.log(`[Proxy] Wrapped proxied script in try/finally and included signal: ${targetUrl}`);
    } else if (ct.includes("text/css") || pathname.endsWith(".css")) {
      text = rewriteCssCode(text, targetUrl, apiBase);
    }

    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": ct,
        "Cache-Control":
          upstream.headers.get("Cache-Control") ??
          "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
