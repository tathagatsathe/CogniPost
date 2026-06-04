# CogniPost

Automated daily AI fact tweets on X (Twitter). Discovers configurable trending topics, generates unique facts, optimizes for reach, and posts once per day.

## Features

- **Configurable topics**: trending (X + Google), manual, or hybrid with keyword filters
- **Reach optimization**: hard gates (length, URLs, dedup, blocklist) + soft scoring + LLM judge
- **Dual scheduling**: GitHub Actions cron or local macOS/Linux crontab
- **Dry-run mode**: test the pipeline without posting

## Prerequisites

1. [X Developer account](https://developer.x.com/) with Read + Write permissions
2. API credits (pay-per-use: ~$0.015/post without URLs)
3. OpenAI or Anthropic API key (set `LLM_PROVIDER=anthropic` or `openai` in `.env`)

## Quick start

```bash
npm install
cp .env.example .env
# Edit .env with your keys (LLM_PROVIDER=anthropic to use Claude)

npm run build
npm run auth:x          # One-time X OAuth (opens browser)
npm run dry-run         # Test pipeline without posting
npm run post            # Live post
```

## Configuration

Edit [`config/default.yaml`](config/default.yaml) or create gitignored [`config/local.yaml`](config/local.yaml):

```yaml
topic:
  mode: trending          # trending | manual | hybrid
  manualTopic: "artificial intelligence"
  sources: [x, google]
  xSearch:
    query: "(AI OR tech OR science OR news)"  # v2 search (lang:/min_faves: not supported)
    maxResults: 100
    minLikes: 50                     # client-side (replaces min_faves:50 on the website)
    langFilter: true                 # client-side English filter (replaces lang:en)
  woeid: 23424977         # legacy, unused by v2 search
  filter:
    includeKeywords: ["AI", "science"]
    excludeKeywords: ["politics", "celebrity"]
schedule:
  timezone: America/New_York
  preferredHourLocal: 9   # Warns if run outside ±1 hour
content:
  drafts: 5
posting:
  allowUrls: false        # Avoid $0.20/url post cost
```

## Scheduling

### GitHub Actions

1. Push repo to GitHub
2. Add secrets: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_ACCESS_TOKEN`, `X_REFRESH_TOKEN`, `OPENAI_API_KEY`
3. Adjust cron in [`.github/workflows/daily-post.yml`](.github/workflows/daily-post.yml)

**UTC mapping** (for `preferredHourLocal: 9` in `America/New_York`):

| Timezone | Local 9 AM | UTC cron |
|----------|------------|----------|
| EST (winter) | 9:00 | `0 14 * * *` |
| EDT (summer) | 9:00 | `0 13 * * *` |

### Local cron

```bash
chmod +x scripts/install-cron.sh
./scripts/install-cron.sh
# Copy printed line into: crontab -e
```

## CLI

| Command | Description |
|---------|-------------|
| `npm run post` | Full pipeline |
| `npm run dry-run` | Same, no X post |
| `npm run test:x-search` | Test X v2 search trend discovery only |
| `npm run auth:x` | OAuth 2.0 PKCE for X |
| `npm run post -- --force` | Non-deterministic topic pick |

## Pipeline

1. Discover trending topic (filtered)
2. LLM generates N fact drafts
3. Hard rules + plausibility check
4. Soft scoring + LLM judge on top 3
5. Post to X + save local history

Dedup uses your recent X timeline + `data/post-history.json`.

## Costs

| Item | Approximate cost |
|------|------------------|
| X post (no URL) | $0.015 |
| X post (with URL) | $0.20 |
| OpenAI gpt-4o-mini | ~$0.01/run |

## License

MIT
