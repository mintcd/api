type Env = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  NOTION_TOKEN?: string;
  SEMANTIC_SCHOLAR_API_KEY?: string;
  [key: string]: string | undefined;
}

type PagesContext<E = Env> = {
  request: Request;
  env: E;
  params: Record<string, string>;
  waitUntil: (promise: Promise<unknown>) => void;
  next: () => Promise<Response>;
  data: Record<string, unknown>;
}

type PagesFunction<E = Env> = (context: PagesContext<E>) => Response | Promise<Response>;
