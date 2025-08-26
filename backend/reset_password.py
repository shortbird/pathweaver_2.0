from supabase import create_client
import sys

# Connect to Supabase with service key
SUPABASE_URL = "https://vvfgxcykxjybtvpfzwyx.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2Zmd4Y3lreGp5YnR2cGZ6d3l4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTk4NDY1MCwiZXhwIjoyMDcxNTYwNjUwfQ.Q6CRSKT8_w4YYQ6b2P-GIlTw_a2UDyTpSbwopHCJsmw"

client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Get the user
users = client.table('users').select('*').execute()
if not users.data:
    print("No users found!")
    sys.exit(1)

user = users.data[0]
print(f"Found user: {user.get('first_name')} {user.get('last_name')}")
print(f"User ID: {user.get('id')}")

# Get the email from auth.users table
auth_user = client.auth.admin.get_user_by_id(user['id'])
email = auth_user.user.email
print(f"Email: {email}")

# Update the password
try:
    response = client.auth.admin.update_user_by_id(
        user['id'],
        {"password": "testing123"}
    )
    print("\n[SUCCESS] Password successfully reset to: testing123")
    print(f"\nYou can now log in with:")
    print(f"Email: {email}")
    print(f"Password: testing123")
except Exception as e:
    print(f"\n[ERROR] Failed to reset password: {e}")
    print("\nTrying alternative method...")
    
    # Alternative: Create a password reset link
    try:
        reset_link = client.auth.admin.generate_link({
            "type": "recovery",
            "email": email
        })
        print(f"\n[SUCCESS] Password reset link generated:")
        print(f"{reset_link}")
        print("\nUse this link to reset your password in the browser.")
    except Exception as e2:
        print(f"[ERROR] Alternative method also failed: {e2}")