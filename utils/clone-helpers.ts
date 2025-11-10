/* eslint-disable @typescript-eslint/no-explicit-any */
import cookies from './cookies.json'
import * as cheerio from 'cheerio';
import * as css from 'css';
import { injectSignalSnippet } from '../utils/signal';

type CheerioRoot = ReturnType<typeof cheerio.load>;

export const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
};

export function findCookieForUrl(urlStr: string): string | undefined {
  const hostname = new URL(urlStr).hostname;

  if (cookies && typeof cookies === 'object' && cookies[hostname as keyof typeof cookies]) {
    const list = cookies[hostname as keyof typeof cookies];
    console.log(`Found ${list.length} cookies for ${hostname}`);

    const cookieStr = list
      .map((c: unknown) => {
        if (!c || typeof c !== 'object') return null;
        const obj = c as Record<string, unknown>;
        if (!obj.name) return null;
        const name = String(obj.name);
        const value = obj.value ?? '';
        return `${name}=${String(value)}`;
      })
      .filter(Boolean)
      .join('; ');
    if (cookieStr) return cookieStr;
  }
  return undefined;
}
export function absoluteUrl(base: string, relative: string): string {
  if (!relative) return '';

  // Skip special schemes - leave them as-is
  if (/^data:|^blob:|^mailto:|^tel:|^javascript:/i.test(relative)) return relative;

  try {
    // new URL handles absolute, protocol-relative and relative URLs when given a base
    return new URL(relative, base).href;
  } catch (e) {
    // Fallback: if base isn't a valid URL for some reason, try using the directory of base
    try {
      const dir = new URL('.', base).href;
      return new URL(relative, dir).href;
    } catch (err) {
      // Give up and return the relative unchanged
      return relative;
    }
  }
}

export function proxiedUrl(apiBase: string, targetUrl: string): string {
  const u = new URL(targetUrl);
  const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;

  const proto = (u.protocol === 'http:' || u.protocol === 'https:') ? u.protocol.replace(':', '') + '/' : '';
  const result = `${base}/proxy/${proto}${u.host}${u.pathname}${u.search}${u.hash}`;
  return result;
}

export function isSkippable(u: string) {
  return /^data:|^blob:|^mailto:|^tel:|^javascript:/i.test(u || "");
}

export type ScriptItem = { src?: string; content?: string; type?: string; async?: boolean; defer?: boolean };

