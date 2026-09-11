"""Shared rules for a document a school uploads.

Class materials, curriculum materials and quest resources all accept the same
kinds of file, into the same private bucket, under the same size cap -- and each
had its own copy of the three constants. A copy that drifts is not a style
problem here: the extension set is a security boundary (it is what stops an
.html or an .svg being uploaded and then served back to a browser from the
school's own domain), so a third copy that quietly grows a member is a hole
nobody is looking at.

The bucket is PRIVATE. What is stored is a canonical pointer, not a fetchable
URL; every read signs it for the requester (utils/storage_urls.py).
"""

#: Where a school's documents live. Private; see the note above.
DOCUMENT_BUCKET = 'org-documents'

#: What may be uploaded. Deliberately NOT open-ended: no .html, .svg or .js,
#: which a browser would execute if it were ever served inline.
DOCUMENT_EXTENSIONS = {'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
                       'png', 'jpg', 'jpeg', 'webp', 'gif', 'txt', 'csv'}

#: 25 MB, matching MAX_DOCUMENT_SIZE in config/constants.py.
MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

#: Titles are shown in lists; long enough for a real filename, short enough that
#: one row cannot push a page sideways.
MAX_TITLE_LEN = 300
