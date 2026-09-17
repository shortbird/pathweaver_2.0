"""One CSV download for every SIS export route.

Five routes each built the same thing by hand -- a StringIO, a csv.writer, a
Response with the mimetype and the attachment header -- and one of them said
in a comment that it was copying another (docs/icreate/
FRANKENSTEIN_AUDIT_2026-09-17.md, K5). This is the copy they all call.
"""

import csv
import io
from typing import Iterable, Optional, Sequence

from flask import Response


def csv_response(filename: str, header: Optional[Sequence], rows: Iterable[Sequence]) -> Response:
    """`header` is the first row, or None/empty for none -- the grid reports
    carry their own headings inside the rows, and a blank first line reads as
    a broken file."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    if header:
        writer.writerow(header)
    for row in rows:
        writer.writerow(row)
    return Response(
        buf.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename={filename}'},
    )
