import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { XMLParser } from 'fast-xml-parser';
/**
 * Create S3 client for R2
 */
function createS3Client(env: Env): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Execute any S3 command using presigned URL + raw fetch
 * This bypasses AWS SDK's XML deserialization issues in Cloudflare Workers
 */
async function executeR2Command(env: Env, command: any): Promise<Response> {
  const s3Client = createS3Client(env);
  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
  const response = await fetch(signedUrl);

  if (!response.ok) {
    throw new Error(`R2 request failed: ${response.status} ${response.statusText}`);
  }

  return response;
}

/**
 * Parse XML response from R2
 */
function parseXML(xmlText: string): any {
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: true,
    trimValues: true,
  });
  return parser.parse(xmlText);
}

// ============ PUBLIC API ============

export interface R2ListResult {
  Contents?: Array<{
    Key?: string;
    Size?: number;
    LastModified?: Date;
    ETag?: string;
    StorageClass?: string;
  }>;
  KeyCount?: number;
  IsTruncated?: boolean;
  Name?: string;
}

/**
 * List objects in an R2 bucket
 */
export async function listR2Objects(
  env: Env,
  bucket: string,
  prefix?: string,
  delimiter?: string
): Promise<R2ListResult> {
  const command = new ListObjectsV2Command({
    Bucket: bucket,
    ...(prefix ? { Prefix: prefix } : {}),
    ...(delimiter ? { Delimiter: delimiter } : {}),
  });

  const response = await executeR2Command(env, command);
  const xmlText = await response.text();
  const parsed = parseXML(xmlText);
  const result = parsed.ListBucketResult || {};

  // Normalize Contents to array
  let contents = result.Contents;
  if (contents && !Array.isArray(contents)) {
    contents = [contents];
  }

  // Clean up the data
  if (contents) {
    contents = contents.map((item: any) => ({
      Key: item.Key,
      Size: item.Size,
      LastModified: item.LastModified ? new Date(item.LastModified) : undefined,
      ETag: item.ETag,
      StorageClass: item.StorageClass,
    }));
  }

  return {
    Contents: contents || [],
    KeyCount: result.KeyCount,
    IsTruncated: result.IsTruncated === 'true' || result.IsTruncated === true,
    Name: result.Name,
  };
}

/**
 * Get an object from R2 bucket
 */
export async function getR2Object(
  env: Env,
  bucket: string,
  key: string
): Promise<{ content: string; contentType: string }> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await executeR2Command(env, command);
  const content = await response.text();

  // Determine content type from file extension
  const getContentType = (filePath: string): string => {
    if (filePath.endsWith('.json')) return 'application/json';
    if (filePath.endsWith('.xml')) return 'application/xml';
    if (filePath.endsWith('.html')) return 'text/html';
    if (filePath.endsWith('.css')) return 'text/css';
    if (filePath.endsWith('.js')) return 'application/javascript';
    return 'text/plain';
  };

  return {
    content,
    contentType: getContentType(key),
  };
}

/**
 * Upload an object to R2 bucket
 * Note: Upload doesn't need presigned URL workaround since it doesn't return XML
 */
export async function uploadR2Object(
  env: Env,
  bucket: string,
  key: string,
  content: string,
  contentType?: string
): Promise<void> {
  const s3Client = createS3Client(env);

  // Import PutObjectCommand dynamically
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');

  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: content,
    ContentType: contentType || 'application/octet-stream',
  }));
}

/**
 * Delete an object from R2 bucket
 * Note: Delete doesn't need presigned URL workaround since it doesn't return XML
 */
export async function deleteR2Object(
  env: Env,
  bucket: string,
  key: string
): Promise<void> {
  const s3Client = createS3Client(env);

  // Import DeleteObjectCommand dynamically
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

  await s3Client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }));
}
