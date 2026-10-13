# Activity Ranking API — Playwright + Cucumber + TypeScript

## Overview

This is a runnable **API automation framework** using Playwright's API request client, Cucumber BDD, Gherkin, and TypeScript. It implements the assignment's specification-first tests for the Activity Ranking API.

The API implementation is not included in the assignment, so the tests will not pass until a compatible service is running. If nothing is listening at the configured URL, the suite will report a connection error; this is expected for a test-first contract suite.

## Prerequisites

- Node.js 20+
- npm 10+ recommended
- The Activity Ranking API service, when available

## Setup

```bash
npm install
npm run typecheck
```

No browser installation is needed for these API tests. Playwright's `APIRequestContext` sends HTTP requests directly, so Chromium/WebKit/Firefox are not required.

Copy `.env.example` to `.env` if you want a local reminder of the configuration. This project does not load `.env` automatically; environment variables are read directly by Node. Set them in your terminal as shown below.

## Execute tests

### Windows PowerShell

```powershell
$env:ACTIVITY_RANKING_API_URL = "http://127.0.0.1:3000"
npm test
```

### macOS / Linux

```bash
export ACTIVITY_RANKING_API_URL=http://127.0.0.1:3000
npm test
```

The API URL defaults to `http://127.0.0.1:3000`, and the request timeout defaults to 10 seconds.

### Run a subset

```bash
npm run test:location
npm run test:contract
```

Or use Cucumber tags directly:

```bash
npx cucumber-js --tags @ranking
npx cucumber-js --tags @validation
npx cucumber-js --tags @dependency
```

### Generate an HTML report

```bash
npm run test:html
```

The output path is `reports/cucumber-report.html`. If the directory does not exist, create it before running:

**PowerShell**
```powershell
New-Item -ItemType Directory -Force reports
npm run test:html
```

**macOS / Linux**
```bash
mkdir -p reports
npm run test:html
```

## Framework structure

```text
activity-ranking-playwright-cucumber/
├── features/
│   ├── activity-ranking.feature
│   └── step-definitions/
│       └── activity-ranking.steps.ts
├── src/
│   └── support/
│       ├── hooks.ts
│       └── world.ts
├── .env.example
├── .gitignore
├── cucumber.js
├── package.json
├── tsconfig.json
└── README.md
```

- `features/activity-ranking.feature`: readable acceptance criteria in Gherkin.
- `features/step-definitions/activity-ranking.steps.ts`: scenario steps, HTTP actions, and assertions.
- `src/support/hooks.ts`: creates and disposes Playwright's API request context per scenario.
- `src/support/world.ts`: TypeScript contracts and scenario state.
- `cucumber.js`: TypeScript registration, feature discovery, and reporter setup.
- `package.json`: dependency and execution scripts.

## Proposed API contract

The ticket does not specify the endpoint, response envelope, score scale, or exact status codes. The framework makes the following explicit assumptions so that the tests can be implemented.

### Request

```http
GET /api/activity-rankings?location=Lisbon
Accept: application/json
```

### Forecast response

```json
{
  "location": {
    "name": "Lisbon",
    "latitude": 38.7223,
    "longitude": -9.1393
  },
  "days": [
    {
      "date": "2026-10-14",
      "activities": [
        {
          "date": "2026-10-14",
          "activity": "Outdoor Sightseeing",
          "suitability": 91,
          "reasoning": "Clear skies and a mild temperature are favourable for walking outdoors."
        }
      ]
    }
  ]
}
```

The real response should contain seven consecutive dates and four activities for every date: `Skiing`, `Surfing`, `Outdoor Sightseeing`, and `Indoor Sightseeing`. Activities within each day are ordered by descending suitability.

### Partial match response

```json
{
  "matches": [
    {
      "name": "San Francisco",
      "latitude": 37.7749,
      "longitude": -122.4194
    }
  ]
}
```

### Error contract

- `400`: missing or whitespace-only location.
- `404`: no matching city or town.
- `502`: Open-Meteo/provider failure.
- Error body is a JSON object with an `error` or `message` field.

These are proposed test assumptions, not claims about an existing implementation. Confirm them with the API owner before changing production code.

## Open-Meteo strategy

The tests call the Activity Ranking API, not Open-Meteo directly. This keeps acceptance tests focused on the product contract and prevents live weather changes from making assertions flaky.

The provider-failure scenario uses a test-only header, `x-test-weather-provider: unavailable`, as a proposed fault-injection seam. The API under test must support it in a test environment for that scenario to pass. If that is not acceptable, inject a stub weather provider at the service level instead. Do not expose fault injection in production.

Provider adapter unit tests should separately cover geocoding and forecast errors, missing weather variables, timeouts, and malformed provider responses.

## Coverage

- Exact city and partial city lookup
- Missing and blank location input
- Unknown city handling
- Seven consecutive forecast dates
- Four unique activities for every date
- Score type and 0–100 range
- Descending ranking order
- Activity date consistency and non-empty reasoning
- Candidate location name and coordinate validation
- Upstream provider failure response

## Assumptions and trade-offs

1. The scoring formula is not defined by the ticket. These tests validate score bounds and ordering, not whether a specific weather forecast deserves a particular score.
2. Surfing suitability may require marine/wave forecast data, not just standard weather variables. The API must document its source and fallback behaviour.
3. The contract does not define timezone policy. It requires consecutive ISO dates; the product team should decide whether the first date follows the location's local calendar or UTC.
4. Tie-breaking is not asserted; equal suitability scores are allowed.
5. Authentication, rate limiting, caching, latency objectives, and load testing are omitted because they are not described in the ticket.
6. The test-only provider failure header is a proposed seam and needs implementation or replacement with an injected stub.

## Troubleshooting

- **Connection refused:** start the API or point `ACTIVITY_RANKING_API_URL` at a running test instance.
- **All assertions fail on response shape:** compare the implementation with the proposed contract above; update the contract only after confirming the intended API behaviour.
- **TypeScript compilation fails:** use Node 20+ and run `npm install` before `npm run typecheck`.
- **HTML report cannot be written:** create the `reports` directory, then rerun `npm run test:html`.

## Publish to a public GitHub repository

Create an empty public repository, then run:

```bash
git init
git add .
git commit -m "Add Playwright Cucumber API contract tests"
git branch -M main
git remote add origin https://github.com/<your-account>/activity-ranking-playwright-cucumber.git
git push -u origin main
```

Do not commit credentials, private URLs, or `node_modules`.
