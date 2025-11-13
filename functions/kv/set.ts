import { createClient } from 'redis';

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
  try {
    // Get the key from URL parameters
    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    if (!key) {
      return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    let body: { value: unknown; ttl?: number };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!('value' in body)) {
      return new Response(JSON.stringify({ error: 'Missing value in body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if Redis credentials are configured
    if (!env.REDIS_URL) {
      return new Response(JSON.stringify({ error: 'Redis not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create Redis client
    const client = createClient({
      url: env.REDIS_URL,
      password: env.REDIS_TOKEN,
    });

    await client.connect();

    try {
      // Serialize value (convert objects to JSON strings)
      const serializedValue = typeof body.value === 'string'
        ? body.value
        : JSON.stringify(body.value);

      // Set value in Redis with optional TTL
      if (body.ttl && typeof body.ttl === 'number' && body.ttl > 0) {
        await client.setEx(key, body.ttl, serializedValue);
      } else {
        await client.set(key, serializedValue);

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
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } finally {
      client.destroy();
    }
  } catch (error) {
    console.error('Redis SET error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to set value in Redis',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
