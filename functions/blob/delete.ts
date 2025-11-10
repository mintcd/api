import { getS3Client, DeleteObjectCommand } from '@/utils/r2-client';

export async function onRequest(context: any) {
  const { request, env } = context;

  if (request.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
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

    const s3 = getS3Client(env);
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

    return new Response(JSON.stringify({
      success: true,
      message: 'File deleted successfully',
      path
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Delete error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Delete failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
