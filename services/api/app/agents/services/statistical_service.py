"""Deterministic statistical and anomaly analysis engine powered by Polars."""

from __future__ import annotations

import logging
import math
from typing import Any

import polars as pl

from app.agents.schemas import (
    AnomalyIndicator,
    MetricStatistic,
    StatisticalAnalysisOutput,
)

logger = logging.getLogger(__name__)

NUMERIC_TYPE_HINTS = ("INT", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL", "BIGINT", "SMALLINT")


class StatisticalService:
    """Computes exact deterministic statistics and anomaly indicators on bounded query artifacts."""

    @classmethod
    def analyze_artifacts(cls, artifacts: list[dict[str, Any]]) -> StatisticalAnalysisOutput:
        """Runs deterministic statistical computations across all approved result artifacts."""
        all_metrics: list[MetricStatistic] = []
        all_rankings: list[dict[str, Any]] = []
        all_correlations: list[dict[str, Any]] = []
        all_anomalies: list[AnomalyIndicator] = []

        for idx, artifact in enumerate(artifacts):
            columns = artifact.get("columns", [])
            rows = artifact.get("rows", [])
            query_ref = artifact.get("query_run_id") or artifact.get("artifact_id") or f"query_{idx + 1}"
            table_label = f"Query #{idx + 1}"

            if not columns or not rows:
                continue

            col_names = [str(c.get("name", f"col_{i}")) for i, c in enumerate(columns)]
            col_types = {str(c.get("name", f"col_{i}")): str(c.get("type", "")).upper() for i, c in enumerate(columns)}

            # Build column-oriented dict safely handling mixed/nullable values
            col_data: dict[str, list[Any]] = {name: [] for name in col_names}
            for row in rows:
                for col_i, name in enumerate(col_names):
                    col_data[name].append(row[col_i] if col_i < len(row) else None)

            numeric_cols: list[str] = []
            dimension_cols: list[str] = []

            for name in col_names:
                t_upper = col_types[name]
                if any(hint in t_upper for hint in NUMERIC_TYPE_HINTS):
                    numeric_cols.append(name)
                else:
                    # Also detect numeric lists even if type string is generic
                    non_null = [v for v in col_data[name] if v is not None]
                    if non_null and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in non_null):
                        numeric_cols.append(name)
                    else:
                        dimension_cols.append(name)

            # 1. Numeric summaries + IQR/Z-Score/Rolling deviations
            numeric_series_map: dict[str, pl.Series] = {}
            for num_col in numeric_cols:
                vals: list[float] = []
                for raw in col_data[num_col]:
                    if raw is not None and not isinstance(raw, bool):
                        try:
                            f_val = float(raw)
                            if math.isfinite(f_val):
                                vals.append(f_val)
                        except (ValueError, TypeError):
                            continue

                if not vals:
                    continue

                series = pl.Series(num_col, vals, dtype=pl.Float64)
                numeric_series_map[num_col] = series

                cnt = len(vals)
                s_sum = float(series.sum())
                s_mean = float(series.mean()) if cnt > 0 else None
                s_median = float(series.median()) if cnt > 0 else None
                s_min = float(series.min()) if cnt > 0 else None
                s_max = float(series.max()) if cnt > 0 else None
                s_std = float(series.std()) if cnt > 1 else 0.0
                s_var = float(series.var()) if cnt > 1 else 0.0
                q25 = float(series.quantile(0.25)) if cnt >= 2 else s_min
                q75 = float(series.quantile(0.75)) if cnt >= 2 else s_max
                iqr = (q75 - q25) if (q25 is not None and q75 is not None) else None

                growth_pct: float | None = None
                period_note: str | None = None
                if cnt >= 2 and vals[0] != 0:
                    # Period-over-period growth from first to last row when sequential
                    growth_pct = round(((vals[-1] - vals[0]) / abs(vals[0])) * 100.0, 2)
                    latest_pct = (
                        round(((vals[-1] - vals[-2]) / abs(vals[-2])) * 100.0, 2)
                        if vals[-2] != 0
                        else None
                    )
                    period_note = f"Overall change: {growth_pct:+.2f}%" + (
                        f"; Latest step: {latest_pct:+.2f}%" if latest_pct is not None else ""
                    )

                all_metrics.append(
                    MetricStatistic(
                        metric_name=num_col,
                        table_or_query=table_label,
                        column_name=num_col,
                        count=cnt,
                        sum_value=round(s_sum, 4),
                        mean=round(s_mean, 4) if s_mean is not None else None,
                        median=round(s_median, 4) if s_median is not None else None,
                        min_value=round(s_min, 4) if s_min is not None else None,
                        max_value=round(s_max, 4) if s_max is not None else None,
                        std_dev=round(s_std, 4) if s_std is not None else None,
                        variance=round(s_var, 4) if s_var is not None else None,
                        q25=round(q25, 4) if q25 is not None else None,
                        q75=round(q75, 4) if q75 is not None else None,
                        iqr=round(iqr, 4) if iqr is not None else None,
                        growth_rate_pct=growth_pct,
                        period_comparison=period_note,
                        evidence_reference=f"query_run:{query_ref}",
                    )
                )

                # Outlier Detection (IQR + Z-score + Rolling deviation)
                dim_values = col_data[dimension_cols[0]] if dimension_cols else list(range(len(col_data[num_col])))
                if cnt >= 4 and iqr is not None and iqr > 0 and q25 is not None and q75 is not None:
                    lower = q25 - 1.5 * iqr
                    upper = q75 + 1.5 * iqr
                    for row_i, raw in enumerate(col_data[num_col]):
                        if raw is None or isinstance(raw, bool):
                            continue
                        try:
                            val = float(raw)
                        except (ValueError, TypeError):
                            continue
                        if val < lower or val > upper:
                            lbl = str(dim_values[row_i]) if row_i < len(dim_values) else f"Row {row_i + 1}"
                            all_anomalies.append(
                                AnomalyIndicator(
                                    metric_name=num_col,
                                    method="iqr",
                                    label=lbl,
                                    observed_value=round(val, 4),
                                    expected_range=f"[{round(lower, 2)}, {round(upper, 2)}]",
                                    severity="high" if (val > q75 + 3 * iqr or val < q25 - 3 * iqr) else "medium",
                                    note=(
                                        f"Statistical IQR outlier detected for '{lbl}' ({val:.2f} outside "
                                        f"expected [{lower:.2f}, {upper:.2f}]). Investigate whether valid peak or anomaly."
                                    ),
                                    evidence_reference=f"query_run:{query_ref}",
                                )
                            )
                elif cnt >= 4 and s_std and s_std > 0 and s_mean is not None:
                    for row_i, raw in enumerate(col_data[num_col]):
                        if raw is None or isinstance(raw, bool):
                            continue
                        try:
                            val = float(raw)
                        except (ValueError, TypeError):
                            continue
                        z = abs((val - s_mean) / s_std)
                        if z >= 2.2:
                            lbl = str(dim_values[row_i]) if row_i < len(dim_values) else f"Row {row_i + 1}"
                            all_anomalies.append(
                                AnomalyIndicator(
                                    metric_name=num_col,
                                    method="z_score",
                                    label=lbl,
                                    observed_value=round(val, 4),
                                    expected_range=f"mean {s_mean:.2f} ± 2.2σ",
                                    severity="medium",
                                    note=f"Z-score deviation (z={z:.2f}) observed at '{lbl}'.",
                                    evidence_reference=f"query_run:{query_ref}",
                                )
                            )

            # 2. Rankings (Top items by first numeric column if dimension present)
            if dimension_cols and numeric_cols:
                dim = dimension_cols[0]
                metric = numeric_cols[0]
                paired: list[tuple[str, float]] = []
                total_metric = 0.0
                for d_val, m_val in zip(col_data[dim], col_data[metric], strict=False):
                    if d_val is not None and m_val is not None and not isinstance(m_val, bool):
                        try:
                            fv = float(m_val)
                            paired.append((str(d_val), fv))
                            total_metric += fv
                        except (ValueError, TypeError):
                            continue
                if paired:
                    sorted_pairs = sorted(paired, key=lambda x: x[1], reverse=True)[:5]
                    all_rankings.append(
                        {
                            "dimension": dim,
                            "metric": metric,
                            "evidence_reference": f"query_run:{query_ref}",
                            "top_items": [
                                {
                                    "label": lbl,
                                    "value": round(val, 4),
                                    "share_pct": round((val / total_metric) * 100.0, 2) if total_metric else None,
                                }
                                for lbl, val in sorted_pairs
                            ],
                        }
                    )

            # 3. Pairwise correlations (only when >= 3 rows and non-zero std)
            if len(numeric_series_map) >= 2:
                names_list = list(numeric_series_map.keys())
                for i in range(len(names_list)):
                    for j in range(i + 1, len(names_list)):
                        c1, c2 = names_list[i], names_list[j]
                        s1, s2 = numeric_series_map[c1], numeric_series_map[c2]
                        if len(s1) == len(s2) and len(s1) >= 3 and (s1.std() or 0) > 0 and (s2.std() or 0) > 0:
                            try:
                                df_pair = pl.DataFrame({c1: s1, c2: s2})
                                corr_val = df_pair.select(pl.corr(c1, c2)).item()
                                if corr_val is not None and math.isfinite(float(corr_val)):
                                    all_correlations.append(
                                        {
                                            "column_a": c1,
                                            "column_b": c2,
                                            "pearson_r": round(float(corr_val), 4),
                                            "sample_size": len(s1),
                                            "evidence_reference": f"query_run:{query_ref}",
                                            "note": "Correlation indicates statistical co-movement only, not causation.",
                                        }
                                    )
                            except Exception:
                                continue

        summary_parts = [
            f"Computed {len(all_metrics)} metric summaries across {len(artifacts)} approved query results.",
        ]
        if all_anomalies:
            summary_parts.append(f"Identified {len(all_anomalies)} statistical outlier indicator(s).")
        if all_correlations:
            summary_parts.append(f"Evaluated {len(all_correlations)} numeric correlation pair(s).")

        return StatisticalAnalysisOutput(
            metrics=all_metrics,
            rankings=all_rankings,
            correlations=all_correlations,
            anomalies=all_anomalies[:20],
            summary=" ".join(summary_parts),
        )
