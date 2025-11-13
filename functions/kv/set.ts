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

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
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

    // Parse request body
    let body: { value: unknown; ttl?: number };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!('value' in body)) {
      return new Response(JSON.stringify({ error: 'Missing value in body' }), {
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

    // Serialize value (convert objects to JSON strings)
    const serializedValue = typeof body.value === 'string'
      ? body.value
      : JSON.stringify(body.value);

    // Set value in Cloudflare KV with optional TTL (expirationTtl in seconds)
    if (body.ttl && typeof body.ttl === 'number' && body.ttl > 0) {
      await env.KV.put(key, serializedValue, { expirationTtl: body.ttl });
    } else {
      await env.KV.put(key, serializedValue);
    }

    console.log(`Set key "${key}" to ${serializedValue} with TTL ${body.ttl ?? 'none'}`);
    return new Response(
      JSON.stringify({
        success: true,
        key,
        message: 'Value stored successfully',
        ...(body.ttl && { ttl: body.ttl })
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('KV SET error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to set value in KV',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};
