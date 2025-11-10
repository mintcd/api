import { uploadR2Object } from '@/utils/r2-helpers';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequest: PagesFunction = async (context) => {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    const bucket = url.searchParams.get('bucket');
    const type = url.searchParams.get('type');

    if (!path || !bucket) {
      return new Response(JSON.stringify({ error: "Missing 'path', 'bucket' parameter" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json() as { content?: unknown };
    const { content } = body;

    if (typeof content !== 'string') {
      return new Response(JSON.stringify({ error: "Missing or invalid 'content' parameter" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Determine ContentType using the `type` query param (if provided), otherwise infer from path extension
    const inferType = (type || path?.match(/(\.[^./\\?#]+)$/)?.[1] || '').toLowerCase();
    let contentType = 'application/octet-stream';
    if (inferType === '.json') contentType = 'application/json; charset=utf-8';
    else if (inferType === '.txt') contentType = 'text/plain; charset=utf-8';
    else if (inferType === '.html' || inferType === '.htm') contentType = 'text/html; charset=utf-8';

    await uploadR2Object(env, bucket, path, content, contentType);

    return new Response(JSON.stringify({
      success: true,
      message: 'File uploaded successfully',
      path
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Upload error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Upload failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
