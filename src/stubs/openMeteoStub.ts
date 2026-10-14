import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Local stand-in for Open-Meteo. The API under test must be pointed at this server
 * (OPEN_METEO_BASE_URL) so weather inputs are deterministic and failures can be injected.
 * Response shapes mirror the real services:
 *   GET /v1/search    -> geocoding   (geocoding-api.open-meteo.com)
 *   GET /v1/forecast  -> daily forecast (api.open-meteo.com)
 *   GET /v1/marine    -> daily wave data (marine-api.open-meteo.com)
 */

export type WeatherProfile = "snowy" | "sunny" | "rainy" | "surf";
export type ProviderMode = "ok" | "error";

export interface StubCity {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  country_code: string;
  admin1: string;
  timezone: string;
}

export interface RecordedRequest {
  path: string;
  query: Record<string, string>;
}

const CATALOG: StubCity[] = [
  { id: 2267057, name: "Lisbon", latitude: 38.71667, longitude: -9.13333, country: "Portugal", country_code: "PT", admin1: "Lisbon", timezone: "Europe/Lisbon" },
  { id: 3413829, name: "Reykjavik", latitude: 64.13548, longitude: -21.89541, country: "Iceland", country_code: "IS", admin1: "Capital Region", timezone: "Atlantic/Reykjavik" },
  { id: 3143244, name: "Oslo", latitude: 59.91273, longitude: 10.74609, country: "Norway", country_code: "NO", admin1: "Oslo", timezone: "Europe/Oslo" },
  { id: 5391959, name: "San Francisco", latitude: 37.77493, longitude: -122.41942, country: "United States", country_code: "US", admin1: "California", timezone: "America/Los_Angeles" },
  { id: 5391811, name: "San Diego", latitude: 32.71533, longitude: -117.15726, country: "United States", country_code: "US", admin1: "California", timezone: "America/Los_Angeles" },
  { id: 5392171, name: "San Jose", latitude: 37.33939, longitude: -121.89496, country: "United States", country_code: "US", admin1: "California", timezone: "America/Los_Angeles" },
  { id: 2657896, name: "Zurich", latitude: 47.36667, longitude: 8.55, country: "Switzerland", country_code: "CH", admin1: "Zurich", timezone: "Europe/Zurich" }
];

interface DayWeather {
  code: number;
  tMax: number;
  tMin: number;
  precipitation: number;
  snowfall: number;
  wind: number;
  waveHeight: number;
}

const PROFILES: Record<WeatherProfile, DayWeather> = {
  snowy: { code: 75, tMax: -2, tMin: -8, precipitation: 12, snowfall: 15, wind: 12, waveHeight: 0.3 },
  sunny: { code: 0, tMax: 22, tMin: 14, precipitation: 0, snowfall: 0, wind: 8, waveHeight: 0.4 },
  rainy: { code: 65, tMax: 11, tMin: 8, precipitation: 22, snowfall: 0, wind: 35, waveHeight: 1.2 },
  surf: { code: 1, tMax: 24, tMin: 17, precipitation: 0, snowfall: 0, wind: 14, waveHeight: 2.4 }
};

export class OpenMeteoStub {
  private server?: http.Server;
  private profiles = new Map<number, WeatherProfile>();
  private catalog: StubCity[] = [...CATALOG];
  readonly requests: RecordedRequest[] = [];
  geocodingMode: ProviderMode = "ok";
  forecastMode: ProviderMode = "ok";

  async start(port: number): Promise<void> {
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(port, "127.0.0.1", resolve);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = undefined;
  }

  get port(): number {
    return (this.server!.address() as AddressInfo).port;
  }

  reset(): void {
    this.profiles.clear();
    this.catalog = [...CATALOG];
    this.requests.length = 0;
    this.geocodingMode = "ok";
    this.forecastMode = "ok";
  }

  /** Make `name` resolve to a city (adding it if unknown) with the given weather for all 7 days. */
  setWeather(name: string, profile: WeatherProfile): StubCity {
    let city = this.catalog.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!city) {
      city = { id: 9_000_000 + this.catalog.length, name, latitude: 46.02, longitude: 7.75, country: "Testland", country_code: "TL", admin1: "Test", timezone: "UTC" };
      this.catalog.push(city);
    }
    this.profiles.set(city.id, profile);
    return city;
  }

  findCity(name: string): StubCity | undefined {
    return this.catalog.find((c) => c.name.toLowerCase() === name.toLowerCase());
  }

  /** The seven ISO dates the stub serves (today, UTC, plus six). */
  expectedDates(): string[] {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }

  requestsTo(path: string): RecordedRequest[] {
    return this.requests.filter((r) => r.path === path);
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://stub");
    const query = Object.fromEntries(url.searchParams.entries());
    this.requests.push({ path: url.pathname, query });

    if (url.pathname === "/v1/search") return this.search(query, res);
    if (url.pathname === "/v1/forecast" || url.pathname === "/v1/marine") return this.forecast(url.pathname, query, res);
    this.json(res, 404, { error: true, reason: "not found" });
  }

  private search(query: Record<string, string>, res: http.ServerResponse): void {
    if (this.geocodingMode === "error") return this.json(res, 500, { error: true, reason: "stub geocoding failure" });
    const term = (query.name ?? "").trim().toLowerCase();
    const count = Number(query.count ?? 10);
    const results = term.length < 2
      ? this.catalog.filter((c) => c.name.toLowerCase() === term)
      : this.catalog.filter((c) => c.name.toLowerCase().startsWith(term));
    // Like the real service, the "results" key is omitted entirely when nothing matches.
    this.json(res, 200, results.length ? { results: results.slice(0, count), generationtime_ms: 0.5 } : { generationtime_ms: 0.5 });
  }

  private forecast(path: string, query: Record<string, string>, res: http.ServerResponse): void {
    if (this.forecastMode === "error") return this.json(res, 500, { error: true, reason: "stub forecast failure" });
    const lat = Number(query.latitude);
    const lon = Number(query.longitude);
    const city = this.catalog.find((c) => Math.abs(c.latitude - lat) < 0.05 && Math.abs(c.longitude - lon) < 0.05);
    if (!city) return this.json(res, 400, { error: true, reason: "unknown coordinates for stub" });

    const weather = PROFILES[this.profiles.get(city.id) ?? "sunny"];
    const days = Number(query.forecast_days ?? 7);
    const time = Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const fill = (value: number) => time.map(() => value);

    const daily = path === "/v1/marine"
      ? { time, wave_height_max: fill(weather.waveHeight) }
      : {
          time,
          weather_code: fill(weather.code),
          temperature_2m_max: fill(weather.tMax),
          temperature_2m_min: fill(weather.tMin),
          precipitation_sum: fill(weather.precipitation),
          snowfall_sum: fill(weather.snowfall),
          wind_speed_10m_max: fill(weather.wind)
        };
    this.json(res, 200, { latitude: city.latitude, longitude: city.longitude, timezone: city.timezone, daily });
  }

  private json(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }
}

export const openMeteoStub = new OpenMeteoStub();
