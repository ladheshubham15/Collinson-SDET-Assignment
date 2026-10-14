import { World, setWorldConstructor } from "@cucumber/cucumber";
import { request, type APIRequestContext, type APIResponse } from "@playwright/test";

export type ActivityName =
  | "Skiing"
  | "Surfing"
  | "Outdoor Sightseeing"
  | "Indoor Sightseeing";

export interface ActivityResult {
  date: string;
  activity: ActivityName;
  rank: number;
  suitability: number;
  reasoning: string;
}

export interface ForecastDay {
  date: string;
  activities: ActivityResult[];
}

export interface LocationMatch {
  name: string;
  country?: string;
  region?: string;
  latitude: number;
  longitude: number;
}

export interface ApiError {
  error?: string;
  message?: string;
}

export function getApiBaseUrl(): string {
  return (process.env.ACTIVITY_RANKING_API_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
}

export class ApiWorld extends World {
  api?: APIRequestContext;
  response?: APIResponse;
  responseBody?: unknown;
  /** Name of the city the scenario configured in the Open-Meteo stub. */
  city?: string;
  /** Overrides ACTIVITY_RANKING_API_URL (set by the @mock hook). */
  baseUrl?: string;

  async init(): Promise<void> {
    this.api = await request.newContext({
      baseURL: this.baseUrl ?? getApiBaseUrl(),
      extraHTTPHeaders: { Accept: "application/json" },
      timeout: Number(process.env.API_REQUEST_TIMEOUT_MS ?? 10_000)
    });
  }

  async dispose(): Promise<void> {
    await this.api?.dispose();
  }

  async get(path: string, params?: Record<string, string>): Promise<void> {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    this.response = await this.api!.get(`${path}${query}`);
    const raw = await this.response.text();
    try {
      this.responseBody = raw.trim() ? JSON.parse(raw) : undefined;
    } catch {
      this.responseBody = raw;
    }
  }
}

setWorldConstructor(ApiWorld);
