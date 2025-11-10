/* eslint-disable @typescript-eslint/no-explicit-any */
export function convertToNotionFormat(type: string, value: any): any {
  switch (type) {
    case 'title':
      return {
        title: [{
          type: 'text',
          text: { content: value?.toString?.() ?? '' },
        }],
      };

    case 'rich_text':
      return {
        rich_text: [{
          type: 'text',
          text: { content: value?.toString?.() ?? '' },
        }],
      };

    case 'number':
      return { number: typeof value === 'number' ? value : Number(value) };

    case 'checkbox':
      return { checkbox: Boolean(value) };

    case 'select':
      return { select: { name: value?.toString?.() ?? '' } };

    case 'multi_select':
      return {
        multi_select: Array.isArray(value)
          ? value.map(v => ({ name: v?.toString?.() ?? '' }))
          : [],
      };

    case 'date':
      return {
        date: typeof value === 'object' && value?.start
          ? { start: value.start }
          : { start: value?.toString?.() ?? '' },
      };

    case 'url':
      return { url: value?.toString?.() ?? '' };

    case 'email':
      return { email: value?.toString?.() ?? '' };

    case 'phone_number':
      return { phone_number: value?.toString?.() ?? '' };

    case 'relation':
      return {
        relation: Array.isArray(value)
          ? value.map((ele: string) => (ele))
          : [],
      };

    case 'files':
      // Support both URLs and file objects
      if (typeof value === 'string') {
        // Single URL
        return {
          files: [{
            type: 'external',
            name: value.split('/').pop()?.split('?')[0] || 'file',
            external: { url: value }
          }]
        };
      } else if (Array.isArray(value)) {
        // Array of URLs
        return {
          files: value.map((url: string) => ({
            type: 'external',
            name: url.split('/').pop()?.split('?')[0] || 'file',
            external: { url }
          }))
        };
      }
      return { files: [] };

    default:
      throw new Error(`Unknown Notion property type: "${type}"`);
  }
}

export function simplifyNotionFormat(type: string, value: any): any {
  switch (type) {
    case 'checkbox':
      return value.checkbox ?? false;
    case 'title':
      return (value.title?.[0]?.text?.content) ?? '';
    case 'rich_text':
      return value.rich_text?.map((r: any) => r.text?.content).join(' ') ?? '';
    case 'multi_select':
      return value.multi_select ?? [];
    case 'select':
      return value.select?.name ?? null;
    case 'date':
      return value.date?.start ?? null;
    case 'number':
      return value.number
    case 'relation':
      return (value.relation ?? []).map((r: any) => ({ id: r.id }))
    case 'paragraph':
      return value.paragraph?.rich_text?.map((r: any) => r.text?.content).join(' ') ?? '';
    case 'files':
      return (value.files ?? []).map((f: any) => {
        if (f.type === 'external') return f.external?.url;
        if (f.type === 'file') return f.file?.url;
        return f.url; // fallback
      }).filter(Boolean);
    default:
      return null;
  }
}
