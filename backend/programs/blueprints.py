"""
Program blueprint registration.

Registers each custom program's Flask blueprints so the core composition root
(routes/__init__.py) wires programs through one seam instead of naming each one.
The program routes still live in their own modules; this centralizes their
wiring. See programs/registry.py and docs/ARCHITECTURE_CORE_AND_PROGRAMS.md.
"""


def register_program_blueprints(app):
    """Register every custom-program blueprint on the Flask app."""
    # Hearthwood Academy diploma plan (legacy internal name: OEA / opened-academy)
    from routes import oea
    app.register_blueprint(oea.bp)

    # The Treehouse microschool
    from routes import treehouse
    app.register_blueprint(treehouse.bp)

    # Pipe Organ Encounter pilot (public interest capture + admin queue)
    from routes.poe import bp as poe_bp
    app.register_blueprint(poe_bp)
    from routes.admin import poe as admin_poe
    app.register_blueprint(admin_poe.bp)
