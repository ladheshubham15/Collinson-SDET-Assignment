import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { getApiContext } from "../../src/support/hooks";
import type {
  ActivityName,
  ApiError,
  ForecastDay,
  LocationMatch,
  ScenarioWorld
} from "../../src/support/world";

const supportedActivities: ActivityName[] = [
  "Skiing",
  "Surfing",
  "Outdoor Sightseeing",
  "Indoor Sightseeing"
];

async function callActivityRankingApi(
  world: ScenarioWorld,
  location?: string
): Promise<void> {
  const query = location === undefined ? "" : `?location=${encodeURIComponent(location)}`;
  const headers: Record<string, string> = {};

  if (world.providerFailureEnabled) {
    // Test-only contract seam; replace with a stub provider in a real test environment if preferred.
    headers["x-test-weather-provider"] = "unavailable";
  }

  const response = await getApiContext().get(`/api/activity-rankings${query}`, { headers });
  world.response = response;

  const rawBody = await response.text();
  if (!rawBody.trim()) {
    world.responseBody = undefined;
    return;
  }

  try {
    world.responseBody = JSON.parse(rawBody) as unknown;
  } catch {
    world.responseBody = rawBody;
  }
}

function requireResponse(world: ScenarioWorld) {
  assert.ok(world.response, "No API response was captured");
  return world.response;
}

function requireObjectBody(world: ScenarioWorld): Record<string, any> {
  assert.ok(
    world.responseBody !== null &&
      typeof world.responseBody === "object" &&
      !Array.isArray(world.responseBody),
    `Expected a JSON object response, received: ${JSON.stringify(world.responseBody)}`
  );
  return world.responseBody as Record<string, any>;
}

function getForecastDays(world: ScenarioWorld): ForecastDay[] {
  const body = requireObjectBody(world);
  assert.ok(Array.isArray(body.days), 'Expected response property "days" to be an array');
  return body.days as ForecastDay[];
}

function getActivityResults(world: ScenarioWorld) {
  return getForecastDays(world).flatMap((day) => {
    assert.ok(Array.isArray(day.activities), `Expected activities array for ${day.date}`);
    return day.activities;
  });
}

function getErrorText(world: ScenarioWorld): string {
  const body = requireObjectBody(world) as ApiError;
  return `${body.error ?? ""} ${body.message ?? ""}`.trim().toLowerCase();
}

Given("the Activity Ranking API is available", async function () {
  // Intentionally no health-check request: the assignment has no implementation yet.
  // The scenario's actual request proves whether the configured service is reachable.
});

Given("the weather provider is configured to fail", function (this: ScenarioWorld) {
  this.providerFailureEnabled = true;
});

When("I request activity rankings for {string}", async function (this: ScenarioWorld, location: string) {
  await callActivityRankingApi(this, location);
});

When("I request activity rankings for the partial location {string}", async function (this: ScenarioWorld, location: string) {
  await callActivityRankingApi(this, location);
});

When("I request activity rankings without a location", async function (this: ScenarioWorld) {
  await callActivityRankingApi(this);
});

Then("the response status should be {int}", function (this: ScenarioWorld, expectedStatus: number) {
  const response = requireResponse(this);
  assert.equal(
    response.status(),
    expectedStatus,
    `Expected HTTP ${expectedStatus}; received ${response.status()}. Body: ${JSON.stringify(this.responseBody)}`
  );
});

Then("the response should contain a seven-day forecast", function (this: ScenarioWorld) {
  const days = getForecastDays(this);
  assert.equal(days.length, 7, `Expected exactly 7 forecast days, received ${days.length}`);

  const dates = days.map((day) => day.date);
  for (const date of dates) {
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `Invalid ISO date: ${date}`);
    assert.ok(!Number.isNaN(Date.parse(`${date}T00:00:00Z`)), `Unparseable date: ${date}`);
  }

  for (let index = 1; index < dates.length; index += 1) {
    const previousDate = Date.parse(`${dates[index - 1]}T00:00:00Z`);
    const currentDate = Date.parse(`${dates[index]}T00:00:00Z`);
    assert.equal(currentDate - previousDate, 86_400_000, "Forecast dates must be consecutive");
  }
});

