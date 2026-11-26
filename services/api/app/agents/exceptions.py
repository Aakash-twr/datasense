"""Domain exceptions for Phase 6 multi-agent workflows."""

from __future__ import annotations


class AgentWorkflowError(Exception):
    """Base exception for multi-agent workflow orchestration errors."""

    def __init__(self, message: str, code: str = "AGENT_WORKFLOW_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


class AgentWorkflowDisabledError(AgentWorkflowError):
    """Raised when multi-agent workflows are disabled by configuration."""

    def __init__(self, message: str = "Multi-agent workflows are disabled in settings."):
        super().__init__(message, code="AGENT_WORKFLOWS_DISABLED")


class AgentRunNotFoundError(AgentWorkflowError):
    """Raised when an agent run cannot be found or is unauthorized."""

    def __init__(self, message: str = "Agent workflow run not found."):
        super().__init__(message, code="AGENT_RUN_NOT_FOUND")


class AgentReportNotFoundError(AgentWorkflowError):
    """Raised when an analysis report cannot be found or is unauthorized."""

    def __init__(self, message: str = "Analysis report not found."):
        super().__init__(message, code="ANALYSIS_REPORT_NOT_FOUND")


class AgentApprovalError(AgentWorkflowError):
    """Raised when workflow approval fails validation, hash check, or state rules."""

    def __init__(self, message: str = "Invalid or expired workflow approval."):
        super().__init__(message, code="AGENT_APPROVAL_INVALID")


class AgentConcurrencyLimitError(AgentWorkflowError):
    """Raised when concurrent workflow execution limit is reached."""

    def __init__(self, message: str = "Maximum concurrent agent runs reached. Please wait."):
        super().__init__(message, code="AGENT_CONCURRENCY_LIMIT")


class AgentExecutionLimitError(AgentWorkflowError):
    """Raised when step, LLM call, or SQL query limits are exceeded."""

    def __init__(self, message: str = "Workflow execution limit exceeded."):
        super().__init__(message, code="AGENT_EXECUTION_LIMIT")


class AgentArtifactNotFoundError(AgentWorkflowError):
    """Raised when a bounded result artifact is missing or expired."""

    def __init__(self, message: str = "Result artifact not found or expired."):
        super().__init__(message, code="AGENT_ARTIFACT_NOT_FOUND")
