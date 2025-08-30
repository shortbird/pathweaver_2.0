"""
Wrapper for the Flask app to catch startup errors in Railway
"""
import sys
import traceback

try:
    print("Starting Flask app import...")
    from app import app
    print("Flask app imported successfully!")
    
    # This is what gunicorn will import
    application = app
    
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