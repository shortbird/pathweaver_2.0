"""
Parent Dashboard - Analytics, Calendar & Insights.
Part of parent_dashboard.py refactoring (P2-ARCH-1).
"""
from flask import Blueprint
from utils.logger import get_logger

logger = get_logger(__name__)
bp = Blueprint("parent_analytics", __name__, url_prefix="/api/parent")

