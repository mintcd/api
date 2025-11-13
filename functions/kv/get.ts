import { createClient } from 'redis';

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
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
      // Get value from Redis
      const value = await client.get(key);

      if (value === null) {
        return new Response(JSON.stringify({ error: 'Key not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
      });
    } finally {
      client.destroy();
    }
  } catch (error) {
    console.error('Redis GET error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to get value from Redis',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
