"""
Is this "link" really a path to a file on the student's own device?

Ticket d0cc8d45: a student on a Chromebook pasted
`file:///home/chronos/u-.../MyFiles/Downloads/Screenshot ....png` into the
evidence Link picker. It saved as a link block, the file never left her
machine, and the teacher's grader showed nothing -- 14 blocks before anyone
noticed. The web and mobile editors now refuse these, but an older cached
bundle, an un-updated mobile build or a direct API call still reached the
save route, so the server refuses them too.

The same rule lives in web/src/utils/localFilePath.js and
mobile/src/utils/localFilePath.ts. Keep the three in step.
"""

import re
from typing import Any, Iterable, Set

# Schemes that only mean something on the device that made them.
_DEVICE_SCHEME = re.compile(r'^(file|blob|content):', re.I)
# C:\Users\... or C:/Users/...
_WINDOWS_DRIVE = re.compile(r'^[a-z]:[\\/]', re.I)
# \\server\share
_UNC_PATH = re.compile(r'^\\\\[^\\]')
# Bare absolute paths on macOS, Linux, ChromeOS, Android, and ~/ shorthand.
_BARE_LOCAL_PATH = re.compile(r'^(~/|/(home|Users|mnt|media|Volumes|storage|sdcard)/)')
# ChromeOS's user directory, wherever it appears in a non-web string.
_CHROMEOS_USER_DIR = re.compile(r'(^|/)chronos/u-', re.I)
_WEB_SCHEME = re.compile(r'^https?:', re.I)

# The student's words, the same as the clients' LOCAL_FILE_PATH_MESSAGE.
LOCAL_FILE_PATH_MESSAGE = (
    "That's a file on your computer, not a link, so no one else can open it. "
    "Use Upload to add the file instead."
)


def is_local_file_path(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    v = value.strip()
    if not v:
        return False
    if (_DEVICE_SCHEME.search(v) or _WINDOWS_DRIVE.search(v)
            or _UNC_PATH.search(v) or _BARE_LOCAL_PATH.search(v)):
        return True
    return not _WEB_SCHEME.search(v) and bool(_CHROMEOS_USER_DIR.search(v))


def link_block_urls(content: Any) -> Iterable[str]:
    """Every URL a link block carries: the legacy content.url and content.items[].url."""
    if not isinstance(content, dict):
        return []
    urls = [content.get('url')]
    items = content.get('items')
    if isinstance(items, list):
        urls.extend(i.get('url') for i in items if isinstance(i, dict))
    return [u for u in urls if isinstance(u, str)]


def new_local_paths(blocks: Iterable[Any], already_saved: Set[str]) -> Set[str]:
    """Local paths in link blocks that are not already on the stored document.

    One that was saved before the fix stays: refusing it would make every
    later edit to that document fail, and dropping it would erase the
    student's record along with the reviewer's "never uploaded" note.
    """
    found = set()
    for block in blocks:
        if not isinstance(block, dict) or block.get('type') != 'link':
            continue
        for url in link_block_urls(block.get('content')):
            if is_local_file_path(url) and url not in already_saved:
                found.add(url)
    return found
