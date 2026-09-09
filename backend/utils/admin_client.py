"""One accessor for the RLS-bypassing Supabase client.

Sixty-one modules across `routes/`, `services/` and `utils/` had written the
identical three-line helper:

    def _admin():
        return get_supabase_admin_client()

Every copy was the same code; what differed was the *reason* each module had for
reaching past RLS, recorded in a comment inside the body. Those reasons are the
valuable part, and they stayed: each module now carries its justification above
the import below, and `tests/unit/test_admin_client_justified.py` still requires
one there. Consolidating the code without consolidating the reasons would have
been the wrong trade — the reason is the only part a reviewer needs.

WHY THE IMPORT IS INSIDE THE FUNCTION. Five of the sixty-one deliberately
imported `database` lazily, because `database` imports `Config` and those
modules are imported from inside Config-consuming code; a module-scope import
here would have re-created the cycle they were avoiding. Doing it lazily in the
one shared definition means importing THIS module is always safe, from anywhere,
and `utils/org_secrets.py` can keep being importable without database config so
its pure helpers stay testable on every push.

WHAT THIS IS NOT. It is not an authorization decision. The admin client bypasses
Row Level Security completely: it can read and write every row belonging to
every family in every organization. Nothing here checks anything. The caller is
responsible for having established, before it gets here, that the request is
allowed — a role decorator, a relationship gate, a verified webhook signature,
or a token that is itself the auth surface. See `utils/auth/relationships.py`.
"""


def admin_client():
    """The service-role Supabase client. Bypasses RLS; see the module docstring.

    Callers import this as `_admin`, which is the name all sixty-one copies
    used, so call sites are unchanged.
    """
    from database import get_supabase_admin_client
    # admin client justified: this function IS the accessor. The justification
    # that matters is at each import site, where the module says why it needs to
    # bypass RLS; there is nothing to justify here beyond returning the client.
    return get_supabase_admin_client()
