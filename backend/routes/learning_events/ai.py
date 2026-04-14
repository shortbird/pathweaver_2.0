"""AI-assisted captures: snap-to-learn, voice journal.

Split from routes/learning_events.py on 2026-04-14 (Q1).
"""

"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses LearningEventsService exclusively (service layer pattern)
- Only 1 direct database call for file upload verification (line 293-304, acceptable)
- Service layer properly encapsulates all CRUD operations
- File upload endpoint uses get_user_client for RLS enforcement (correct pattern)

Learning Events Routes
API endpoints for spontaneous learning moment capture
"""
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from services.learning_events_service import LearningEventsService
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)



from routes.learning_events import learning_events_bp



@learning_events_bp.route('/api/learning-events/snap-to-learn', methods=['POST'])
@require_auth
def snap_to_learn(user_id):
    """
    Snap-to-Learn: Upload photo, get AI pillar suggestion.
    Does NOT create the learning event - returns suggestions for student to confirm.

    Request: multipart/form-data with 'photo' file and optional 'text' field
    Response: {suggested_pillar, description, reflection_prompts[]}
    """
    try:
        if 'photo' not in request.files:
            return jsonify({'error': 'Photo file required'}), 400

        photo = request.files['photo']
        if not photo.filename:
            return jsonify({'error': 'Empty file'}), 400

        optional_text = request.form.get('text', '')

        # Read image data
        image_data = photo.read()
        if len(image_data) > 10 * 1024 * 1024:  # 10MB limit
            return jsonify({'error': 'Photo must be under 10MB'}), 400

        # AI analysis
        from services.snap_to_learn_ai_service import SnapToLearnAIService
        ai_service = SnapToLearnAIService()
        result = ai_service.analyze_image(image_data, optional_text=optional_text)

        return jsonify({
            'success': True,
            'suggested_pillar': result.get('suggested_pillar', 'stem'),
            'description': result.get('description', ''),
            'reflection_prompts': result.get('reflection_prompts', []),
        }), 200

    except Exception as e:
        logger.error(f"Snap-to-Learn error for user {user_id[:8]}: {str(e)}")
        return jsonify({'error': 'Failed to analyze image', 'message': str(e)}), 500


@learning_events_bp.route('/api/learning-events/voice', methods=['POST'])
@require_auth
def voice_journal(user_id):
    """
    Voice Journaling: Upload audio, get transcription + pillar suggestion.
    Does NOT create the learning event - returns transcription for student to confirm.

    Request: multipart/form-data with 'audio' file
    Response: {transcription, suggested_pillar, reflection_prompts[]}
    """
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'Audio file required'}), 400

        audio = request.files['audio']
        if not audio.filename:
            return jsonify({'error': 'Empty file'}), 400

        audio_data = audio.read()
        if len(audio_data) > 25 * 1024 * 1024:  # 25MB limit
            return jsonify({'error': 'Audio must be under 25MB'}), 400

        # Transcribe
        from services.transcription_service import TranscriptionService
        transcription_service = TranscriptionService()
        transcription_result = transcription_service.transcribe_audio(audio_data)

        transcription = transcription_result.get('transcription', '')

        # Suggest pillar from transcription
        suggested_pillar = 'stem'
        if transcription:
            suggested_pillar = transcription_service.suggest_pillar_from_text(transcription)

        return jsonify({
            'success': True,
            'transcription': transcription,
            'confidence': transcription_result.get('confidence', 0.0),
            'suggested_pillar': suggested_pillar,
            'reflection_prompts': ['What surprised you about this?', 'What do you want to explore next?'],
        }), 200

    except Exception as e:
        logger.error(f"Voice journal error for user {user_id[:8]}: {str(e)}")
        return jsonify({'error': 'Failed to process audio', 'message': str(e)}), 500
