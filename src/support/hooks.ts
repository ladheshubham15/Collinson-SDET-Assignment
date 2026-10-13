import { Before, After, setDefaultTimeout } from "@cucumber/cucumber";
import { request, type APIRequestContext } from "@playwright/test";
import type { ScenarioWorld } from "./world";

setDefaultTimeout(15_000);

let apiContext: APIRequestContext | undefined;

export function getApiContext(): APIRequestContext {
  if (!apiContext) {
    throw new Error("Playwright API context has not been initialized. Check the Cucumber Before hook.");
  }
  return apiContext;
}

export function getApiBaseUrl(): string {
  return (process.env.ACTIVITY_RANKING_API_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
}

Before(async function (this: ScenarioWorld) {
  apiContext = await request.newContext({
    baseURL: getApiBaseUrl(),
    extraHTTPHeaders: {
      Accept: "application/json"
    },
    timeout: Number(process.env.API_REQUEST_TIMEOUT_MS ?? 10_000)
  });

  this.response = undefined;
  this.responseBody = undefined;
  this.providerFailureEnabled = false;
});

After(async function () {
  await apiContext?.dispose();
  apiContext = undefined;
});
