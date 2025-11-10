/* eslint-disable @typescript-eslint/no-explicit-any */
import cookies from './cookies.json'
import * as cheerio from 'cheerio';
import * as css from 'css';
import { injectSignalSnippet } from '../utils/signal';

type CheerioRoot = ReturnType<typeof cheerio.load>;

export const headers = {
  'User-Agent': 'Mozilla/5.0 (compatible; AnnotationBot/1.0)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate',
  'Cache-Control': 'no-cache'
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
  try {
    const u = new URL(targetUrl);
    const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
    const result = `${base}/proxy/${u.host}${u.pathname}${u.search}${u.hash}`;
    // console.log(`Proxying ${targetUrl} -> ${result}`);
    return result;
  } catch (e) {
    // If targetUrl is invalid, return it unchanged
    return targetUrl;
  }
}

export function isSkippable(u: string) {
  return /^data:|^blob:|^mailto:|^tel:|^javascript:/i.test(u || "");
}

// --- Utilities for processing styles/scripts in cloned documents ---

export function extractHeadStylesAndRemove($: CheerioRoot, clonedBase: string, apiBase: string): string[] {
  const headStyles: string[] = [];
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
    headStyles.push(`<style>${styleContent}</style>`);
  });

  $('head link[rel="stylesheet"]').each((_: any, el: any) => {
    headStyles.push($.html(el));
  });

  $('head style, head link[rel="stylesheet"]').remove();
  return headStyles;
}

export type ScriptItem = { src?: string; content?: string; type?: string; async?: boolean; defer?: boolean };

export function extractHeadScriptsAndRemove($: CheerioRoot, clonedBase: string, apiBase: string, pageUrl: string): ScriptItem[] {
  const headScripts: ScriptItem[] = [];
  $('head script').each((_: any, el: any) => {
    const script = $(el);
    const src = script.attr('src');
    const content = script.text();
    if (src) {
      headScripts.push({
        src: proxiedUrl(apiBase, absoluteUrl(clonedBase, src)),
        type: script.attr('type'),
        async: script.attr('async') !== undefined,
        defer: script.attr('defer') !== undefined
      });
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
      headScripts.push({ content: finalContent, type: script.attr('type'), async: script.attr('async') !== undefined, defer: script.attr('defer') !== undefined });
    }
  });
  $('head script').remove();
  return headScripts;
}

export function rewriteBodyScriptsInPlace($: CheerioRoot, clonedBase: string, apiBase: string, pageUrl: string) {
  $('body script').each((_: any, el: any) => {
    const script = $(el);
    const src = script.attr('src');
    const content = script.text();
    if (src) {
      try {
        const abs = absoluteUrl(clonedBase, src);
        script.attr('src', proxiedUrl(apiBase, abs));
      } catch { /* leave as-is */ }
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
      script.text(finalContent);
    }
  });
}

export function rewriteBodyStylesInPlace($: CheerioRoot, clonedBase: string, apiBase: string) {
  $('body style').each((_: any, el: any) => {
    try {
      let styleContent = $(el).html() || '';
      styleContent = styleContent.replace(/url\((['"]?)([^'"\)]*)\1\)/g, (m: any, _q: any, u: any) => {
        if (!u || u.startsWith('http') || u.startsWith('//') || isSkippable(u) || u.includes('/proxy/')) return m;
        try { return `url('${proxiedUrl(apiBase, absoluteUrl(clonedBase, u))}')`; } catch { return m; }
      });
      styleContent = styleContent.replace(/@import\s+(?:url\()?['"]?(.*?)['"]?\)?\s*;/g, (m: any, u: any) => {
        if (!u || u.startsWith('http') || u.startsWith('//') || isSkippable(u) || u.includes('/proxy/')) return m;
        try { return `@import url('${proxiedUrl(apiBase, absoluteUrl(clonedBase, u))}');`; } catch { return m; }
      });
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
}

export function rewriteCssCode(css: string, cssUrl: string, apiBase: string) {
  const cssUrlObj = new URL(cssUrl);
  // Use the simpler format: /proxy/{host}/{path} (without protocol)
  const proxyBase = `${apiBase}/proxy/${cssUrlObj.host}`;

  // Rewrite url(...) 
  css = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (match, quote, url) => {
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return match;

    try {
      // Resolve relative URLs properly relative to the CSS file location
      const resolvedUrl = new URL(url, cssUrl);
      const rewrittenUrl = `${apiBase}/proxy/${resolvedUrl.host}${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
      return `url(${quote}${rewrittenUrl}${quote})`;
    } catch {
      // If URL parsing fails, fall back to simple concatenation
      const fullUrl = url.startsWith('/') ? `${proxyBase}${url}` : `${proxyBase}/${url}`;
      return `url(${quote}${fullUrl}${quote})`;
    }
  });

  // Rewrite @import url(...)
  css = css.replace(/@import\s+url\((['"]?)([^'")]+)\1\)/g, (match, quote, url) => {
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return match;

    try {
      // Resolve relative URLs properly relative to the CSS file location
      const resolvedUrl = new URL(url, cssUrl);
      const rewrittenUrl = `${apiBase}/proxy/${resolvedUrl.host}${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
      return `@import url(${quote}${rewrittenUrl}${quote})`;
    } catch {
      // If URL parsing fails, fall back to simple concatenation
      const fullUrl = url.startsWith('/') ? `${proxyBase}${url}` : `${proxyBase}/${url}`;
      return `@import url(${quote}${fullUrl}${quote})`;
    }
  });

  return css;
}
