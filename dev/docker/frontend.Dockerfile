# Development image for the frontend toolchain (Vite, vitest, svelte-check).
# node_modules lives in a named volume, never on the host.
FROM node:24-bookworm-slim

WORKDIR /app
ENV CHOKIDAR_USEPOLLING=1 \
    npm_config_update_notifier=false \
    npm_config_fund=false

EXPOSE 5173
CMD ["sh", "-c", "npm install --no-audit --prefer-offline && npm run dev -- --host 0.0.0.0"]
