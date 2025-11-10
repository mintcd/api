import * as cheerio from 'cheerio';
import {
  findCookieForUrl, absoluteUrl, isSkippable,
  extractScripts, rewriteStyles
} from '@/utils/annotation';

export async function onRequestGet(context: PagesContext) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  console.log(`[Clone] Received request to clone URL: ${targetUrl}`);

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing URL parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const incomingHost = request.headers.get('host') || 'localhost';
  const forwardedProto = request.headers.get('x-forwarded-proto') || request.headers.get('x-forwarded-protocol') || 'http';
  const apiBase = `${forwardedProto}://${incomingHost}`;


  // Attach cookie for this host if present
  const cookieForUrl = findCookieForUrl(targetUrl);
  const fetchHeaders: Record<string, string> = {
    'User-Agent': 'Chrome/120.0.0.0',
    'Content-Type': 'text/html',
  };
  if (cookieForUrl) {
    fetchHeaders['Cookie'] = cookieForUrl;
  }

  const res = await fetch(targetUrl, {
    redirect: 'follow',
    headers: fetchHeaders,
  });

  if (!res.ok) {
    console.error(`[Clone] Clone error for ${targetUrl}: ${res.status} ${res.statusText}`);
    return new Response(JSON.stringify({ error: `${res.statusText}` }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const pageUrl = new URL(res.url);
  const baseTagHref = $('base[href]').attr('href');
  const clonedBase = (baseTagHref ? new URL(baseTagHref, pageUrl) : new URL('.', pageUrl)).href;

  // Remove cookie consent banners and related elements
  $('[class*="cookie"], [id*="cookie"], [class*="consent"], [id*="consent"], [class*="gdpr"], [id*="gdpr"]').remove();

  // Rewrite links
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (/^(#|mailto:|tel:|javascript:)/i.test(href)) return;
    $(el).attr("href", absoluteUrl(clonedBase, href));
  });

  $("img[src]").each((_, el) => {
    const src = $(el).attr("src") as string;
    $(el).attr("src", absoluteUrl(clonedBase, src));
  });

  // Rewrite srcset for responsive images
  $("img[srcset], source[srcset]").each((_, el) => {
    const srcset = $(el).attr("srcset");
    if (!srcset) return;
    const rewritten = srcset
      .split(",")
      .map(part => {
        const [u, d] = part.trim().split(/\s+/, 2);
        if (!u || isSkippable(u)) return part;
        const abs = absoluteUrl(clonedBase, u);
        return d ? `${abs} ${d}` : abs;
      })
      .join(", ");
    $(el).attr("srcset", rewritten);
  });

  const scripts = extractScripts($, clonedBase, apiBase, targetUrl);
  rewriteStyles($, clonedBase, apiBase);
  let body = $('body').html() || '';

  // Also return title and favicon
  const title = $('title').first().text().trim() || 'Annotation Page';
  const favicon = $('link[rel="icon"]').attr('href') ||
    $('link[rel="shortcut icon"]').attr('href') ||
    $('link[rel="apple-touch-icon"]').attr('href') || '';

  return new Response(JSON.stringify({ title, favicon, body, scripts }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
