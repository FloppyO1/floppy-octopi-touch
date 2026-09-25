"""Command line entry point: ``python -m floppyoctotouch_agent``."""

from __future__ import annotations

import argparse
import logging

from aiohttp import web

from . import __version__
from .app import create_app
from .config import load_config

log = logging.getLogger("floppyoctotouch_agent")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="floppyoctotouch-agent", description=__doc__)
    parser.add_argument("--host", help="listen address (default from config: 127.0.0.1)")
    parser.add_argument("--port", type=int, help="listen port (default from config: 8765)")
    parser.add_argument(
        "--listen-lan",
        action="store_true",
        help="listen on all interfaces. WARNING: anyone on the network gets API-key access",
    )
    parser.add_argument("--version", action="version", version=__version__)
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    config = load_config()
    if args.host:
        config.host = args.host
    if args.port:
        config.port = args.port
    if args.listen_lan:
        config.host = "0.0.0.0"
    if config.host not in ("127.0.0.1", "localhost", "::1"):
        log.warning(
            "Listening on %s: the proxy injects the OctoPrint API key, "
            "so everyone who can reach this port controls the printer.",
            config.host,
        )
    if not config.api_key:
        log.warning("No OctoPrint API key configured: proxied requests will be anonymous.")

    log.info("FloppyOctoTouch agent %s -> %s", __version__, config.octoprint_url)
    web.run_app(create_app(config), host=config.host, port=config.port, print=None)


if __name__ == "__main__":
    main()
