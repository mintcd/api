# API Migration from Vercel to Cloudflare Functions

This directory contains the migrated APIs from Next.js/Vercel to Cloudflare Pages Functions.

## Structure

```
api/
├── functions/              # Cloudflare Functions (serverless endpoints)
│   ├── blob/              # R2 storage operations
│   │   ├── upload.ts
│   │   ├── fetch.ts
│   │   ├── list.ts
│   │   └── delete.ts
│   ├── clone.ts           # Web page cloning endpoint
│   ├── notion/            # Notion API integrations
│   │   ├── blocks/
│   │   │   └── [id].ts
│   │   ├── databases/
│   │   │   └── [name].ts
│   │   └── pages/
│   │       └── [id].ts
│   ├── proxy/             # Reverse proxy for external resources
│   │   └── [[...slug]].ts
│   └── semantic-scholar/  # Semantic Scholar API
│       ├── completion.ts
│       └── paper.ts
├── utils/                 # Shared utilities
│   ├── r2-client.ts
│   ├── notion-client.ts
│   ├── notion-format.ts
│   ├── notion-databases.ts
│   ├── clone-helpers.ts
│   ├── signal.ts
│   └── cookies.json
├── @types/                # TypeScript type definitions
│   └── paper-graph.d.ts
├── package.json
├── wrangler.toml
└── README.md
```

## Key Differences from Vercel/Next.js

### 1. **Function Format**
- **Vercel/Next.js**: Uses `export async function GET/POST(request)` with Next.js Request/Response
- **Cloudflare**: Uses `export async function onRequest(context)` with standard Web APIs

### 2. **Environment Variables**
- **Vercel/Next.js**: Accessed via `process.env.VARIABLE_NAME`
- **Cloudflare**: Accessed via `context.env.VARIABLE_NAME`

### 3. **Dynamic Routes**
- **Vercel/Next.js**: `app/api/[param]/route.ts` with `params` promise
- **Cloudflare**: `functions/[param].ts` with `context.params.param`

### 4. **Response Handling**
- **Vercel/Next.js**: `NextResponse.json(data, { status })`
- **Cloudflare**: `new Response(JSON.stringify(data), { status, headers })`

### 5. **CORS**
- **Vercel/Next.js**: Configured in `next.config.js`
- **Cloudflare**: Set manually in response headers or use `_headers` file

## Setup Instructions

### 1. Install Dependencies

```bash
cd api
npm install
```

### 2. Configure Environment Variables

Create a `.dev.vars` file in the root for local development:

```bash
# R2 Storage Configuration
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key

# Notion Configuration
NOTION_TOKEN=your_notion_token

# Semantic Scholar API
SEMANTIC_SCHOLAR_API_KEY=your_api_key
```

For production, set environment variables in Cloudflare Dashboard:
```bash
# Using Wrangler CLI
wrangler pages secret put R2_ACCOUNT_ID
wrangler pages secret put R2_ACCESS_KEY_ID
wrangler pages secret put R2_SECRET_ACCESS_KEY
wrangler pages secret put NOTION_TOKEN
wrangler pages secret put SEMANTIC_SCHOLAR_API_KEY
```

### 3. Local Development

```bash
npm run dev
```

This starts a local development server using Wrangler. Your functions will be available at:
- `http://localhost:8788/blob/upload`
- `http://localhost:8788/clone`
- `http://localhost:8788/notion/blocks/[id]`
- etc.

### 4. Deploy to Cloudflare

```bash
npm run deploy
```

Or use Wrangler directly:
```bash
wrangler pages deploy .
```

## API Endpoints

### Blob/R2 Storage

- **POST** `/blob/upload?path={path}&bucket={bucket}&type={type}` - Upload file to R2
- **GET** `/blob/fetch?path={path}&bucket={bucket}` - Fetch file from R2
- **GET** `/blob/list?bucket={bucket}&type={type}&prefix={prefix}` - List files in bucket
- **DELETE** `/blob/delete?path={path}&bucket={bucket}` - Delete file from R2

### Clone

- **GET** `/clone?url={url}` - Clone and proxy a web page

### Notion

- **GET** `/notion/blocks/{id}` - Get block children
- **POST** `/notion/blocks/{id}` - Update block content
- **GET** `/notion/databases/{name}` - Get database schema
- **POST** `/notion/databases/{name}?action=get` - Query database
- **POST** `/notion/databases/{name}?action=add` - Add to database
- **GET** `/notion/pages/{id}` - Get page properties
- **PATCH** `/notion/pages/{id}` - Update page properties

### Proxy

- **GET** `/proxy/{host}/{...path}` - Proxy external resources
- **GET** `/proxy/{protocol}/{host}/{...path}` - Proxy with explicit protocol

### Semantic Scholar

- **GET** `/semantic-scholar/completion?q={query}` - Search papers
- **GET** `/semantic-scholar/paper?id={id}` - Get paper details

## CORS Configuration

If you need to configure CORS headers globally, create a `_headers` file in the root:

```
/*
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH
  Access-Control-Allow-Headers: Content-Type
```

## Migration Checklist

- [x] Blob/R2 storage endpoints migrated
- [x] Clone endpoint migrated
- [x] Notion API endpoints migrated
- [x] Proxy endpoint migrated
- [x] Semantic Scholar endpoints migrated
- [x] Shared utilities created
- [x] Environment variables documented
- [ ] Update cookies.json with actual cookie data
- [ ] Test all endpoints locally
- [ ] Configure environment variables in Cloudflare
- [ ] Deploy to Cloudflare Pages
- [ ] Update frontend to use new API URLs

## Notes

1. **TypeScript Errors**: The lint errors shown during creation are expected since dependencies haven't been installed yet. Run `npm install` to resolve them.

2. **Cookies**: Update `utils/cookies.json` with actual cookie data for sites you need to scrape.

3. **Database IDs**: Update `utils/notion-databases.ts` with your actual Notion database IDs.

4. **Testing**: Test each endpoint thoroughly after deployment to ensure all functionality works as expected.

5. **Performance**: Cloudflare Functions have a 50ms CPU time limit on the free plan. If you encounter timeouts, consider upgrading or optimizing heavy operations.

## Troubleshooting

### Functions not working
- Check that environment variables are set correctly
- Verify the function file names match the route structure
- Check Cloudflare dashboard for function logs

### CORS errors
- Add CORS headers to responses or create a `_headers` file
- Ensure preflight OPTIONS requests are handled

### TypeScript errors
- Run `npm install` to install dependencies
- Check that all imports are correct
- Verify `wrangler.toml` configuration

## Additional Resources

- [Cloudflare Pages Functions Documentation](https://developers.cloudflare.com/pages/functions/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
