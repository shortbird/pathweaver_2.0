"""The memory watchdog must alert on the working set, not raw cgroup usage.

`memory.current` includes the page cache. Inactive file pages are reclaimed
long before the OOM killer fires, so alerting on the raw number produced a
stream of "93% — nearing OOM" warnings on a container whose processes held
~140MB (Sentry OPTIO-BACKEND-B).
"""

import builtins
import io

import pytest

from middleware.memory_monitor import MemoryMonitor


CGROUP_V2 = {
    '/sys/fs/cgroup/memory.current': '499122176\n',      # 476 MB
    '/sys/fs/cgroup/memory.max': '536870912\n',          # 512 MB
    '/sys/fs/cgroup/memory.stat': 'anon 200000000\ninactive_file 209715200\nslab 1000\n',
}

CGROUP_V1 = {
    '/sys/fs/cgroup/memory/memory.usage_in_bytes': '499122176\n',
    '/sys/fs/cgroup/memory/memory.limit_in_bytes': '536870912\n',
    '/sys/fs/cgroup/memory/memory.stat': 'total_rss 200000000\ntotal_inactive_file 209715200\n',
}


def fake_open(files):
    real_open = builtins.open

    def _open(path, *args, **kwargs):
        if isinstance(path, str) and path.startswith('/sys/fs/cgroup'):
            if path in files:
                return io.StringIO(files[path])
            raise FileNotFoundError(path)
        return real_open(path, *args, **kwargs)

    return _open


@pytest.mark.parametrize('files', [CGROUP_V2, CGROUP_V1], ids=['v2', 'v1'])
def test_inactive_file_is_excluded_from_the_working_set(monkeypatch, files):
    monkeypatch.setattr(builtins, 'open', fake_open(files))

    working_set, limit, raw = MemoryMonitor()._read_cgroup_memory()

    assert raw == 499122176
    assert limit == 536870912
    # 476MB raw - 200MB reclaimable cache = 276MB, i.e. 54% not 93%.
    assert working_set == 499122176 - 209715200
    assert working_set / limit < 0.85


def test_missing_memory_stat_falls_back_to_raw_usage(monkeypatch):
    files = {k: v for k, v in CGROUP_V2.items() if not k.endswith('memory.stat')}
    monkeypatch.setattr(builtins, 'open', fake_open(files))

    working_set, limit, raw = MemoryMonitor()._read_cgroup_memory()

    assert working_set == raw == 499122176
    assert limit == 536870912


def test_no_cgroup_reports_nothing(monkeypatch):
    monkeypatch.setattr(builtins, 'open', fake_open({}))

    assert MemoryMonitor()._read_cgroup_memory() == (None, None, None)
