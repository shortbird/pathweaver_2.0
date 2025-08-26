import os
from dotenv import load_dotenv

# Load from current directory's .env file (backend/.env)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key')
    # Use the VITE_SUPABASE_URL for the API URL (not the PostgreSQL URL)
    SUPABASE_URL = os.getenv('VITE_SUPABASE_URL') or os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('VITE_SUPABASE_ANON_KEY') or os.getenv('supabase_anon_key') or os.getenv('SUPABASE_KEY')
    SUPABASE_SERVICE_KEY = os.getenv('supabase_service_role_key') or os.getenv('SUPABASE_SERVICE_KEY')
    STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
    STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')