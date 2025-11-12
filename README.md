# Large File Upload with Cloudflare Workers and R2

A modern file upload application built with Cloudflare Workers, R2 storage, React, and TypeScript. This project demonstrates how to handle large file uploads efficiently using Cloudflare's infrastructure.

## Features

- Large file upload support
- React-based frontend with TypeScript
- Cloudflare R2 storage integration
- Type-safe development environment
- Modern build tooling with Vite

## Prerequisites

- Node.js (v18 or later)
- npm or yarn
- Cloudflare account with Workers and R2 enabled
- Wrangler CLI (Cloudflare Workers CLI)

## Setup

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd store-large-file
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Cloudflare R2:
   - Create an R2 bucket named 'large-files' in your Cloudflare account
   - Ensure your account has the necessary permissions

4. Configure Wrangler:
   - Login to your Cloudflare account:
     ```bash
     npx wrangler login
     ```
     
## Deployment

1. Build the frontend:
   ```bash
   npm run build
   ```

2. Deploy to Cloudflare Workers:
   ```bash
   npx wrangler deploy
   ```

## Project Structure

```
├── src/
│   ├── components/     # React components
│   ├── index.ts        # Worker entry point
│   ├── App.tsx         # Main React component
│   └── main.tsx        # Frontend entry point
├── dist/              # Built frontend assets
├── package.json       # Project dependencies
└── wrangler.jsonc     # Cloudflare Workers configuration
```

## Environment Variables

The following environment variables need to be set in your Cloudflare dashboard or via `wrangler.jsonc`:

- No environment variables required as R2 bucket is configured via `wrangler.jsonc`

npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put R2_ACCOUNT_ID