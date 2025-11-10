/* eslint-disable @typescript-eslint/no-explicit-any */
import { simplifyNotionFormat } from '@/utils/notion-format';
import { getNotionClient } from '@/utils/notion-client';
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';

export async function onRequest(context: any) {
  const { request, env, params } = context;
  const { id } = params;
  const client = getNotionClient(env.NOTION_TOKEN);

  if (request.method === 'GET') {
    try {
      const response = await client.blocks.children.list({
        block_id: id,
      });

      const fullText = response.results
        .map((res: any) => simplifyNotionFormat(res.type, res))
        .join("");

      let data: any;
      try {
        data = fullText ? JSON.parse(fullText) : {};
      } catch (jsonError) {
        return new Response(JSON.stringify({
          error: 'Block content is not valid JSON',
          raw: fullText,
          detail: jsonError instanceof Error ? jsonError.message : jsonError,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ ...data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({
        error: 'Failed to fetch block children',
        detail: err
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (request.method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!body.content) {
      return new Response(JSON.stringify({ error: 'Missing content' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let contentString: string;
    if (typeof body.content === 'string') {
      contentString = body.content;
    } else {
      contentString = JSON.stringify(body.content);
    }

    try {
      // STEP 1: Delete existing children
      const existingChildren = await client.blocks.children.list({ block_id: id });

      for (const child of existingChildren.results) {
        if ('id' in child) {
          await client.blocks.update({
            block_id: child.id,
            archived: true,
          });
        }
      }

      // STEP 2: Chunk and append new content
      const blocks: BlockObjectRequest[] = [];
      const maxRichTextPerParagraph = 100;
      const maxBlocks = 100;
      const maxCharsPerRichText = 2000;
      let currentRichTexts: any[] = [];

      for (let i = 0; i < contentString.length; i += maxCharsPerRichText) {
        const chunk = contentString.slice(i, i + maxCharsPerRichText);

        currentRichTexts.push({
          type: 'text',
          text: {
            content: chunk,
          },
        });

        if (
          currentRichTexts.length === maxRichTextPerParagraph ||
          i + maxCharsPerRichText >= contentString.length
        ) {
          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: currentRichTexts,
            },
          });

          currentRichTexts = [];

          if (blocks.length >= maxBlocks) {
            return new Response(JSON.stringify({
              error: 'Failed to replace blocks',
              details: 'Content too long'
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }
      }

      await client.blocks.children.append({
        block_id: id,
        children: blocks,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      console.error('Error updating Notion block:', err);
      return new Response(JSON.stringify({
        error: 'Failed to replace blocks',
        details: err
      }), {
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
