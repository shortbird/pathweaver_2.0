"""
Wrapper for the Flask app to catch startup errors in Railway
"""
import sys
import traceback

try:
    print("Starting Flask app import...")
    import sys
    sys.stdout.flush()
    
    from app import app
    print("Flask app imported successfully!")
    sys.stdout.flush()
    
    # Add a simple root route if it doesn't exist
    if '/' not in [rule.rule for rule in app.url_map.iter_rules()]:
        @app.route('/')
        def root():
            from flask import jsonify
            return jsonify({"status": "running", "message": "Optio Quest Platform API"}), 200
    
    # This is what gunicorn will import
    application = app
    print(f"Application ready: {application}")
    sys.stdout.flush()
    
except Exception as e:
    print(f"FATAL ERROR during app startup: {str(e)}")
    print("Full traceback:")
    traceback.print_exc()
    
    # Create a minimal app that will at least respond
    from flask import Flask, jsonify
    app = Flask(__name__)
    
    @app.route('/')
    def error_root():
        return jsonify({
            "error": "Application failed to start",
            "message": str(e),
            "details": "Check Railway logs for full traceback"
        }), 500
    
    @app.route('/api/health')
    def error_health():
        return jsonify({
            "status": "error",
            "message": "Application failed to start",
            "error": str(e)
        }), 500
    
    application = app