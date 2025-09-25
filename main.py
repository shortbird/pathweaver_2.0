#!/usr/bin/env python3
"""
Entry point for Render deployment.
This file exists to maintain compatibility with Render service configuration.
The actual Flask application is located in backend/app.py
"""

import sys
import os

# Add the backend directory to the Python path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
sys.path.insert(0, backend_dir)

# Import and run the Flask application
if __name__ == '__main__':
    from app import app

    # Get port from environment (Render sets this)
    port = int(os.environ.get('PORT', 5000))

    # Run the Flask app
    app.run(host='0.0.0.0', port=port, debug=False)