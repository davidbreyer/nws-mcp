# NWS MCP

A small learning MCP server for the public [National Weather Service API](https://www.weather.gov/documentation/services-web-api).

This repo is intended as an educational example of a simple Model Context Protocol (MCP) server. It focuses on a small read-only API wrapper so the core MCP ideas are easy to see: define tools, validate inputs, call an API, and return useful results to an AI client.

It exposes read-only tools over stdio:

- `get_forecast`
- `get_hourly_forecast`
- `get_active_alerts_for_state`

## Setup

```powershell
npm install
npm run build
```

## Run Locally

```powershell
npm run start
```

The server uses stdio, so it will wait for an MCP client to speak to it. Running it directly is mostly a smoke test that it starts without crashing.

## Example Client Config

After building, point an MCP client at the compiled server. Replace the path with the location where you cloned this repo.

Windows example:

```json
{
  "mcpServers": {
    "nws": {
      "command": "node",
      "args": [
        "C:\\path\\to\\nws-mcp\\dist\\index.js"
      ]
    }
  }
}
```

macOS/Linux example:

```json
{
  "mcpServers": {
    "nws": {
      "command": "node",
      "args": ["/path/to/nws-mcp/dist/index.js"]
    }
  }
}
```

## Notes

NWS asks API clients to send a meaningful `User-Agent`. This learning server sets one in `src/index.ts`. If you publish or share the server, update that value to identify your project.

The NWS API only covers the United States and US territories. Forecast calls use the API's recommended pattern:

1. Call `/points/{latitude},{longitude}`.
2. Read the forecast URL returned by that point response.
3. Call that forecast URL and return a smaller, AI-friendly result.
