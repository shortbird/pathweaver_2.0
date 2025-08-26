import os
import json
import google.generativeai as genai
from supabase import create_client, Client

class GraderService:
    def __init__(self):
        self.supabase: Client = create_client(
            os.environ.get('SUPABASE_URL'),
            os.environ.get('SUPABASE_SERVICE_KEY')
        )
        genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))
        self.model = genai.GenerativeModel('gemini-pro')
    
    def get_seed_prompt(self):
        """Fetch the current AI seed prompt from database"""
        response = self.supabase.table('ai_seeds').select('prompt_text').eq('prompt_name', 'primary_seed').single().execute()
        return response.data['prompt_text'] if response.data else "Grade quests based on educational value, clarity, engagement, and feasibility."
    
    def grade_quest(self, quest):
        """Grade a single quest using AI"""
        seed_prompt = self.get_seed_prompt()
        
        prompt = f"""
        {seed_prompt}
        
        Grade the following quest on a scale of 0-100 based on these criteria:
        
        1. Educational Value (25 points): Does it teach valuable skills or knowledge?
        2. Clarity (25 points): Are the requirements and objectives clear?
        3. Engagement (25 points): Is it interesting and motivating?
        4. Feasibility (25 points): Can it be reasonably completed by the target audience?
        
        Quest Details:
        Title: {quest['title']}
        Description: {quest['description']}
        Pillar: {quest['pillar']}
        Difficulty: {quest.get('difficulty', 'Not specified')}
        Requirements: {quest.get('requirements', 'Not specified')}
        Learning Outcomes: {quest.get('learning_outcomes', 'Not specified')}
        
        Provide your response in this exact JSON format:
        {{
            "score": <number between 0 and 100>,
            "feedback": "Detailed feedback explaining the score",
            "strengths": ["strength 1", "strength 2"],
            "weaknesses": ["weakness 1", "weakness 2"],
            "recommendation": "approve|review|reject"
        }}
        
        Scoring guidelines:
        - 90-100: Exceptional quest, auto-approve
        - 60-89: Good quest with minor issues, send for review
        - 0-59: Poor quality, auto-reject
        """
        
        try:
            response = self.model.generate_content(prompt)
            grade_data = json.loads(response.text)
            
            # Update quest with grading information
            update_data = {
                'ai_grade_score': grade_data['score'],
                'ai_grade_feedback': json.dumps({
                    'feedback': grade_data['feedback'],
                    'strengths': grade_data['strengths'],
                    'weaknesses': grade_data['weaknesses']
                })
            }
            
            # Determine status based on score
            if grade_data['score'] >= 90:
                update_data['status'] = 'approved'
                update_data['is_active'] = True
            elif grade_data['score'] >= 60:
                update_data['status'] = 'pending_review'
            else:
                # Low score - mark for deletion
                update_data['status'] = 'rejected'
            
            # Update the quest
            self.supabase.table('quests').update(update_data).eq('id', quest['id']).execute()
            
            # If rejected, delete the quest
            if update_data['status'] == 'rejected':
                self.supabase.table('quests').delete().eq('id', quest['id']).execute()
                print(f"Quest '{quest['title']}' rejected and deleted (score: {grade_data['score']})")
            else:
                print(f"Quest '{quest['title']}' graded: {update_data['status']} (score: {grade_data['score']})")
            
            return grade_data
            
        except Exception as e:
            print(f"Error grading quest: {str(e)}")
            return None
    
    def run_grading_cycle(self):
        """Grade all quests with 'generated' status"""
        print("Starting grading cycle...")
        
        # Fetch all generated quests
        response = self.supabase.table('quests').select('*').eq('status', 'generated').execute()
        
        if not response.data:
            print("No quests to grade")
            return []
        
        results = []
        for quest in response.data:
            print(f"Grading quest: {quest['title']}")
            grade = self.grade_quest(quest)
            if grade:
                results.append({
                    'quest_id': quest['id'],
                    'quest_title': quest['title'],
                    'grade': grade
                })
        
        print(f"Grading cycle complete. Processed {len(results)} quests.")
        return results