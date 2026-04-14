# ADR-002 — Backend layer architecture

**Status:** Accepted · 2026-04-14
**Context:** A1/A2 from the 2026-04-14 audit — repository pattern is
~50% adopted, creating ambiguity about where business logic belongs.

## Decision

The backend has four layers with a strict downward flow. Lint test
[`test_import_layers.py`](../backend/tests/unit/test_import_layers.py)
enforces this.

```
routes/        -> HTTP concerns, input validation, response shaping. Thin.
services/      -> Business logic, orchestration across multiple repositories.
repositories/  -> Data access. One class per table (or logical aggregate).
utils/         -> Pure helpers. No HTTP, no DB.
```

**Allowed dependencies:**

| Layer          | May import from                                                  |
|----------------|------------------------------------------------------------------|
| `routes/`      | `services`, `repositories`, `utils`, `middleware`, `exceptions`, `database`, `app_config`, `config`, `prompts`, `schemas` |
| `services/`    | `repositories`, `utils`, `exceptions`, `database`, `app_config`, `config`, `prompts`, `schemas`, other `services` |
| `repositories/` | `utils`, `exceptions`, `database`, `app_config`, `config`, other `repositories` |
| `utils/`       | other `utils`, `exceptions`, `app_config`, `config`              |
| `middleware/`  | `utils`, `exceptions`, `app_config`, `config`                    |

**Forbidden (examples):**

- `repositories/` importing `services/` or `routes/`
- `services/` importing `routes/`
- `utils/` importing `routes`, `services`, `repositories`, `middleware`

## Rule for new code

Any new endpoint **must** use the repository pattern:

```python
# ✅ New code
from repositories.task_repository import TaskRepository

@bp.route('/api/...')
def my_endpoint(user_id: str):
    repo = TaskRepository(client=get_user_client())
    data = repo.get_things(user_id)
    ...
```

Direct `get_user_client()` / `get_supabase_client()` calls in routes are
frozen at the baseline in
[`test_new_routes_use_repositories.py`](../backend/tests/unit/test_new_routes_use_repositories.py);
it will fail CI if the count grows.

Legacy direct-DB code is grandfathered. Refactor when touching for other
reasons — don't tolerate the pattern, but don't force a large one-shot
migration either.

## Consequences

- **Testability:** services can be unit-tested by mocking repositories
  rather than the Supabase client.
- **Review cost:** reviewers know where to look for a given concern —
  HTTP in routes, rules in services, queries in repositories.
- **Migration friction:** existing 8 layer-violation sites (see
  `test_import_layers.py` baseline) need to be refactored over time.

## Related

- [Repository pattern guide](../backend/docs/REPOSITORY_PATTERN.md)
- [Repository migration status](../backend/docs/REPOSITORY_MIGRATION_STATUS.md)
- A3 (importlinter-style lint): `backend/tests/unit/test_import_layers.py`
