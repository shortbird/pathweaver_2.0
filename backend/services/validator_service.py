import os
import json
import google.generativeai as genai
from supabase import create_client, Client
from datetime import datetime

class ValidatorService:
    def __init__(self):
        self.supabase: Client = create_client(
            os.environ.get('SUPABASE_URL'),
            os.environ.get('SUPABASE_SERVICE_KEY')
        )
        genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))
        self.model = genai.GenerativeModel('gemini-1.5-flash')
    
    def get_seed_prompt(self):
        """Fetch the current AI seed prompt from database"""
        response = self.supabase.table('ai_seeds').select('prompt_text').eq('prompt_name', 'primary_seed').single().execute()
        return response.data['prompt_text'] if response.data else "Validate quest submissions fairly and provide constructive feedback."
    
    def validate_submission(self, submission_id, quest_id, user_id, submission_text, submission_links=None):
        """Validate a user's quest submission"""
        # Fetch quest details
        quest_response = self.supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not quest_response.data:
            print(f"Quest {quest_id} not found")
            return None
        
        quest = quest_response.data
        seed_prompt = self.get_seed_prompt()
        
        prompt = f"""
        {seed_prompt}
        
        Validate this quest submission based on the quest requirements.
        
        Quest Details:
        Title: {quest['title']}
        Description: {quest['description']}
        Requirements: {quest.get('requirements', 'Not specified')}
        Learning Outcomes: {quest.get('learning_outcomes', 'Not specified')}
        
        User's Submission:
        Text: {submission_text}
        Links: {submission_links if submission_links else 'No links provided'}
        
        Evaluate the submission on these criteria:
        1. Completeness (25%): Are all requirements addressed?
        2. Quality (25%): Is the work well-executed?
        3. Understanding (25%): Does the submission show comprehension of the learning outcomes?
        4. Effort (25%): Is there evidence of genuine effort and engagement?
        
        Provide your response in this exact JSON format:
        {{
            "validation_score": <number between 0 and 100>,
            "validation_summary": "Brief summary of the validation",
            "feedback": {{
                "strengths": ["What was done well"],
                "improvements": ["Areas for improvement"],
                "completeness": "Assessment of requirement completion"
            }},
            "status": "approved|needs_review|rejected",
            "xp_awarded": <percentage of quest XP to award, 0-100>
        }}
        
        Scoring guidelines:
        - 80-100: Excellent submission, auto-approve, full XP
        - 60-79: Good submission with minor issues, needs educator review
        - 0-59: Incomplete or poor quality, rejected, provide constructive feedback
        """
        
        try:
            response = self.model.generate_content(prompt)
            validation_data = json.loads(response.text)
            
            # Calculate XP to award
            xp_percentage = validation_data['xp_awarded'] / 100
            xp_awarded = int(quest.get('xp_reward', 100) * xp_percentage)
            
            # Update submission with validation data
            update_data = {
                'ai_validation_score': validation_data['validation_score'],
                'ai_validation_summary': json.dumps({
                    'summary': validation_data['validation_summary'],
                    'feedback': validation_data['feedback']
                }),
                'validated_at': datetime.utcnow().isoformat()
            }
            
            # Determine final status
            if validation_data['validation_score'] >= 80:
                update_data['status'] = 'approved'
                update_data['xp_awarded'] = xp_awarded
                
                # Award XP to user
                user_response = self.supabase.table('users').select('xp').eq('id', user_id).single().execute()
                if user_response.data:
                    current_xp = user_response.data.get('xp', 0)
                    self.supabase.table('users').update({
                        'xp': current_xp + xp_awarded
                    }).eq('id', user_id).execute()
                
                print(f"Submission approved! Awarded {xp_awarded} XP")
                
            elif validation_data['validation_score'] >= 60:
                update_data['status'] = 'pending_review'
                print(f"Submission needs educator review (score: {validation_data['validation_score']})")
                
            else:
                update_data['status'] = 'rejected'
                update_data['xp_awarded'] = 0
                print(f"Submission rejected (score: {validation_data['validation_score']})")
            
            # Update the submission
            self.supabase.table('submissions').update(update_data).eq('id', submission_id).execute()
            
            return validation_data
            
        except Exception as e:
            print(f"Error validating submission: {str(e)}")
            return None
    
    def process_pending_submissions(self):
        """Process all pending submissions"""
        print("Processing pending submissions...")
        
        # Fetch all pending submissions
        response = self.supabase.table('submissions').select('*').eq('status', 'pending').execute()
        
        if not response.data:
            print("No pending submissions to process")
            return []
        
        results = []
        for submission in response.data:
            print(f"Validating submission {submission['id']}")
            # Skip if quest_id is missing
            if 'quest_id' not in submission:
                print(f"Skipping submission {submission['id']} - no quest_id")
                continue
            validation = self.validate_submission(
                submission['id'],
                submission['quest_id'],
                submission['user_id'],
                submission.get('submission_text', ''),
                submission.get('submission_links')
            )
            if validation:
                results.append({
                    'submission_id': submission['id'],
                    'validation': validation
                })
        
        print(f"Processed {len(results)} submissions")
        return results