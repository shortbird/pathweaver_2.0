#!/usr/bin/env python3
"""
Test if Gemini API is properly configured
"""
import os
from dotenv import load_dotenv
import google.generativeai as genai

def test_gemini():
    """Test Gemini API configuration"""
    
    load_dotenv()
    
    print("Testing Gemini API Configuration")
    print("=" * 50)
    
    api_key = os.getenv('GEMINI_API_KEY')
    
    if not api_key:
        print("❌ ERROR: GEMINI_API_KEY not found in environment variables!")
        print("\nTo fix this:")
        print("1. Get an API key from: https://makersuite.google.com/app/apikey")
        print("2. Add to your .env file: GEMINI_API_KEY=your-key-here")
        print("3. Or set in production environment variables")
        return False
    
    print(f"✅ API Key found (length: {len(api_key)})")
    
    try:
        # Configure and test the API
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        print("✅ Gemini model initialized")
        
        # Try a simple generation
        print("\nTesting generation...")
        response = model.generate_content("Say 'API test successful' and nothing else.")
        print(f"✅ Response: {response.text.strip()}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error testing Gemini: {str(e)}")
        print("\nPossible issues:")
        print("- Invalid API key")
        print("- API key not activated")
        print("- Network/firewall issues")
        return False

if __name__ == "__main__":
    test_gemini()