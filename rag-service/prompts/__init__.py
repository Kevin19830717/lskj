"""Prompts 包初始化"""

from prompts.system_prompt import (
    get_system_prompt_for_advice,
    get_system_prompt_for_medical_parser,
)
from prompts.advice_templates import (
    build_advice_user_prompt,
    build_medical_report_prompt,
    build_query_from_summary,
)

__all__ = [
    "get_system_prompt_for_advice",
    "get_system_prompt_for_medical_parser",
    "build_advice_user_prompt",
    "build_medical_report_prompt",
    "build_query_from_summary",
]
