# Installer test system (dev/deploy-test/run.sh): Debian bookworm like OctoPi 1.1.0, without systemd as
# PID 1. What OctoPi already has (python3, sudo, curl, systemd, udev) and the heavy kiosk packages (cage,
# chromium) are preinstalled so a run is quick; install.sh still downloads python3-venv, wlr-randr and
# fonts-dejavu-core, which exercises its apt step.
FROM debian:bookworm

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates curl python3 sudo systemd udev util-linux procps cage chromium \
    && rm -rf /var/lib/apt/lists/*
