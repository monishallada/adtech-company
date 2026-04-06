# SignalStack

SignalStack is a lead-generation operating system for local service businesses such as detailing, lawn care, and exterior cleaning. This repo ships a runnable MVP with:

- A public capture funnel for ad traffic and organic demand
- Lead scoring and buyer routing
- Outreach task sequencing
- A dashboard for pipeline, campaigns, and buyer capacity
- CSV export for sold or routed leads

## Why this architecture

This build is designed to start quickly without dependency installs or API keys. It avoids fragile scraping and instead focuses on the durable model:

- Acquire demand through paid traffic, owned landing pages, referrals, and approved webhooks
- Qualify and score leads in real time
- Route each lead to the best buyer based on geography, quality threshold, and capacity
- Track outreach so your team can follow up fast and measure conversion

## Run it

```bash
npm start
```

Open:

- `http://127.0.0.1:3000/` for the operator dashboard
- `http://127.0.0.1:3000/capture` for the public lead funnel

## Test it

```bash
npm test
```

## Core endpoints

- `GET /api/bootstrap` returns the dashboard dataset
- `POST /api/intake` captures a new lead
- `POST /api/outreach/dispatch` dispatches the next outreach batch
- `POST /api/leads/:id/status` updates a lead stage
- `POST /api/leads/:id/notes` appends an operator note
- `GET /api/export/leads.csv` exports leads as CSV

## Practical launch path

1. Drive ad traffic to `/capture` or clone it into multiple city and service-specific funnels.
2. Feed approved sources such as Meta Lead Ads, Google Ads landing pages, partner forms, or CRM exports into `/api/intake`.
3. Expand the buyer network and price per lead rules in `data/seed.json`.
4. Replace queued outreach with actual integrations such as Twilio, SendGrid, or your CRM once credentials are ready.

## Compliance boundary

This MVP is built for consent-based acquisition and approved imports. It is intentionally not a scraper for Facebook or other sites, and it does not automate spam. That boundary matters if you want a lead business that survives platform policy, legal review, and customer churn.
