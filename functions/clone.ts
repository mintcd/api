import * as cheerio from 'cheerio';
import {
  headers, findCookieForUrl, absoluteUrl, proxiedUrl, isSkippable,
  extractHeadStylesAndRemove, extractHeadScriptsAndRemove,
  rewriteBodyScriptsInPlace, rewriteBodyStylesInPlace
} from '@/utils/clone-helpers';

export async function onRequest(context: any) {
  const { request } = context;

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing URL parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Construct API base from the incoming request
  const incomingHost = request.headers.get('host') || 'localhost';
  const incomingProto = request.headers.get('x-forwarded-proto') || request.headers.get('x-forwarded-protocol') || 'https';
  const apiBase = `${incomingProto}://${incomingHost}`;

  // Attach cookie for this host if present
  const cookieForUrl = findCookieForUrl(targetUrl);
  const fetchHeaders: Record<string, string> = { ...headers };
  if (cookieForUrl) {
    fetchHeaders['Cookie'] = cookieForUrl;
  }

  const res = await fetch(targetUrl, {
    redirect: 'follow',
    headers: fetchHeaders,
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch URL' }), {
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

  // Rewrite stylesheet sources
  $("link[rel='stylesheet'][href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || isSkippable(href)) return;
    const abs = absoluteUrl(clonedBase, href);
    // Don't proxy Google Fonts to ensure font rendering
    if (abs.includes('fonts.googleapis.com')) return;
    $(el).attr("href", proxiedUrl(apiBase, abs));
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

  // Extract and remove head styles (scoped where necessary)
  const headStyles = extractHeadStylesAndRemove($, clonedBase, apiBase);

  // Extract scripts that were in the head and remove them from the doc
  const headScripts = extractHeadScriptsAndRemove($, clonedBase, apiBase, targetUrl);

  console.log(`Extracted head styles: ${headStyles.length}, head scripts: ${headScripts.length}`);

  // Rewrite scripts/styles that live in the body in-place
  rewriteBodyScriptsInPlace($, clonedBase, apiBase, targetUrl);
  rewriteBodyStylesInPlace($, clonedBase, apiBase);

  let body = $('body').html() || '';

  // Build a head insertion containing styles and scripts found in the original document head
  const stylesHTML = (headStyles || []).join('\n');
  const scriptsHTML = (headScripts || []).map(s => {
    if (s.src) {
      const attrs: string[] = [`src="${s.src}"`];
      if (s.type) attrs.push(`type="${s.type}"`);
      if (s.async) attrs.push('async');
      if (s.defer) attrs.push('defer');
      return `<script ${attrs.join(' ')}></script>`;
    }
    if (s.content) {
      const typeAttr = s.type ? ` type="${s.type}"` : '';
      return `<script${typeAttr}>${s.content}</script>`;
    }
    return '';
  }).join('\n');

  // Prepend head assets to body
  const headInsert = [stylesHTML, scriptsHTML].filter(Boolean).join('\n');
  if (headInsert) {
    body = headInsert + '\n' + body;
  }

  // Also return title and favicon
  const title = $('title').first().text().trim() || 'Annotation Page';
  const favicon = $('link[rel="icon"]').attr('href') ||
    $('link[rel="shortcut icon"]').attr('href') ||
    $('link[rel="apple-touch-icon"]').attr('href') || '';

  return new Response(JSON.stringify({ title, favicon, body }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
