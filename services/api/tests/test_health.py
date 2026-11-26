"""Tests for the DataSense API health endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check_status_ok() -> None:
    """Health endpoint returns HTTP 200 with status 'ok'."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_health_check_service_name() -> None:
    """Health endpoint identifies the correct service name."""
    response = client.get("/api/v1/health")
    data = response.json()
    assert data["service"] == "datasense-api"


def test_health_check_version_present() -> None:
    """Health endpoint returns a non-empty version string."""
    response = client.get("/api/v1/health")
    data = response.json()
    assert isinstance(data["version"], str)
    assert len(data["version"]) > 0


def test_health_check_environment_present() -> None:
    """Health endpoint returns an environment field."""
    response = client.get("/api/v1/health")
    data = response.json()
    assert "environment" in data


def test_health_check_timestamp_present() -> None:
    """Health endpoint returns an ISO timestamp."""
    response = client.get("/api/v1/health")
    data = response.json()
    assert "timestamp" in data
    assert "T" in data["timestamp"]  # ISO 8601 format


def test_root_endpoint() -> None:
    """Root endpoint returns a running message."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data


def test_cors_headers_present() -> None:
    """Pre-flight CORS headers are returned for the allowed origin."""
    response = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code in (200, 204)
