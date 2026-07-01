"""
Programs package (backend).

The registry of the platform's custom programs. Core code consults it instead of
importing a specific program's module, so adding a program is a registry entry
rather than a core edit. See programs/registry.py and
docs/ARCHITECTURE_CORE_AND_PROGRAMS.md.
"""
