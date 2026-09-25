# FloppyOctoTouch agent

Small [aiohttp](https://docs.aiohttp.org/) service that runs next to OctoPrint on the Raspberry Pi:

- serves the built dashboard (`frontend/dist`);
- reverse-proxies `/api`, `/sockjs` (including the WebSocket), `/plugin` and `/downloads` to OctoPrint,
  injecting the `X-Api-Key` header so the key never reaches the browser;
- exposes local endpoints under `/local` (`/local/health`, `/local/settings`, more to come).

It listens on `127.0.0.1` only by default: since the proxy adds the API key, exposing it on the LAN would give
unauthenticated control of the printer.

## Configuration

Values are read from a JSON file (default `~/.config/floppyoctotouch/config.json`, override with
`FOT_CONFIG`) and then from environment variables, which win:

| Env var | Config key | Default |
|---|---|---|
| `FOT_OCTOPRINT_URL` | `octoprint_url` | `http://127.0.0.1:5000` |
| `FOT_API_KEY` | `api_key` | _(empty)_ |
| `FOT_HOST` | `host` | `127.0.0.1` |
| `FOT_PORT` | `port` | `8765` |
| `FOT_STATIC_DIR` | `static_dir` | `/opt/floppyoctotouch/frontend` |
| `FOT_DATA_DIR` | `data_dir` | `~/.config/floppyoctotouch` |
| `FOT_USB_ROOTS` | `usb_roots` | `/media` (colon-separated in env) |

## Development

Everything runs in Docker, see the main [README](../README.md). Tests and lint:

```sh
docker compose -f dev/docker-compose.yml run --rm agent-test
```
