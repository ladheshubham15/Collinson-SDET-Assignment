import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * In-process MOCK of the Activity Ranking API, used only by the @mock feature to demonstrate that the
 * steps and assertions can pass. It is not the system under test and uses deliberately simple scoring.
 * It talks to Open-Meteo (the stub) via `openMeteoBaseUrl`, exactly as a real implementation would.
 */

interface Geo { name: string; country: string; admin1?: string; latitude: number; longitude: number }

export class MockActivityRankingApi {
  private server?: http.Server;
  constructor(private readonly openMeteoBaseUrl: string) {}

  async start(): Promise<string> {
    this.server = http.createServer((req, res) => {
      this.route(req, res).catch(() => this.send(res, 502, { error: "Forecast data temporarily unavailable" }));
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = undefined;
  }

  private send(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }

  private async geocode(name: string): Promise<Geo[]> {
    const r = await fetch(`${this.openMeteoBaseUrl}/v1/search?name=${encodeURIComponent(name)}&count=10`);
    if (!r.ok) throw new Error("geocoding failed");
    return ((await r.json()) as { results?: Geo[] }).results ?? [];
  }

  private async route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://mock");
    const isLocations = url.pathname === "/api/locations";
    if (!isLocations && url.pathname !== "/api/activity-rankings") return this.send(res, 404, { error: "not found" });

    const term = (url.searchParams.get(isLocations ? "query" : "location") ?? "").trim();
    if (!term) return this.send(res, 400, { error: `${isLocations ? "query" : "location"} is required` });

    const found = await this.geocode(term);
    if (isLocations) {
      return this.send(res, 200, {
        matches: found.map((c) => ({ name: c.name, country: c.country, region: c.admin1, latitude: c.latitude, longitude: c.longitude }))
      });
    }

    const city = found.find((c) => c.name.toLowerCase() === term.toLowerCase());
    if (!city) return this.send(res, 404, { error: "No location matched" });

    const qs = `latitude=${city.latitude}&longitude=${city.longitude}&forecast_days=7`;
    const [forecast, marine] = await Promise.all([
      fetch(`${this.openMeteoBaseUrl}/v1/forecast?${qs}`),
      fetch(`${this.openMeteoBaseUrl}/v1/marine?${qs}`)
    ]);
    if (!forecast.ok || !marine.ok) throw new Error("forecast failed");
    const d = ((await forecast.json()) as any).daily;
    const w = ((await marine.json()) as any).daily;

    const days = (d.time as string[]).map((date, i) => {
      const snow: number = d.snowfall_sum[i];
      const rain: number = d.precipitation_sum[i] - snow;
      const temp: number = d.temperature_2m_max[i];
      const wind: number = d.wind_speed_10m_max[i];
      const wave: number = w.wave_height_max[i];
      const stormy = rain > 5 || wind > 30;

      const scored: Array<[string, number, string]> = [
        ["Skiing", snow > 5 ? 95 : 5, snow > 5 ? `High snowfall expected (${snow}cm)` : "Not enough snow"],
        ["Surfing", wave > 1.5 && !stormy ? 90 : wave > 1 ? 40 : 10, `Wave height of ${wave}m`],
        ["Outdoor Sightseeing", stormy ? 10 : 80, stormy ? `Heavy rain and wind expected (${d.precipitation_sum[i]}mm)` : `Clear skies and ${temp}°C`],
        ["Indoor Sightseeing", stormy ? 85 : 30, stormy ? "Wet and windy, better indoors" : "Fine weather, outdoors is better"]
      ];
      scored.sort((a, b) => b[1] - a[1]);
      return {
        date,
        activities: scored.map(([activity, suitability, reasoning], k) => ({ date, activity, rank: k + 1, suitability, reasoning }))
      };
    });

    this.send(res, 200, {
      location: { name: city.name, country: city.country, latitude: city.latitude, longitude: city.longitude },
      days
    });
  }
}
