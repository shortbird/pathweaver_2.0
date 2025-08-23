from supabase import create_client, Client
from config import Config

def get_supabase_client() -> Client:
    if not Config.SUPABASE_URL or not Config.SUPABASE_KEY:
        raise ValueError("Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_KEY environment variables.")
    return create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)

def get_supabase_admin_client() -> Client:
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        raise ValueError("Missing Supabase admin configuration. Check SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.")
    return create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_KEY)