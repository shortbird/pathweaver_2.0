"""
Main entry point for the Flask application.
This file is required because Render is configured to run 'python main.py'
"""

from app import app

from utils.logger import get_logger

logger = get_logger(__name__)

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)