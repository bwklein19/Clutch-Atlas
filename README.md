# Clutch Atlas

A single Next.js application with a resumable command-line collector. The collector uses Clutch's official MCP server to save public Advertising providers to MongoDB; the Vercel application reads and presents that data as a searchable directory.

Stored MCP detail fields include generated company description, official logo, primary and office locations, rating and review metrics, minimum project size, hourly rate, pricing insight, services, specialty focus areas, verification level/status, and Clutch guarantee status. Fields remain `null` or empty when Clutch does not publish them for that provider.

## Architecture

```text
This server: npm run scrape ──► MongoDB ◄── Next.js on Vercel
                         │
                         └──── Clutch official MCP
```

The collector is never executed by Vercel. It reads 500-record batches until Clutch returns the final partial batch. It checkpoints after every batch, deduplicates by Clutch profile URL, and safely resumes after interruption.

Important: a MongoDB instance bound only to `127.0.0.1` on this server is not reachable from Vercel. Use MongoDB Atlas or expose this server's MongoDB through a properly authenticated, TLS-protected, tightly firewalled endpoint. `MONGODB_URI` on Vercel and `SCRAPE_MONGODB_URI` locally must identify the same database.

## Setup

Requirements: Node.js 22+ and an existing MongoDB database.

```bash
npm install
cp .env.example .env.local
```

Configure authenticated MongoDB connections:

```dotenv
SCRAPE_MONGODB_URI=mongodb://USER:PASSWORD@127.0.0.1:27017/clutch_atlas?authSource=admin
MONGODB_URI=mongodb://USER:PASSWORD@127.0.0.1:27017/clutch_atlas?authSource=admin
```

If the user was created inside `clutch_atlas`, use `authSource=clutch_atlas`. `Command update requires authentication` means the URI does not contain valid credentials for its selected authentication database.

## Collect every Advertising provider

```bash
npm run scrape
```

There is no default company or batch limit. The command first refreshes official provider metadata, then resolves each missing company website through `https://r.clutch.co/redirect?pid=PROVIDER_ID`. Each result is committed immediately. Press `Ctrl+C` once and run the same command to resume.

```bash
npm run scrape:profiles -- --reset # refresh all metadata; retain records/domains
npm run scrape:profiles -- --clear # delete agency records and start fresh (destructive)
npm run scrape:once         # collect one 500-record diagnostic batch
npm run enrich:domains      # resume only missing domain redirects
npm run enrich:domains -- --refresh # recheck every provider website
```

The collector calls Clutch's official unauthenticated MCP endpoint at `https://bot.clutch.co/mcp`, documented for custom agents and structured provider JSON. It does not use Cloudflare-protected HTML/facets pages, Chromium, CAPTCHAs, or VPN/IP rotation. Requests are sequential, delayed, retried, and resumable.

The Advertising feed contained 28,868 providers at the latest completed run. Completion is determined by the final partial MCP batch, not by a hardcoded target.

### Domains

The official MCP provider schema does not include websites, but Clutch's public redirect service resolves a stored provider ID to its Visit Website destination. The domain stage requests that redirect without following the external website, validates its HTTP(S) `Location`, stores the URL/domain, and records unavailable or retryable results. It never guesses domains from company names.

## Run and deploy the web app

```bash
npm run dev
```

Open <http://localhost:3000>. To deploy, import the repository in Vercel and configure `MONGODB_URI` as a server-only environment variable. The web app is read-only and exposes no write endpoint.

## Verification commands

```bash
npm run lint
npm test
npm run build
```

Before collecting or republishing data, confirm that your use complies with Clutch's terms and applicable privacy and marketing laws. The project stores company-level public directory data only.
