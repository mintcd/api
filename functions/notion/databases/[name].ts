/* eslint-disable @typescript-eslint/no-explicit-any */
import { getNotionClient } from '@/utils/notion-client';
import { databases } from '@/utils/notion-databases';
import { convertToNotionFormat, simplifyNotionFormat } from '@/utils/notion-format';
import type { DatabaseObjectResponse } from '@notionhq/client/build/src/api-endpoints';

async function getSchema(client: any, id: string) {
  let db;
  try {
    db = await client.databases.retrieve({ database_id: id }) as DatabaseObjectResponse;
  } catch (e: any) {
    throw new Error('Failed to retrieve database schema: ' + e.message);
  }
  return db.properties;
}

export async function onRequest(context: any) {
  const { request, env, params } = context;
  const { name } = params;
  const client = getNotionClient(env.NOTION_TOKEN);
  const databaseId = databases[name] as string;

  if (!databaseId) {
    return new Response(JSON.stringify({ error: 'Database not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'GET') {
    try {
      const schema = await getSchema(client, databaseId);
      return new Response(JSON.stringify(schema), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (request.method === 'POST') {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    console.log("Called with action:", action);

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(body, action);

    if (!action || !['get', 'add'].includes(action)) {
      return new Response(JSON.stringify({
        error: 'Missing or invalid "action" field'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action === 'get') {
      const filter = body.filter;

      const notionQuery: any = { database_id: databaseId };
      if (filter) {
        notionQuery.filter = filter;
      }

      const pages = await client.databases
        .query(notionQuery)
        .then((res: any) => res.results.map((page: any) => {
          const dbPage = page as DatabaseObjectResponse;
          const simplifiedProps: Record<string, unknown> = {};

          for (const [key, prop] of Object.entries(dbPage.properties)) {
            simplifiedProps[key] = simplifyNotionFormat(prop.type, prop);
          }

          simplifiedProps.id = dbPage.id;
          simplifiedProps.created_time = dbPage.created_time;
          simplifiedProps.last_edited_time = dbPage.last_edited_time;

          return simplifiedProps;
        }));

      return new Response(JSON.stringify(pages), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action === 'add') {
      const schema = await getSchema(client, databaseId) as Record<string, any>;

      const properties: Record<string, any> = {};
      for (const [key, value] of Object.entries(body)) {
        if (key === 'action') continue;

        const propSchema = schema[key];
        if (!propSchema) {
          continue;
        }

        const notionProp = convertToNotionFormat(propSchema.type, value);
        if (notionProp !== undefined) {
          properties[key] = notionProp;
        }
      }

      try {
        const created = await client.pages.create({
          parent: { database_id: databaseId },
          properties
        });

        return new Response(JSON.stringify({ id: created.id }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({
          error: err.message,
          status: err.status
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Unexpected action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}
