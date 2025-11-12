import { listR2Objects } from '@/utils/r2-helpers';

export const onRequestGet: PagesFunction = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const bucket = url.searchParams.get('bucket') || '';
  const type = url.searchParams.get('type') || '';
  const prefix = url.searchParams.get('prefix') || '';
  const delimiter = url.searchParams.get('delimiter') === '1';


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


    console.log(`Listed ${blobs.length} blobs in bucket="${bucket}" with type="${type}"`);
    console.log(blobs)

    return new Response(JSON.stringify(blobs), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
    });
  } catch (error) {
    console.error('List error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to list files'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
    });
  }
}

