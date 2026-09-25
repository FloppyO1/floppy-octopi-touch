"""FloppyOctoTouch agent: static server, OctoPrint reverse proxy and local endpoints."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("floppyoctotouch-agent")
except PackageNotFoundError:  # running from a source tree without installation
    __version__ = "0.0.0"