Then("every forecast day should include all supported activities", function (this: ScenarioWorld) {
  for (const day of getForecastDays(this)) {
    const names = day.activities.map((activity) => activity.activity);
    assert.equal(names.length, supportedActivities.length, `${day.date} should contain exactly four activity results`);
    assert.deepEqual(
      [...names].sort(),
      [...supportedActivities].sort(),
      `${day.date} must contain each supported activity exactly once`
    );
  }
});

Then("every activity result should include a date, suitability and reasoning", function (this: ScenarioWorld) {
  for (const day of getForecastDays(this)) {
    for (const result of day.activities) {
      assert.equal(result.date, day.date, "Activity date must match its containing forecast day");
      assert.ok(result.activity, "Activity name must not be empty");
      assert.ok(Number.isFinite(result.suitability), "Suitability must be a finite number");
      assert.ok(typeof result.reasoning === "string", "Reasoning must be a string");
    }
  }
});

Then("the response should contain location matches", function (this: ScenarioWorld) {
  const body = requireObjectBody(this);
  assert.ok(Array.isArray(body.matches), 'Expected "matches" array for partial location searches');
  assert.ok(body.matches.length > 0, "Partial location search should return at least one match");
});

Then("every location match should include a name and coordinates", function (this: ScenarioWorld) {
  const body = requireObjectBody(this);
  assert.ok(Array.isArray(body.matches), 'Expected "matches" array');

  for (const match of body.matches as LocationMatch[]) {
    assert.ok(typeof match.name === "string" && match.name.trim().length > 0, "Location name must be non-empty");
    assert.ok(Number.isFinite(match.latitude), "Latitude must be numeric");
    assert.ok(match.latitude >= -90 && match.latitude <= 90, "Latitude must be between -90 and 90");
    assert.ok(Number.isFinite(match.longitude), "Longitude must be numeric");
    assert.ok(match.longitude >= -180 && match.longitude <= 180, "Longitude must be between -180 and 180");
  }
});

Then("the error response should explain that location is required", function (this: ScenarioWorld) {
  assert.match(getErrorText(this), /location.*required|required.*location/);
});

Then("the error response should explain that no location matched", function (this: ScenarioWorld) {
  assert.match(getErrorText(this), /no location|not found|no match|unknown location/);
});

Then("no forecast date should be duplicated", function (this: ScenarioWorld) {
  const dates = getForecastDays(this).map((day) => day.date);
  assert.equal(new Set(dates).size, dates.length, "Forecast response contains duplicate dates");
});

Then("every suitability score should be between 0 and 100 inclusive", function (this: ScenarioWorld) {
  for (const result of getActivityResults(this)) {
    assert.ok(
      result.suitability >= 0 && result.suitability <= 100,
      `${result.activity} on ${result.date} has out-of-range score ${result.suitability}`
    );
  }
});

Then("activities for each day should be ordered by descending suitability", function (this: ScenarioWorld) {
  for (const day of getForecastDays(this)) {
    for (let index = 1; index < day.activities.length; index += 1) {
      assert.ok(
        day.activities[index - 1].suitability >= day.activities[index].suitability,
        `Ranking is not descending for ${day.date}: ${day.activities[index - 1].activity} must not rank below ${day.activities[index].activity}`
      );
    }
  }
});

Then("every activity result should include non-empty reasoning", function (this: ScenarioWorld) {
  for (const result of getActivityResults(this)) {
    assert.ok(
      typeof result.reasoning === "string" && result.reasoning.trim().length > 0,
      `${result.activity} on ${result.date} needs an explanation`
    );
  }
});

Then("the error response should explain that forecast data is temporarily unavailable", function (this: ScenarioWorld) {
  assert.match(getErrorText(this), /forecast.*unavailable|temporarily unavailable|weather provider/);
});
