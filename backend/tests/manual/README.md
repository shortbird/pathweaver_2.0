# Manual Test Scripts

This directory contains manual test scripts that are NOT run by pytest. These are standalone scripts for testing, debugging, or validating specific functionality.

## Scripts

### test_imscc_parser.py
Tests IMSCC (IMS Common Cartridge) file parsing functionality.

**Purpose**: Validate that LMS course packages are correctly parsed into Optio quests, tasks, and badges.

**How to use**:
1. Obtain a sample `.imscc` file (Canvas LMS export)
2. Update the `file_path` variable in the script to point to your file
3. Run directly: `python backend/tests/manual/test_imscc_parser.py`

**Expected output**:
- Course title and metadata
- Module count
- Assignment count
- Quest preview (title, type, total tasks)
- Badge preview (name, min XP, min quests)
- First 5 tasks with XP values

**Requirements**: IMSCCParserService must be functional

---

### test_quest_generator.py
Tests AI-powered quest concept generation using Gemini.

**Purpose**: Validate that the AI can generate unique, creative quest concepts and avoid duplicates.

**How to use**:
1. Ensure `GEMINI_API_KEY` is set in environment
2. Run directly: `python backend/tests/manual/test_quest_generator.py`

**Expected output**:
- Test 1: Basic quest generation (title + description)
- Test 2: Generation with avoid list (ensures no duplicates)
- Test 3: Generate 5 unique quest concepts

**Requirements**:
- GEMINI_API_KEY environment variable
- QuestAIService must be functional
- Internet connection

---

## Why Manual Tests?

These scripts are not automated pytest tests because:

1. **External dependencies**: Require specific files, API keys, or external services
2. **Manual validation**: Output requires human review for quality
3. **Development tools**: Used during feature development/debugging, not CI/CD
4. **Variable inputs**: Hardcoded paths/parameters that change per use case

## When to Use Manual Tests

- Validating new LMS integrations (IMSCC parsing)
- Testing AI quality/creativity (quest generation)
- Debugging specific edge cases with real data
- Demonstrating functionality to stakeholders
- Local development and experimentation

## Converting to Automated Tests

If a manual test becomes stable and repeatable:

1. Create mock fixtures for external dependencies
2. Move to appropriate test category (unit/integration)
3. Add assertions instead of print statements
4. Use pytest parametrization for multiple scenarios
5. Add to CI/CD workflow

Example:
```python
# Manual test (prints output)
def test_parse():
    result = parser.parse_imscc_file(file_content)
    print(f"Course: {result['course']['title']}")

# Automated test (asserts expectations)
def test_imscc_parser(sample_imscc_file):
    parser = IMSCCParserService()
    result = parser.parse_imscc_file(sample_imscc_file)
    assert result['success'] is True
    assert result['course']['title'] == 'Expected Course Title'
```

## Related Documentation

- [Backend Tests README](../README.md) - Main testing documentation
- [Quest AI Service](../../services/quest_ai_service.py) - Quest generation logic
- [IMSCC Parser Service](../../services/imscc_parser_service.py) - IMSCC parsing logic