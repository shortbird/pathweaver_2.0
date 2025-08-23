from flask import Flask, jsonify, request, make_response
from flask_cors import CORS
from dotenv import load_dotenv
import os

from routes import auth, quests, subscriptions, users, admin, community

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')

# More permissive CORS for debugging
CORS(app, 
     origins=['https://pathweaver-2-0.vercel.app', 'http://localhost:3000'],
     allow_headers=['Content-Type', 'Authorization'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     supports_credentials=True)

app.register_blueprint(auth.bp, url_prefix='/api/auth')
app.register_blueprint(quests.bp, url_prefix='/api/quests')
app.register_blueprint(subscriptions.bp, url_prefix='/api/subscriptions')
app.register_blueprint(users.bp, url_prefix='/api/users')
app.register_blueprint(admin.bp, url_prefix='/api/admin')
app.register_blueprint(community.bp, url_prefix='/api/community')

@app.route('/api/health')
def health_check():
    return jsonify({'status': 'healthy'}), 200

@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = make_response()
        response.headers.add("Access-Control-Allow-Origin", "https://pathweaver-2-0.vercel.app")
        response.headers.add('Access-Control-Allow-Headers', "*")
        response.headers.add('Access-Control-Allow-Methods', "*")
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)