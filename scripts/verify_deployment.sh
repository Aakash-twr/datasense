#!/usr/bin/env bash
# Verify live DataSense deployment health, readiness, and HTTP security headers.
set -euo pipefail

API_URL="${1:-http://127.0.0.1:8000}"

echo "Checking liveness: ${API_URL}/api/v1/health/live"
curl -fsS "${API_URL}/api/v1/health/live" | grep -q '"alive"'

echo "Checking readiness: ${API_URL}/api/v1/health/ready"
curl -fsS "${API_URL}/api/v1/health/ready" | grep -q '"ready":true'

echo "Checking security headers on ${API_URL}/api/v1/health"
HEADERS="$(curl -fsSI "${API_URL}/api/v1/health")"
echo "$HEADERS" | grep -iq "x-content-type-options: nosniff"
echo "$HEADERS" | grep -iq "x-frame-options: DENY"

echo "Deployment verification passed!"
