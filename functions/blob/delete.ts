import { deleteR2Object } from '@/utils/r2-helpers';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
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

  if (request.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    const bucket = url.searchParams.get('bucket');

    if (!path || !bucket) {
      return new Response(JSON.stringify({ error: "Missing 'path' or 'bucket' parameter" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Normalize key: remove leading slash if present
    const key = path.startsWith('/') ? path.slice(1) : path;

    await deleteR2Object(env, bucket, key);

    return new Response(JSON.stringify({
      success: true,
      message: 'File deleted successfully',
      path
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Delete error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Delete failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
