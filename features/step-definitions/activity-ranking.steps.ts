import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { openMeteoStub, type WeatherProfile } from "../../src/stubs/openMeteoStub";
import type { ActivityName, ActivityResult, ApiError, ApiWorld, ForecastDay, LocationMatch } from "../../src/support/world";

const SUPPORTED_ACTIVITIES: ActivityName[] = ["Skiing", "Surfing", "Outdoor Sightseeing", "Indoor Sightseeing"];
const ABSENT = "<absent>";

// ---------------------------------------------------------------- helpers

function objectBody(world: ApiWorld): Record<string, any> {
  const body = world.responseBody;
  assert.ok(
    body !== null && typeof body === "object" && !Array.isArray(body),
    `Expected a JSON object response, received: ${JSON.stringify(body)}`
  );
  return body as Record<string, any>;
}

function days(world: ApiWorld): ForecastDay[] {
  const body = objectBody(world);
  assert.ok(Array.isArray(body.days), 'Expected response property "days" to be an array');
  return body.days as ForecastDay[];
}

function results(world: ApiWorld): ActivityResult[] {
  return days(world).flatMap((day) => {
    assert.ok(Array.isArray(day.activities), `Expected activities array for ${day.date}`);
    return day.activities;
  });
}

function find(day: ForecastDay, activity: string): ActivityResult {
  const result = day.activities.find((a) => a.activity === activity);
  assert.ok(result, `${day.date}: no result for activity "${activity}"`);
  return result;
}

function matches(world: ApiWorld): LocationMatch[] {
  const body = objectBody(world);
  assert.ok(Array.isArray(body.matches), 'Expected "matches" to be an array');
  return body.matches as LocationMatch[];
}

function errorText(world: ApiWorld): string {
  const body = objectBody(world) as ApiError;
  return `${body.error ?? ""} ${body.message ?? ""}`.trim().toLowerCase();
}

function params(key: string, value: string): Record<string, string> | undefined {
  return value === ABSENT ? undefined : { [key]: value };
}

// ---------------------------------------------------------------- Given

function givenWeather(profile: WeatherProfile) {
  return function (this: ApiWorld, city: string) {
    openMeteoStub.setWeather(city, profile);
    this.city = city;
  };
}

Given("Open-Meteo reports a snowy week for {string}", givenWeather("snowy"));
Given("Open-Meteo reports a sunny week for {string}", givenWeather("sunny"));
Given("Open-Meteo reports a rainy week for {string}", givenWeather("rainy"));
Given("Open-Meteo reports a surf week for {string}", givenWeather("surf"));

Given("the Open-Meteo forecast service is failing", () => {
  openMeteoStub.forecastMode = "error";
});

Given("the Open-Meteo geocoding service is failing", () => {
  openMeteoStub.geocodingMode = "error";
});

// ---------------------------------------------------------------- When

When("I search for locations matching {string}", async function (this: ApiWorld, query: string) {
  await this.get("/api/locations", { query });
});

When("I search for locations with query {string}", async function (this: ApiWorld, query: string) {
  await this.get("/api/locations", params("query", query));
});

When("I request activity rankings for {string}", async function (this: ApiWorld, location: string) {
  await this.get("/api/activity-rankings", { location });
});

When("I request activity rankings with location {string}", async function (this: ApiWorld, location: string) {
  await this.get("/api/activity-rankings", params("location", location));
});

// ---------------------------------------------------------------- Then: generic

Then("the response status should be {int}", function (this: ApiWorld, expected: number) {
  assert.ok(this.response, "No API response was captured");
  assert.equal(
    this.response.status(),
    expected,
    `Expected HTTP ${expected}; received ${this.response.status()}. Body: ${JSON.stringify(this.responseBody)}`
  );
});

Then("the error response should explain that location is required", function (this: ApiWorld) {
  assert.match(errorText(this), /location.*required|required.*location/);
});

Then("the error response should explain that query is required", function (this: ApiWorld) {
  assert.match(errorText(this), /query.*required|required.*query/);
});

Then("the error response should explain that no location matched", function (this: ApiWorld) {
  assert.match(errorText(this), /no location|not found|no match|unknown location/);
});

Then("the error response should explain that forecast data is temporarily unavailable", function (this: ApiWorld) {
  assert.match(errorText(this), /forecast.*unavailable|temporarily unavailable|weather provider/);
});

// ---------------------------------------------------------------- Then: location search

Then("the location matches should be exactly {string}", function (this: ApiWorld, expected: string) {
  const names = matches(this).map((m) => m.name).sort();
  const want = expected === "" ? [] : expected.split(",").map((n) => n.trim()).sort();
  assert.deepEqual(names, want);
});

Then("every location match should include a name, country and coordinates", function (this: ApiWorld) {
  const list = matches(this);
  assert.ok(list.length > 0, "Expected at least one match");
  for (const match of list) {
    assert.ok(typeof match.name === "string" && match.name.trim(), "Location name must be non-empty");
    assert.ok(typeof match.country === "string" && match.country.trim(), `${match.name}: country must be non-empty`);
    assert.ok(Number.isFinite(match.latitude) && Math.abs(match.latitude) <= 90, `${match.name}: invalid latitude`);
    assert.ok(Number.isFinite(match.longitude) && Math.abs(match.longitude) <= 180, `${match.name}: invalid longitude`);
  }
});

