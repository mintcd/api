type SemanticScholarPaper = {
  paperId: string,
  title: string
  authors: {
    authorId: string;
    name: string;
  }[],
  abstract: string;
  citationCount: number;
  referenceCount: number;
  externalIds: {
    DOI: string;
    ArXiv: string;
    ACL: string;
    DBLP: string;
  };
  year: number;

  references: RelatedPaper[] | null;
  citations: RelatedPaper[] | null;
}

type RelatedPaper = Omit<SemanticScholarPaper, 'references' | 'citations' | 'abstract'>
