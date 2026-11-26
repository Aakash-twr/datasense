"""Local, lightweight sensitive-data (PII) detection without external LLMs."""

from __future__ import annotations

import re

import polars as pl

# Regex patterns for local sampling
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
PHONE_REGEX = re.compile(r"^(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}$")
SSN_REGEX = re.compile(r"^\d{3}-\d{2}-\d{4}$")
CREDIT_CARD_REGEX = re.compile(r"^\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}$")
IPV4_REGEX = re.compile(r"^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$")


def detect_pii_for_column(
    series: pl.Series,
    original_col_name: str,
    canonical_type: str,
) -> tuple[str | None, float | None]:
    """Detect potential PII category and confidence score for a column."""
    col_lower = original_col_name.lower().strip()

    # 1. Email Check
    if any(k in col_lower for k in ("email", "e_mail", "mail_address")):
        return "email", 0.95
    if canonical_type == "string":
        sample = series.drop_nulls().head(50).to_list()
        if sample and all(isinstance(v, str) and EMAIL_REGEX.match(v.strip()) for v in sample[:10]):
            return "email", 0.90

    # 2. Phone Check
    if any(k in col_lower for k in ("phone", "mobile", "telephone", "cell_phone", "tel_no")):
        return "phone", 0.90
    if canonical_type in ("string", "integer"):
        sample = series.drop_nulls().head(50).to_list()
        if sample and all(isinstance(v, str) and PHONE_REGEX.match(v.strip()) for v in sample[:10]):
            return "phone", 0.85

    # 3. Name Check
    if any(col_lower == k for k in ("name", "first_name", "last_name", "full_name", "surname", "customer_name", "employee_name")):
        return "name", 0.85

    # 4. Social Security Number / National ID
    if any(k in col_lower for k in ("ssn", "social_security", "national_id", "tax_id")):
        return "ssn", 0.90
    if canonical_type == "string":
        sample = series.drop_nulls().head(50).to_list()
        if sample and all(isinstance(v, str) and SSN_REGEX.match(v.strip()) for v in sample[:10]):
            return "ssn", 0.95

    # 5. Credit Card
    if any(k in col_lower for k in ("credit_card", "card_number", "ccn", "card_no")):
        return "credit_card", 0.90
    if canonical_type == "string":
        sample = series.drop_nulls().head(50).to_list()
        if sample and all(isinstance(v, str) and CREDIT_CARD_REGEX.match(v.strip()) for v in sample[:10]):
            return "credit_card", 0.95

    # 6. Address
    if any(k in col_lower for k in ("street_address", "postal_code", "zip_code", "zipcode", "billing_address", "shipping_address")):
        return "address", 0.85

    # 7. IP Address
    if any(k in col_lower for k in ("ip_address", "client_ip", "remote_addr")):
        return "ip_address", 0.90
    if canonical_type == "string":
        sample = series.drop_nulls().head(50).to_list()
        if sample and all(isinstance(v, str) and IPV4_REGEX.match(v.strip()) for v in sample[:10]):
            return "ip_address", 0.90

    return None, None


def detect_table_pii(
    df: pl.DataFrame,
    column_mappings: dict[str, str],  # physical_name -> original_name
    schemas: dict[str, str],          # physical_name -> canonical_type
) -> dict[str, tuple[str, float]]:
    """Detect PII across all columns in a table."""
    results: dict[str, tuple[str, float]] = {}

    for phys_col in df.columns:
        orig_name = column_mappings.get(phys_col, phys_col)
        canon_type = schemas.get(phys_col, "string")
        cat, conf = detect_pii_for_column(df[phys_col], orig_name, canon_type)
        if cat and conf:
            results[phys_col] = (cat, conf)

    return results
