"""Service layer.

This file exists so `services` is a regular package like every other directory
here (routes, repositories, utils, middleware, jobs, modules all have one). It
was the only namespace package left, which made mypy resolve
services/daily_summary_service.py under two module names at once and refuse to
check anything: "Source file found twice under different module names".

Deliberately empty otherwise -- services are imported by their own module paths,
and re-exporting them here would create a second name for each one.
"""
