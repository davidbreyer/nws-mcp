#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const NWS_BASE_URL = "https://api.weather.gov";
const USER_AGENT = "nws-mcp/0.1 (https://github.com/davidbreyer/nws-mcp)";

type PointResponse = {
  properties: {
    relativeLocation?: {
      properties?: {
        city?: string;
        state?: string;
      };
    };
    forecast: string;
    forecastHourly: string;
  };
};

type ForecastResponse = {
  properties: {
    periods: Array<{
      name: string;
      startTime: string;
      endTime: string;
      temperature: number;
      temperatureUnit: string;
      windSpeed: string;
      windDirection: string;
      shortForecast: string;
      detailedForecast: string;
      probabilityOfPrecipitation?: {
        value: number | null;
      };
    }>;
  };
};

type AlertsResponse = {
  features: Array<{
    id: string;
    properties: {
      event: string;
      headline: string | null;
      severity: string;
      urgency: string;
      certainty: string;
      areaDesc: string;
      effective: string | null;
      expires: string | null;
      description: string | null;
      instruction: string | null;
    };
  }>;
};

const server = new McpServer({
  name: "nws-mcp",
  version: "0.1.0",
});

function nwsUrl(path: string, query?: Record<string, string | number | undefined>) {
  const url = new URL(path, NWS_BASE_URL);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function fetchJson<T>(url: URL | string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/geo+json",
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`NWS API returned ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  }

  return response.json() as Promise<T>;
}

async function getPoint(latitude: number, longitude: number) {
  return fetchJson<PointResponse>(nwsUrl(`/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`));
}

function locationName(point: PointResponse) {
  const location = point.properties.relativeLocation?.properties;
  return [location?.city, location?.state].filter(Boolean).join(", ") || "Unknown location";
}

function forecastText(point: PointResponse, forecast: ForecastResponse, periodLimit: number) {
  const periods = forecast.properties.periods.slice(0, periodLimit).map((period) => ({
    name: period.name,
    startTime: period.startTime,
    endTime: period.endTime,
    temperature: `${period.temperature} ${period.temperatureUnit}`,
    wind: `${period.windSpeed} ${period.windDirection}`,
    precipitationChance: period.probabilityOfPrecipitation?.value,
    shortForecast: period.shortForecast,
    detailedForecast: period.detailedForecast,
  }));

  return JSON.stringify(
    {
      location: locationName(point),
      periods,
    },
    null,
    2,
  );
}

server.registerTool(
  "get_forecast",
  {
    title: "Get Forecast",
    description: "Get the NWS daily/period forecast for a latitude and longitude in the United States.",
    inputSchema: {
      latitude: z.number().min(-90).max(90).describe("Latitude, such as 39.1031."),
      longitude: z.number().min(-180).max(180).describe("Longitude, such as -84.5120."),
      periods: z.number().int().min(1).max(14).default(7).describe("Maximum forecast periods to return."),
    },
  },
  async ({ latitude, longitude, periods }) => {
    const point = await getPoint(latitude, longitude);
    const forecast = await fetchJson<ForecastResponse>(point.properties.forecast);

    return {
      content: [
        {
          type: "text",
          text: forecastText(point, forecast, periods),
        },
      ],
    };
  },
);

server.registerTool(
  "get_hourly_forecast",
  {
    title: "Get Hourly Forecast",
    description: "Get the NWS hourly forecast for a latitude and longitude in the United States.",
    inputSchema: {
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      hours: z.number().int().min(1).max(48).default(12).describe("Maximum hourly periods to return."),
    },
  },
  async ({ latitude, longitude, hours }) => {
    const point = await getPoint(latitude, longitude);
    const forecast = await fetchJson<ForecastResponse>(point.properties.forecastHourly);

    return {
      content: [
        {
          type: "text",
          text: forecastText(point, forecast, hours),
        },
      ],
    };
  },
);

server.registerTool(
  "get_active_alerts_for_state",
  {
    title: "Get Active Alerts For State",
    description: "Get active NWS weather alerts for a two-letter US state or territory code.",
    inputSchema: {
      state: z.string().length(2).toUpperCase().describe("Two-letter state code, such as OH or CA."),
      limit: z.number().int().min(1).max(25).default(10),
    },
  },
  async ({ state, limit }) => {
    const alerts = await fetchJson<AlertsResponse>(nwsUrl("/alerts/active", { area: state }));
    const features = alerts.features.slice(0, limit).map((alert) => ({
      id: alert.id,
      event: alert.properties.event,
      headline: alert.properties.headline,
      severity: alert.properties.severity,
      urgency: alert.properties.urgency,
      certainty: alert.properties.certainty,
      area: alert.properties.areaDesc,
      effective: alert.properties.effective,
      expires: alert.properties.expires,
      description: alert.properties.description,
      instruction: alert.properties.instruction,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ state, alerts: features }, null, 2),
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
