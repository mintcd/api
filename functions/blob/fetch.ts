import { getS3Client, GetObjectCommand, streamToString } from '@/utils/r2-client';

export async function onRequest(context: any) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  const bucket = url.searchParams.get('bucket');

  if (!path || !bucket) {
    return new Response(JSON.stringify({ error: "Missing 'path' or 'bucket' parameter" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const s3 = getS3Client(env);
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: path }));
    const content = await streamToString(res.Body);

    const getContentType = (filePath: string): string => {
      if (filePath.endsWith('.json')) return 'application/json';
      if (filePath.endsWith('.xml')) return 'application/xml';
      return 'text/plain';
    };

    return new Response(content, {
      status: 200,
      headers: { 'Content-Type': getContentType(path) }
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
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
