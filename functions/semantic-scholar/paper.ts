const fields = [
  'title',
  'abstract',
  'authors',
  'year',
  'externalIds',
  'citationCount',
  'referenceCount',
  'references.paperId',
  'references.title',
  'references.authors',
  'references.year',
  'references.citationCount',
  'references.referenceCount',
  'references.externalIds',
  'citations.paperId',
  'citations.title',
  'citations.authors',
  'citations.year',
  'citations.citationCount',
  'citations.referenceCount',
  'citations.externalIds',
].join(',');

export async function onRequest(context: any) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiUrl = `https://api.semanticscholar.org/graph/v1/paper/${id}?fields=${fields}`;

  try {
    const res = await fetch(apiUrl, {
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.SEMANTIC_SCHOLAR_API_KEY ?? '',
      }
    });

    if (!res.ok) {
      const errorBody = await res.json();
      return new Response(JSON.stringify(errorBody), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const SCpaper: SemanticScholarPaper = await res.json();
    const notionPaper = {
      scid: SCpaper.paperId,
      doi: SCpaper.externalIds?.DOI ?? '',
      arxivId: SCpaper.externalIds?.ArXiv ?? '',
      aclId: SCpaper.externalIds?.ACL ?? '',
      dblpId: SCpaper.externalIds?.DBLP ?? '',

      title: SCpaper.title,
      year: SCpaper.year,
      citationCount: SCpaper.citationCount,
      referenceCount: SCpaper.referenceCount,

      authors: SCpaper.authors.map(author => ({
        scid: author.authorId,
        name: author.name,
      })),

      abstract: SCpaper.abstract,
      references: SCpaper.references ? SCpaper.references.map(ref => ({
        scid: ref.paperId,
        title: ref.title,
        authors: ref.authors.map(author => ({
          scid: author.authorId,
          name: author.name,
        })),
        year: ref.year,
        citationCount: ref.citationCount,
        referenceCount: ref.referenceCount,
        doi: ref.externalIds?.DOI ?? '',
        arxivId: ref.externalIds?.ArXiv ?? '',
        aclId: ref.externalIds?.ACL ?? '',
        dblpId: ref.externalIds?.DBLP ?? '',
      })) : null,
      citations: SCpaper.citations ? SCpaper.citations.map(cite => ({
        scid: cite.paperId,
        title: cite.title,
        authors: cite.authors.map(author => ({
          scid: author.authorId,
          name: author.name,
        })),
        year: cite.year,
        citationCount: cite.citationCount,
        referenceCount: cite.referenceCount,
        doi: cite.externalIds?.DOI ?? '',
        arxivId: cite.externalIds?.ArXiv ?? '',
        aclId: cite.externalIds?.ACL ?? '',
        dblpId: cite.externalIds?.DBLP ?? '',
      })) : null
    };

    return new Response(JSON.stringify(notionPaper), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Fetch failed:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
