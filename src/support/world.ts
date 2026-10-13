import type { APIResponse } from "@playwright/test";

export type ActivityName =
  | "Skiing"
  | "Surfing"
  | "Outdoor Sightseeing"
  | "Indoor Sightseeing";

export interface ActivityResult {
  date: string;
  activity: ActivityName;
  suitability: number;
  reasoning: string;
}

export interface ForecastDay {
  date: string;
  activities: ActivityResult[];
}

export interface LocationMatch {
  name: string;
  latitude: number;
  longitude: number;
}

export interface ApiError {
  error?: string;
  message?: string;
}

export interface ScenarioWorld {
  response?: APIResponse;
  responseBody?: unknown;
  providerFailureEnabled: boolean;
}
