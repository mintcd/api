/**
 * Injects an execution signal snippet into the given text.
 * @param text The original text to modify.
 * @param url The URL to include in the signal.
 * @returns The modified text with the injected signal snippet.
 */
export function injectSignalSnippet(text: string, url: string): string {
  const signalSnippet = `\n\n;// Proxy execution signal - do not remove\n(function(){try{var d=${JSON.stringify({ url })};if(typeof window!=='undefined'){window.__proxy_script_executed=window.__proxy_script_executed||[];window.__proxy_script_executed.push(d.url);if(typeof window.__proxy_script_executed_dispatch!=='function'){window.__proxy_script_executed_dispatch=function(detail){try{var ev;try{ev=new CustomEvent('proxy:script-executed',{detail:detail});}catch(e){ev=document.createEvent('CustomEvent');ev.initCustomEvent('proxy:script-executed',false,false,detail);}if(typeof window!=='undefined'&&window.dispatchEvent){window.dispatchEvent(ev);} }catch(e){if(typeof console!=='undefined'&&console.warn)console.warn('proxy dispatch error',e);}}}try{window.__proxy_script_executed_dispatch(d);}catch(e){} } }catch(err){if(typeof console!=='undefined'&&console.warn)console.warn('proxy signal error',err);} })();\n`;
  return `${text}\n${signalSnippet}`;
}
