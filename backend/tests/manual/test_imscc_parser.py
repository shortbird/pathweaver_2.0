"""
Quick test script to parse IMSCC file locally
"""

from services.imscc_parser_service import IMSCCParserService
import json

def test_parse():
    parser = IMSCCParserService()

    # Read the IMSCC file
    file_path = r"C:\Users\tanne\Desktop\pw_v2\25f-3d-design-modeling-animation-and-printing-export.imscc"

    print(f"Reading file: {file_path}")
    with open(file_path, 'rb') as f:
        file_content = f.read()

    print(f"File size: {len(file_content) / (1024*1024):.2f} MB\n")

    # Parse the file
    print("Parsing IMSCC file...\n")
    result = parser.parse_imscc_file(file_content)

    if result['success']:
        print("[OK] Parse successful!\n")
        print(f"Course: {result['course']['title']}")
        print(f"Modules: {len(result['course']['modules'])}")
        print(f"Assignment refs: {len(result['course']['assignment_refs'])}")
        print(f"Resources: {len(result['course'].get('resources', {}))}")
        print()

        print(f"\nBadge preview:")
        print(f"  Name: {result['badge_preview']['name']}")
        print(f"  Min quests: {result['badge_preview']['min_quests']}")
        print(f"  Min XP: {result['badge_preview']['min_xp']} XP (sum of all assignment Canvas points)")
        print(f"  Total Canvas points: {result['badge_preview']['total_canvas_points']}")
        print(f"  Total assignments: {result['badge_preview']['metadata']['total_assignments']}")

        print(f"\nQuest preview:")
        print(f"  Title: {result['quest_preview']['title']}")
        print(f"  Type: {result['quest_preview']['quest_type']}")
        print(f"  Platform: {result['quest_preview']['lms_platform']}")
        print(f"  Total tasks: {result['quest_preview']['metadata']['total_assignments']}")

        print(f"\nTasks preview: {len(result['tasks_preview'])} tasks")
        if result['tasks_preview']:
            print("First 5 tasks:")
            for task in result['tasks_preview'][:5]:
                print(f"  - {task['title']}")
                print(f"    XP: {task['xp_value']} (Canvas points: {task['metadata']['canvas_points']})")
            if len(result['tasks_preview']) > 5:
                print(f"  ... and {len(result['tasks_preview']) - 5} more tasks")

    else:
        print(f"[FAIL] Parse failed: {result.get('error')}")

if __name__ == '__main__':
    test_parse()