// ---------------------------------------------------------------- Then: ranking contract

Then("the ranked location should be {string}", function (this: ApiWorld, name: string) {
  const location = objectBody(this).location;
  assert.equal(location?.name, name);
  assert.ok(Number.isFinite(location.latitude) && Number.isFinite(location.longitude), "Location needs coordinates");
});

Then("the forecast should cover the seven dates served by Open-Meteo", function (this: ApiWorld) {
  assert.deepEqual(days(this).map((d) => d.date), openMeteoStub.expectedDates());
});

Then("every forecast day should include all supported activities", function (this: ApiWorld) {
  for (const day of days(this)) {
    assert.deepEqual(
      day.activities.map((a) => a.activity).sort(),
      [...SUPPORTED_ACTIVITIES].sort(),
      `${day.date} must contain each supported activity exactly once`
    );
  }
});

Then("every activity result should include a date, rank, suitability and reasoning", function (this: ApiWorld) {
  for (const day of days(this)) {
    for (const r of day.activities) {
      assert.equal(r.date, day.date, "Activity date must match its containing forecast day");
      assert.ok(Number.isInteger(r.rank), `${r.activity} on ${day.date}: rank must be an integer`);
      assert.ok(Number.isFinite(r.suitability), `${r.activity} on ${day.date}: suitability must be numeric`);
      assert.ok(typeof r.reasoning === "string" && r.reasoning.trim(), `${r.activity} on ${day.date}: reasoning required`);
    }
  }
});

Then("every suitability score should be between 0 and 100 inclusive", function (this: ApiWorld) {
  for (const r of results(this)) {
    assert.ok(
      typeof r.suitability === "number" && r.suitability >= 0 && r.suitability <= 100,
      `${r.activity} on ${r.date} has out-of-range score ${r.suitability}`
    );
  }
});

Then("activities for each day should be ordered by descending suitability", function (this: ApiWorld) {
  for (const day of days(this)) {
    for (let i = 1; i < day.activities.length; i += 1) {
      assert.ok(
        day.activities[i - 1].suitability >= day.activities[i].suitability,
        `${day.date}: ${day.activities[i - 1].activity} must not rank below ${day.activities[i].activity}`
      );
    }
  }
});

Then("ranks for each day should run from 1 to 4 in order", function (this: ApiWorld) {
  for (const day of days(this)) {
    assert.deepEqual(day.activities.map((a) => a.rank), [1, 2, 3, 4], `${day.date}: ranks`);
  }
});

// ---------------------------------------------------------------- Then: weather behaviour

Then("on every day {string} should rank first", function (this: ApiWorld, activity: string) {
  for (const day of days(this)) {
    assert.equal(day.activities[0]?.activity, activity, `${day.date}: expected ${activity} first`);
    assert.equal(find(day, activity).rank, 1, `${day.date}: ${activity} rank`);
  }
});

Then("on every day {string} should score higher than {string}", function (this: ApiWorld, better: string, worse: string) {
  for (const day of days(this)) {
    const a = find(day, better).suitability;
    const b = find(day, worse).suitability;
    assert.ok(a > b, `${day.date}: ${better} (${a}) should score higher than ${worse} (${b})`);
  }
});

Then("the reasoning for {string} on every day should mention {string}", function (this: ApiWorld, activity: string, text: string) {
  for (const day of days(this)) {
    const reasoning = find(day, activity).reasoning;
    assert.ok(reasoning.toLowerCase().includes(text.toLowerCase()), `${day.date}: "${reasoning}" should mention "${text}"`);
  }
});

// ---------------------------------------------------------------- Then: Open-Meteo interaction

Then("Open-Meteo should have been asked to geocode {string}", function (name: string) {
  const calls = openMeteoStub.requestsTo("/v1/search");
  assert.ok(
    calls.some((c) => (c.query.name ?? "").trim().toLowerCase() === name.toLowerCase()),
    `No geocoding request for "${name}". Saw: ${JSON.stringify(calls)}`
  );
});

Then("Open-Meteo should have been asked for a seven-day forecast at the coordinates of {string}", function (name: string) {
  const city = openMeteoStub.findCity(name);
  assert.ok(city, `Stub has no city ${name}`);
  const call = openMeteoStub
    .requestsTo("/v1/forecast")
    .find((c) => Math.abs(Number(c.query.latitude) - city.latitude) < 0.05 && Math.abs(Number(c.query.longitude) - city.longitude) < 0.05);
  assert.ok(call, `No forecast request near ${city.latitude},${city.longitude}`);
  const { forecast_days, start_date, end_date } = call.query;
  const spanned =
    start_date && end_date ? (Date.parse(end_date) - Date.parse(start_date)) / 86_400_000 + 1 : undefined;
  assert.ok(
    Number(forecast_days) === 7 || spanned === 7,
    `Forecast request must cover 7 days (forecast_days=${forecast_days}, start=${start_date}, end=${end_date})`
  );
});

Then("Open-Meteo should not have been called", function () {
  assert.equal(openMeteoStub.requests.length, 0, `Unexpected Open-Meteo calls: ${JSON.stringify(openMeteoStub.requests)}`);
});

Then("Open-Meteo should not have been asked for a forecast", function () {
  assert.equal(openMeteoStub.requestsTo("/v1/forecast").length, 0, "Forecast must not be requested for an unknown location");
});
