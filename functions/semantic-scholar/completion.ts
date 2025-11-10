/* eslint-disable @typescript-eslint/no-explicit-any */
export async function onRequest(context: any) {
  const { request } = context;

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q');

  if (!q || typeof q !== 'string' || !q.trim()) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid query' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    let response = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/autocomplete?query=${encodeURIComponent(q)}`,
      {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://www.semanticscholar.org/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return new Response(
        JSON.stringify({ error: text }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let data: any = await response.json();

    if (data.matches && data.matches.length > 0) {
      return new Response(JSON.stringify(data.matches.map((item: any) => ({
        scid: item.id,
        title: item.title,
        authorsYear: item.authorsYear,
      }))), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Try another endpoint
    response = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search/bulk?query=${encodeURIComponent(q)}`,
      {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://www.semanticscholar.org/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return new Response(
        JSON.stringify({ error: text }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    data = await response.json() as any;
    return new Response(JSON.stringify(data.data.map((item: any) => ({
      scid: item.paperId,
      title: item.title
    }))), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
