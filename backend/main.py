"""
Main entry point for the Flask application.
This file is required because Render is configured to run 'python main.py'
"""

from app import app

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)