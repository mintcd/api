/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { getNotionClient } from '@/utils/notion-client';
import { convertToNotionFormat, simplifyNotionFormat } from '@/utils/notion-format';

async function getPageProperties(client: any, pageId: string) {
  const page = await client.pages.retrieve({ page_id: pageId }) as any;

  const databaseId =
    page.parent?.type === 'database_id' ? page.parent.database_id : null;

  if (!databaseId) {
    throw new Error('Page is not part of a database.');
  }

  const database = await client.databases.retrieve({ database_id: databaseId });
  return database.properties;
}

export async function onRequest(context: any) {
  const { request, env, params } = context;
  const { id } = params;
  const client = getNotionClient(env.NOTION_TOKEN);

  if (request.method === 'GET') {
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing `id` parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const page = await client.pages.retrieve({ page_id: id }) as PageObjectResponse;
      const rawProperties = page.properties;

      const simplified: Record<string, any> = {};

      for (const [key, prop] of Object.entries(rawProperties)) {
        simplified[key] = simplifyNotionFormat(prop.type, prop);
      }

      return new Response(JSON.stringify({
        id: page.id,
        ...simplified,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      console.error(`Failed to retrieve page ${id}:`, err);
      return new Response(JSON.stringify({ error: 'Failed to retrieve page' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (request.method === 'PATCH') {
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing `id` parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const schema = await getPageProperties(client, id);
      const formattedProps: Record<string, any> = {};

      for (const [key, value] of Object.entries(body)) {
        const propertyMeta = schema[key];
        if (!propertyMeta) {
          return new Response(JSON.stringify({
            error: `Property ${key} not found in the page.`
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const type = propertyMeta.type;
        try {
          formattedProps[key] = convertToNotionFormat(type, value);
        } catch (err) {
          return new Response(JSON.stringify({
            error: `Failed to convert property ${key}: ${err}`
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      const updated = await client.pages.update({
        page_id: id,
        properties: formattedProps,
      });

      return new Response(JSON.stringify({ success: true, updated }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}
