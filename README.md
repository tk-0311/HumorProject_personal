# HumorProject Personal

All AI generation runs through `prompt_chain`’s signed server API. The community app loads the canonical assigned chain, forwards the verified user session and photo, and retains its existing quota, draft and publication flow. Direct provider API calls have been removed. Set the shared `AI_MODEL_ENCRYPTION_KEY`; `PROMPT_CHAIN_URL` defaults to the production Prompt Studio origin. See [the shared chain/API contract](docs/centralized-prompt-chains.md).


The app now lives directly in this repository root (`HumorProject_personal/` locally). Run npm, Next.js, TypeScript, and Supabase commands here. The old nested `hello-world/` directory is no longer the application root.

For Vercel, set **Settings → Build and Deployment → Root Directory** to the repository root (`.` or the empty default). Keep the existing production environment variables and OAuth URLs; a local folder rename does not change the hosted domain.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
