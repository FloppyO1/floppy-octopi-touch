# Development image for the agent (Python 3.11, same as OctoPi 1.1.0).
FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    WATCHFILES_FORCE_POLLING=true

WORKDIR /app
COPY agent/ /app/
RUN pip install -e ".[dev]"

EXPOSE 8765
CMD ["watchfiles", "--filter", "python", "python -m floppyoctotouch_agent", "floppyoctotouch_agent"]
