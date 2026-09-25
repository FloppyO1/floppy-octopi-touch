# Release builder (scripts/build-release.sh): Node for the web app, Python + pip for the agent wheel.
FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

ENV npm_config_update_notifier=false \
    npm_config_fund=false \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /src
