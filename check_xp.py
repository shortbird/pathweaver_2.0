import requests
import json

# From the console logs we saw earlier, the user_id is: ad8e119c-0685-4431-8381-527273832ca9
user_id = "ad8e119c-0685-4431-8381-527273832ca9"
print(f"Checking XP for user_id: {user_id}")

# Check XP status
check_response = requests.get(f'http://localhost:5000/test_xp/check/{user_id}')
if check_response.status_code == 200:
    print("\n=== XP CHECK RESULTS ===")
    xp_data = check_response.json()
    print(json.dumps(xp_data, indent=2))
    
    # Check if there are discrepancies
    if xp_data['checks'].get('discrepancies'):
        print("\n⚠️ Discrepancies found!")
        print(f"Total Expected XP: {xp_data['checks']['total_expected_xp']}")
        print(f"Total Actual XP: {xp_data['checks']['total_actual_xp']}")
        
        # Auto-fix the XP
        print("\nAttempting to fix XP...")
        fix_response = requests.post(f'http://localhost:5000/test_xp/fix/{user_id}')
        if fix_response.status_code == 200:
            print("\n✅ XP FIXED!")
            print(json.dumps(fix_response.json(), indent=2))
        else:
            print(f"\n❌ Failed to fix XP: {fix_response.text}")
    else:
        print("\n✅ No discrepancies found - XP is correct!")
else:
    print(f"Failed to check XP: {check_response.text}")