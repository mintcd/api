import { getR2Object } from '@/utils/r2-helpers';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequest: PagesFunction = async (context) => {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  const bucket = url.searchParams.get('bucket');

  if (!path || !bucket) {
    return new Response(JSON.stringify({ error: "Missing 'path' or 'bucket' parameter" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const { content, contentType } = await getR2Object(env, bucket, path);
    return new Response(content, {
      status: 200,
      headers: { 'Content-Type': contentType, ...corsHeaders }
    });
  } catch (error) {
    console.error('Fetch error:', error);
    const e = error as any;
    // Try to surface 404-style metadata from AWS SDK if present
    let status = 500;
    let msg = 'Fetch failed';
    if (e instanceof Error) msg = e.message;
    try {
      const meta = (e as { $metadata?: { httpStatusCode?: number } }).$metadata;
      if (meta?.httpStatusCode) status = meta.httpStatusCode;
      const name = (e as { name?: string }).name;
      if (name === 'NoSuchKey' || status === 404) msg = 'File not found';
    } catch { }
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
