"""Optio's building-block module system. See docs/ARCHITECTURE_BLOCKS.md.

Import from the package, not the submodules:

    from modules import module_enabled, enabled_set, MODULES
"""

from modules.registry import MODULES, ModuleDef  # noqa: F401
from modules.enabled import (  # noqa: F401
    ORG_ROW_COLUMNS,
    effective_modules_for_row,
    effective_modules_list,
    enabled_set,
    module_enabled,
    module_enabled_for_row,
)
from modules.gate import module_guard, require_module  # noqa: F401