export function rewriteStyles($: CheerioRoot, clonedBase: string, apiBase: string): string[] {
  const headStyles: string[] = [];

  // Process head <style> tags
  $('head style').each((_: any, el: any) => {
    let styleContent = $(el).html() || '';
    styleContent = styleContent.replace(/font-family\s*:\s*([^;]+);/gi, 'font-family: $1 !important;');
    try {
      const parsed = css.parse(styleContent);
      if (parsed.stylesheet) {
        parsed.stylesheet.rules.forEach((rule: any) => {
          if (rule.type === 'rule' && rule.selectors) {
            rule.selectors = rule.selectors.map((sel: any) => {
              let newSel = sel.replace(/\bbody\b/g, '.cloned-content');
              if (!newSel.includes('.cloned-content')) newSel = '.cloned-content ' + newSel;
              return newSel;
            });
          }
        });
        styleContent = css.stringify(parsed);
      }
    } catch (e) {
      styleContent = `.cloned-content { ${styleContent} }`;
    }
    // Rewrite urls and @imports relative to the page (clonedBase) via the proxy
    try {
      styleContent = rewriteCss(styleContent, clonedBase, apiBase);
    } catch { /* fall back to original if rewriteCss fails */ }

    headStyles.push(`<style>${styleContent}</style>`);
  }).remove();

  // Collect head stylesheet links
  $('head link[rel="stylesheet"]').each((_: any, el: any) => {
    // Rewrite link hrefs to use the proxy so they load through our API
    try {
      const href = $(el).attr('href');
      if (href) {
        try {
          const abs = absoluteUrl(clonedBase, href);
          $(el).attr('href', proxiedUrl(apiBase, abs));
        } catch { /* leave href as-is on failure */ }
      }
    } catch { }

    headStyles.push($.html(el));
  }).remove();

  const $body = $('body');
  for (let i = headStyles.length - 1; i >= 0; i--) {
    $body.prepend(headStyles[i]);
  }

  // Rewrite body <style> tags in-place (proxy urls/@imports and scope selectors)
  $('body style').each((_: any, el: any) => {
    try {
      let styleContent = $(el).html() || '';
      // Use rewriteCss to handle url(...) and @import rewrites relative to the page
      try {
        styleContent = rewriteCss(styleContent, clonedBase, apiBase);
      } catch { /* proceed with original if rewrite fails */ }

      try {
        const parsed = css.parse(styleContent);
        if (parsed.stylesheet) {
          parsed.stylesheet.rules.forEach((rule: any) => {
            if (rule.type === 'rule' && rule.selectors) {
              rule.selectors = rule.selectors.map((sel: any) => {
                let newSel = sel.replace(/\bbody\b/g, '.cloned-content');
                if (!newSel.includes('.cloned-content')) newSel = '.cloned-content ' + newSel;
                return newSel;
              });
            }
          });
          styleContent = css.stringify(parsed);
        }
      } catch (e) {
        styleContent = `.cloned-content { ${styleContent} }`;
      }
      $(el).text(styleContent);
    } catch { }
  });

  return headStyles;
}
export function extractScripts($: CheerioRoot, clonedBase: string, apiBase: string, pageUrl: string): ScriptItem[] {
  const scripts: ScriptItem[] = [];

  // Process all scripts in a single pass. Push to headScripts when the script's
  // parent is <head>, otherwise push to bodyScripts. This removes duplicated
  // logic while preserving behavior (proxify srcs and rewrite inline content).
  $('script').each((_: any, el: any) => {
    const script = $(el);
    const src = script.attr('src');
    const content = (script.text() || '').trim();
    const type = script.attr('type') || undefined;
    const async = script.attr('async') !== undefined;
    const defer = script.attr('defer') !== undefined;

    // Determine whether this script lives in head or not
    let parentTag = undefined as string | undefined;
    try {
      const parent = script.parent();
      const p = parent && parent.get && parent.get(0);
      parentTag = p && p.tagName ? String(p.tagName).toLowerCase() : undefined;
    } catch { parentTag = undefined; }

    if (src) {
      try {
        const abs = absoluteUrl(clonedBase, src);
        scripts.push({ src: proxiedUrl(apiBase, abs), type, async, defer });
      } catch {
        scripts.push({ src, type, async, defer });
      }
    } else if (content) {
      let rewrittenContent = content;
      rewrittenContent = rewrittenContent.replace(/(?:["']?)src(?:["']?)\s*:\s*("|')(.*?)\1/g, (m: any, q: any, u: any) => {
        if (!u || u.startsWith('http') || u.startsWith('//') || isSkippable(u) || u.includes('/proxy/')) return m;
        try { return `src: ${q}${proxiedUrl(apiBase, absoluteUrl(clonedBase, u))}${q}`; } catch { return m; }
      });
      rewrittenContent = rewrittenContent.replace(/\.src\s*=\s*("|')(.*?)\1/g, (m: any, q: any, u: any) => {
        if (!u || u.startsWith('http') || u.startsWith('//') || isSkippable(u) || u.includes('/proxy/')) return m;
        try { return m.replace(u, proxiedUrl(apiBase, absoluteUrl(clonedBase, u))); } catch { return m; }
      });
      rewrittenContent = rewrittenContent.replace(/setAttribute\(\s*("|')src\1\s*,\s*("|')(.*?)\2\s*\)/g, (m: any, _q1: any, q2: any, u: any) => {
        if (!u || u.startsWith('http') || u.startsWith('//') || isSkippable(u) || u.includes('/proxy/')) return m;
        try { return m.replace(u, proxiedUrl(apiBase, absoluteUrl(clonedBase, u))); } catch { return m; }
      });
      rewrittenContent = rewrittenContent.replace(/(\w+)\s*:\s*['"](\/[^'\"]*)['"]/g, (m: any, prop: any, u: any) => {
        if (prop === 'src' && !u.startsWith('http') && !u.startsWith('//') && !isSkippable(u) && !u.includes('/proxy/')) {
          try { return `${prop}: '${proxiedUrl(apiBase, absoluteUrl(clonedBase, u))}'`; } catch { return m; }
        }
        return m;
      });

      const finalContent = injectSignalSnippet(rewrittenContent, pageUrl);
      scripts.push({ content: finalContent, type, async, defer });
    }
  }).remove();

  return scripts;
}

export function rewriteCss(css: string, cssUrl: string, apiBase: string) {
  const cssUrlObj = new URL(cssUrl);

  // Rewrite url(...) 
  css = css.replace(/url\((['"]?)([^'"\)]+)\1\)/g, (match, quote, url) => {
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return match;

    try {
      // Resolve relative URLs properly relative to the CSS file location
      const resolvedUrl = new URL(url, cssUrl);
      const rewrittenUrl = proxiedUrl(apiBase, resolvedUrl.href);
      return `url(${quote}${rewrittenUrl}${quote})`;
    } catch {
      // If URL parsing fails, fall back to constructing a path-only proxy
      const proxyBase = `/proxy/${cssUrlObj.host}`;
      const fullUrl = url.startsWith('/') ? `${proxyBase}${url}` : `${proxyBase}/${url}`;
      return `url(${quote}${fullUrl}${quote})`;
    }
  });

  // Rewrite @import url(...)
  css = css.replace(/@import\s+url\((['"]?)([^'"\)]+)\1\)/g, (match, quote, url) => {
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return match;

    try {
      // Resolve relative URLs properly relative to the CSS file location
      const resolvedUrl = new URL(url, cssUrl);
      const rewrittenUrl = proxiedUrl(apiBase, resolvedUrl.href);
      return `@import url(${quote}${rewrittenUrl}${quote})`;
    } catch {
      const proxyBase = `/proxy/${cssUrlObj.host}`;
      const fullUrl = url.startsWith('/') ? `${proxyBase}${url}` : `${proxyBase}/${url}`;
      return `@import url(${quote}${fullUrl}${quote})`;
    }
  });

  // Also handle plain @import 'path'; or @import "path"; (without url())
  css = css.replace(/@import\s+(['"])([^'";\)]+)\1\s*;/g, (match, quote, url) => {
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return match;

    try {
      const resolvedUrl = new URL(url, cssUrl);
      const rewrittenUrl = proxiedUrl(apiBase, resolvedUrl.href);
      return `@import url(${quote}${rewrittenUrl}${quote})`;
    } catch {
      const cssUrlObj = new URL(cssUrl);
      const proxyBase = `/proxy/${cssUrlObj.host}`;
      const fullUrl = url.startsWith('/') ? `${proxyBase}${url}` : `${proxyBase}/${url}`;
      return `@import url(${quote}${fullUrl}${quote})`;
    }
  });

  return css;
}
