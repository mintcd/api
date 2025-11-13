const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  try {
    // Get the key from URL parameters
    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    if (!key) {
      return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if KV namespace is configured
    if (!env.KV) {
      return new Response(JSON.stringify({ error: 'KV namespace not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get value from Cloudflare KV
    const value = await env.KV.get(key);

    if (value === null) {
      return new Response(JSON.stringify({ error: 'Key not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try to parse as JSON, otherwise return as string
    let parsedValue;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }

    return new Response(JSON.stringify({ key, value: parsedValue }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('KV GET error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to get value from KV',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};
