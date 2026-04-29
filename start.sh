#!/usr/bin/env sh
set -eu

PORT="${1:-8080}"
HOST_PORT="$PORT" docker compose up --build
