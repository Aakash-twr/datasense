"""Pytest test configuration and database fixtures."""

from __future__ import annotations

from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.observability import set_shutting_down
from app.db.base import Base
from app.db.session import get_db
from app.main import app

# Create in-memory SQLite engine for tests
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=test_engine,
    expire_on_commit=False,
)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db() -> Generator[None, None, None]:
    """Create all database tables before tests and tear down after."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db() -> Generator[Session, None, None]:
    """Provide a transactional database session for each test function."""
    connection = test_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    if transaction.is_active:
        transaction.rollback()
    connection.close()


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    """Provide a FastAPI TestClient with the test DB dependency override."""

    def override_get_db() -> Generator[Session, None, None]:
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    set_shutting_down(False)
    app.dependency_overrides.clear()


@pytest.fixture
def register_user(client: TestClient) -> Any:
    """Helper fixture to register a test user."""

    def _register(
        name: str = "Alice Analyst",
        email: str = "alice@example.com",
        password: str = "SecurePass123!",
        organization_name: str = "Acme Analytics",
    ) -> dict[str, Any]:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "name": name,
                "email": email,
                "password": password,
                "organization_name": organization_name,
            },
        )
        return {"response": response, "data": response.json() if response.status_code == 201 else None}

    return _register
