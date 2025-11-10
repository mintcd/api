import { listR2Objects } from '@/utils/r2-helpers';

export const onRequestGet: PagesFunction = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const bucket = url.searchParams.get('bucket') || '';
  const type = url.searchParams.get('type') || '';
  const prefix = url.searchParams.get('prefix') || '';
  const delimiter = url.searchParams.get('delimiter') === '1';

  console.log(`Listing blobs in bucket="${bucket}" with type="${type}"`);

  try {
    const res = await listR2Objects(env, bucket, prefix, delimiter ? '/' : undefined);
    const contents = res.Contents || [];

    let blobs = contents.map((obj: any) => ({
      pathname: obj.Key || '',
      size: obj.Size ?? 0,
      uploadedAt: obj.LastModified ? new Date(obj.LastModified).toISOString() : '',
    }));

    // Filter by type extension if provided
    if (type) {
      const types = type.split(',');
      blobs = blobs.filter((b: { pathname: string }) => types.some((t: string) => b.pathname.endsWith(t)));
    }

    // Sort by upload date (newest first)
    blobs.sort((a: { uploadedAt: string }, b: { uploadedAt: string }) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );

    // Build proxied fetch URL for each object
    const origin = url.origin;
    const simplifiedBlobs = blobs.map((b: { pathname: string; size: number; uploadedAt: string }) => ({
      url: `${origin}/blob/fetch?path=${encodeURIComponent(b.pathname)}&bucket=${encodeURIComponent(bucket)}`,
      pathname: b.pathname,
      size: b.size,
      uploadedAt: b.uploadedAt,
    }));

    return new Response(JSON.stringify(simplifiedBlobs), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('List error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to list files'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
