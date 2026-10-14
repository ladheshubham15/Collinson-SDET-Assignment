# Activity Ranking API — Playwright + Cucumber + TypeScript

## Overview

This is a runnable **API automation framework** using Playwright's API request client, Cucumber BDD, Gherkin, and TypeScript. It implements the assignment's specification-first tests for the Activity Ranking API.

The API implementation is not included in the assignment, so the tests will not pass until a compatible service is running. If nothing is listening at the configured URL, the suite will report a connection error; this is expected for a test-first contract suite.

To show the steps and assertions are sound, a second, **separate `@mock` suite** runs the same step definitions against an in-process mock API and a stubbed Open-Meteo, and passes (`npm run test:mock`). See [Two suites](#two-suites-spec-red-and-mock-green).

## Prerequisites

- Node.js 20+
- An Activity Ranking API implementation (none exists yet, so the suite is expected to be **red**)

## Setup and run

```bash
npm install
npm run typecheck
npm test                 # all scenarios
npm run test:mock        # green mock suite
npm run test:location    # also: test:contract, test:weather, test:html (spec suite)
npx cucumber-js --tags "@ranking and @dependency"
```

Start the API under test with Open-Meteo redirected to the stub the tests host, then run the suite:

```bash
# terminal 1 – the API under test (your implementation)
OPEN_METEO_BASE_URL=http://127.0.0.1:4010 npm start

# terminal 2
ACTIVITY_RANKING_API_URL=http://127.0.0.1:3000 npm test
```

Configuration (environment variables; see `.env.example`): `ACTIVITY_RANKING_API_URL` (default `http://127.0.0.1:3000`), `API_REQUEST_TIMEOUT_MS` (10000), `OPEN_METEO_STUB_PORT` (4010). The HTML report is written to `reports/cucumber-report.html`.

**Red state:** with nothing listening, every scenario fails at its first HTTP request with a connection error. Against a non-conforming API, failures name the violated expectation (status, field, ordering, reasoning text, or Open-Meteo interaction).

## Two suites: spec (red) and mock (green)

| Command | Feature files | Runs against | Expected |
|---|---|---|---|
| `npm test` | `features/*.feature` (21 scenarios) | the real API at `ACTIVITY_RANKING_API_URL` | **Red** until an implementation exists |
| `npm run test:mock` | `features/mock/*.feature` (10 scenarios, tagged `@mock`) | in-process mock API + Open-Meteo stub | **Green** |

The mock suite reuses the same step definitions, so it proves the assertions are satisfiable by a conforming API. The mock API (`src/mock/mockActivityRankingApi.ts`) is intentionally simple, is not the system under test, and its scoring is illustrative only. It is started by a `@mock`-tagged Cucumber hook and needs no setup.

## Structure

```text
features/activity-ranking.feature              Gherkin scenarios (21 incl. outline rows)
features/mock/activity-ranking.mock.feature    Scenarios run against the in-process mock API (green)
features/step-definitions/*.steps.ts           HTTP actions and assertions (shared by both suites)
src/mock/mockActivityRankingApi.ts             Minimal mock Activity Ranking API for the @mock suite
src/support/world.ts                           Cucumber World: Playwright APIRequestContext + response state
src/support/hooks.ts                           Starts/stops the stub, resets state per scenario
src/stubs/openMeteoStub.ts                     Local Open-Meteo stand-in (geocoding, forecast, marine)
```

## API contract under test

### `GET /api/locations?query=<partial name>` (autocomplete)

- `200 {"matches":[{"name","country","region?","latitude","longitude"}]}`; matching is a case-insensitive prefix on the trimmed query; no candidates gives `{"matches":[]}`.
- `400 {"error":"query is required"}` when absent, empty or whitespace.

### `GET /api/activity-rankings?location=<city or town>`

```json
{
  "location": { "name": "Lisbon", "country": "Portugal", "latitude": 38.71667, "longitude": -9.13333 },
  "days": [
    {
      "date": "2026-10-14",
      "activities": [
        { "date": "2026-10-14", "activity": "Outdoor Sightseeing", "rank": 1, "suitability": 82, "reasoning": "Clear skies and 22°C" }
      ]
    }
  ]
}
```

- Seven consecutive `days` matching the dates Open-Meteo returns; each day lists all four activities (`Skiing`, `Surfing`, `Outdoor Sightseeing`, `Indoor Sightseeing`) exactly once, sorted by `suitability` descending, `rank` 1–4.
- `suitability` is a number 0–100 (higher is better). `reasoning` is a non-empty human-readable string.
- The name is trimmed and matched case-insensitively to a geocoding result; the first exact-name match is used. Disambiguation of same-named places is done by the client through `/api/locations`.
- `400` missing/blank `location` (Open-Meteo not called), `404` no location matched (forecast not requested), `502` Open-Meteo geocoding or forecast failure. Error bodies are `{"error": "..."}` (or `message`).

## Open-Meteo strategy

The tests never call the real Open-Meteo. `src/stubs/openMeteoStub.ts` runs in-process for the whole run and mimics three services on one host: `/v1/search` (geocoding, omits `results` when nothing matches, as the real one does), `/v1/forecast` (daily `weather_code`, `temperature_2m_*`, `precipitation_sum`, `snowfall_sum`, `wind_speed_10m_max`) and `/v1/marine` (daily `wave_height_max`, for surfing). The API under test must read a configurable base URL (`OPEN_METEO_BASE_URL`) for all three.

Why: weather-to-activity scenarios ("snow favours skiing", "rain favours indoor") need controlled inputs; real forecasts change daily and would make them flaky. It also allows failure injection (500s) with no test-only header in the product, and lets scenarios assert *how* the API uses Open-Meteo (geocodes the name, requests 7 days at the resolved coordinates, skips the forecast for unknown places).

Provider adapter unit tests (malformed payloads, missing variables, timeouts) belong in the implementation repo; a live-Open-Meteo smoke test is a sensible separate, non-blocking job.

## Coverage

Partial/case/whitespace location search and empty results; blank/missing inputs (both endpoints); unknown city; seven dates from the provider; four unique activities per day; score range; ordering and rank; case-insensitive city names; weather behaviour for snow, clear/mild, rain/wind and surf conditions (relative ordering plus reasoning keywords); Open-Meteo call verification; geocoding and forecast outages.

## Assumptions and trade-offs

1. The scoring formula is unspecified, so weather scenarios assert **relative** outcomes and keywords in the reasoning (e.g. "snow", "clear", "22"), never exact scores. The "22" check pins the ticket's `Clear skies and 22°C` example; reasoning wording beyond those keywords is free.
2. Stub weather is identical on all seven days, which keeps assertions simple but does not test day-to-day variation; mixed-week fixtures would be the next step.
3. Dates are generated from the current UTC date. A run crossing midnight UTC can flake; timezone policy (location-local vs UTC) is left to the product team.
4. Timeouts/slow-provider behaviour, rate limiting, auth, caching, latency and load are omitted (not in the ticket).
5. Equal scores are allowed; tie-breaking is not asserted.
6. The mock API exists only to demonstrate passing assertions. Its scoring is illustrative; it is not a reference implementation and must not be treated as the specification of scoring.
7. The endpoint split (`/api/locations` + `/api/activity-rankings`), field names and status codes are my proposal and should be agreed with the API owner.

## Troubleshooting

- **Connection refused / every scenario fails at the request:** the API is not running at `ACTIVITY_RANKING_API_URL`.
- **`EADDRINUSE` on 4010:** set `OPEN_METEO_STUB_PORT` and point the API's `OPEN_METEO_BASE_URL` to the same port.
- **Status 502 where 200 expected:** the API is not using the stub (check `OPEN_METEO_BASE_URL`, which must be reachable and set before the API starts).

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
