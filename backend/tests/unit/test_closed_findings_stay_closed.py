"""Guards for the findings that were closed and had nothing watching them.

docs/remediation-2026-09/CLOSED_FINDINGS.md has a section called "Closed but
unguarded": fixes that are in the tree and that nothing fails the build over.
Its own words -- "they are the ones that can quietly regress. Listed so a
reviewer knows where to look by hand."

Looking by hand is not a control. This file is the automatable half of that
list, one class per finding, so a failure names the finding rather than a
symptom. Each class says what it is guarding and what a failure means.

WHAT CANNOT BE GUARDED FROM THIS REPOSITORY, and why -- recorded here so the
absence reads as a decision rather than an oversight:

  SEC-14b, SEC-16b   Live Render environment variables (FLASK_SECRET_KEY_OLD,
                     ORG_SECRETS_ENCRYPTION_KEY). Nothing in a git repository
                     can assert the value of a variable in somebody's dashboard.
  FU-02, QB-05       Properties of the live Postgres catalog: whether a dropped
                     function stayed dropped, and whether the migration history
                     matches the files. An offline test sees neither.
  OPS-02             Half of it is dashboard state (which service serves which
                     domain, whether ffmpeg is installed). The repo half -- that
                     render.yaml still knows optio-marketing exists -- IS
                     guarded below.
  SEC-06             The code is deleted, so there is nothing to assert about
                     it. Two external leftovers are in REGISTER.md.
  OPS-04             The backup job's correctness lives in GCS and rclone. Its
                     three safety rails are in the workflow file and ARE
                     guarded below; whether last Sunday's run actually copied
                     anything is not visible from here.
"""

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]

#: The production Supabase project. It is legitimately named in code that talks
#: to production and in docs that tell a person which project to open; the
#: finding was that it shipped in the .env.example files a new developer copies.
PROD_PROJECT_REF = 'vvfgxcykxjybtvpfzwyx'


def _tracked(pattern: str):
    """Files matching `pattern`, ignoring other checkouts and build output."""
    skip = {'node_modules', 'venv', '.venv', 'dist', 'coverage', 'build', '.git'}
    for path in REPO_ROOT.glob(pattern):
        rel = path.relative_to(REPO_ROOT)
        if skip & set(rel.parts):
            continue
        # Directories only: the filenames we look for include `.env.example`,
        # which starts with a dot itself.
        if any(part.startswith('.') and part != '.github' for part in rel.parts[:-1]):
            continue
        yield path


def _strip_quoted(line: str) -> str:
    """A line with its double-quoted spans removed.

    A document is allowed to QUOTE the wrong text in order to correct it --
    CLAUDE.md's own note on the commit-scope rule does exactly that, and so does
    the header of REPOSITORY_MIGRATION_STATUS.md. What it may not do is state
    it. Stripping the quoted spans is the difference between a citation and an
    instruction, and it is decidable.
    """
    return re.sub(r'"[^"]*"|\u201c[^\u201d]*\u201d', '', line)


class TestSec04EnvExamplesNameNoRealProject:
    """SEC-04: `.env.example` shipped the production Supabase project ref.

    These are the files a new developer copies to `.env`. Naming the real
    project there means the default local setup points at production -- which is
    the same failure as OPS-01, arriving through the onboarding doc instead of
    through Render. CLOSED_FINDINGS.md says outright that "a one-line test
    asserting no tracked .env.example names vvfgxcykxjybtvpfzwyx would close
    this cheaply". This is that test.
    """

    def test_no_env_example_names_the_production_project(self):
        offenders = []
        for path in _tracked('**/.env.example'):
            if PROD_PROJECT_REF in path.read_text(encoding='utf-8', errors='replace'):
                offenders.append(str(path.relative_to(REPO_ROOT)))
        assert not offenders, (
            'These .env.example files name the PRODUCTION Supabase project:\n  '
            + '\n  '.join(offenders)
            + '\n\nUse `your-project-ref`. A developer who copies this to .env '
              'is pointed at real student records on their laptop.')

    def test_there_are_env_examples_to_check(self):
        """A guard on the guard: a glob that matches nothing passes forever."""
        found = list(_tracked('**/.env.example'))
        assert len(found) >= 3, (
            f'Only {len(found)} .env.example files found. There were three '
            '(root, backend, web) -- either the glob broke or they moved.')


class TestOps08OneOffScriptsRefuseToGuess:
    """OPS-08: ~70 hand-run production-repair scripts, 21 keyed to one account.

    The fix was `scripts/_target_user.py`: `--user-email` required with no
    default, and `--yes` on top for the ones that write. What can regress is a
    NEW script that hardcodes an email again, which is how the finding started.
    """

    SCRIPTS = sorted(_tracked('backend/scripts/*.py'))

    def test_the_resolver_still_refuses_to_default(self):
        source = (REPO_ROOT / 'backend/scripts/_target_user.py').read_text(encoding='utf-8')
        assert "required=True" in source, (
            '--user-email lost `required=True`. Refusing to guess is the whole '
            'point of this module; a default puts the old behaviour back.')
        assert "default=" not in source.split('add_argument(\n        \'--user-email\'')[-1][:400], (
            '--user-email gained a default.')
        assert "sys.exit(2)" in source, (
            'The --yes gate on mutating scripts is gone.')

    #: A literal email in a script is only a finding when the script operates
    #: on an account that ALREADY EXISTS. Seed and fixture scripts
    #: (seed_e2e_users, create_test_account, seed_icreate_parent_demo and the
    #: rest) name the account they are about to create, which is the opposite
    #: of guessing whose data to repair -- there is nothing for --user-email to
    #: resolve. So the rule is written against the two shapes that ARE the
    #: finding, rather than against every string containing an @.
    EMAIL = re.compile(r"['\"][A-Za-z0-9._%+-]+@(?!example\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}['\"]")
    EMAIL_LOOKUP = re.compile(r"""\.eq\(\s*['"]email['"]\s*,\s*['"][^'"]*@""")

    def test_no_script_looks_up_a_hardcoded_account(self):
        """Shape one: `.eq('email', 'someone@real.com')` -- a lookup of a real row."""
        offenders = []
        for path in self.SCRIPTS:
            for i, line in enumerate(path.read_text(encoding='utf-8', errors='replace').splitlines(), 1):
                if line.lstrip().startswith('#'):
                    continue
                if self.EMAIL_LOOKUP.search(line):
                    offenders.append(f'{path.relative_to(REPO_ROOT)}:{i}: {line.strip()[:90]}')
        assert not offenders, (
            'A script looks up an existing account by a hardcoded email:\n  '
            + '\n  '.join(offenders)
            + '\n\nTake --user-email through scripts/_target_user.py. A script '
              'that hardcodes whose data it touches is one copy-paste away from '
              'touching the wrong person\'s, and it gives no signal when it does '
              '-- it just succeeds, against somebody else.')

    def test_no_script_both_resolves_and_hardcodes(self):
        """Shape two: a script that takes --user-email AND names somebody.

        That is the halfway state the finding actually shipped in -- the flag
        is accepted and then ignored for one of the queries.
        """
        offenders = []
        for path in self.SCRIPTS:
            body = path.read_text(encoding='utf-8', errors='replace')
            if 'resolve_target_user_id' not in body:
                continue
            for i, line in enumerate(body.splitlines(), 1):
                if line.lstrip().startswith('#') or 'resolve_target_user_id' in line:
                    continue
                if self.EMAIL.search(line):
                    offenders.append(f'{path.relative_to(REPO_ROOT)}:{i}: {line.strip()[:90]}')
        assert not offenders, (
            'A script takes --user-email and then names an account anyway:\n  '
            + '\n  '.join(offenders))

    def test_the_scan_reads_real_scripts(self):
        assert len(self.SCRIPTS) > 40, (
            f'Only {len(self.SCRIPTS)} scripts found -- the glob is wrong, not '
            'the directory suddenly empty.')


class TestQb01DeletedCodeStaysDeleted:
    """QB-01 and HYG-02: things that were deleted after being proven dead.

    A deletion guards itself only until somebody restores the file from git
    history because a stray import looked like it wanted one. `exceptions.py`
    was a 549-line SECOND exception hierarchy running in parallel with the real
    one; the danger is not the file coming back so much as half the codebase
    quietly starting to raise from the wrong tree.
    """

    GONE = [
        # NOT backend/utils/exceptions.py, which is live and imported by
        # route_decorators and guardian_scope. The dead one was a THIRD
        # hierarchy at the backend root, 549 lines under OptioException, with
        # zero importers -- and it shared class names with the live ones, so a
        # reader landing in it would find a plausible ValidationError that no
        # handler would ever catch. Deleted in efa10e52.
        ('backend/exceptions.py', 'QB-01: a third, parallel exception hierarchy with zero '
                                  'importers. middleware/error_handler.AppError is the live one.'),
        ('verify', 'HYG-02: 20 tracked hash-named .mjs scripts.'),
    ]

    @pytest.mark.parametrize('rel,why', GONE)
    def test_stays_deleted(self, rel, why):
        assert not (REPO_ROOT / rel).exists(), f'{rel} is back. {why}'


class TestDocsDoNotRotBack:
    """DOC-01 through DOC-05: five documentation findings, all the same shape.

    Every one was a document that was confidently wrong rather than merely out
    of date, which is worse: an engineer reading "MIGRATION COMPLETE" or
    "integration tests are advisory and red on purpose" makes a decision on it.
    Prose cannot be fully guarded. The specific false claims can be.
    """

    def test_doc01_migration_status_does_not_claim_completion(self):
        """DOC-01: the doc claimed "MIGRATION COMPLETE" at ~9% adherence.

        Judged on the OPENING section, not the whole file. The 2025 text is
        deliberately kept below the correction as history -- including its
        "Decision: Mark Migration Complete" heading -- and a scan of the whole
        file would either fail on preserved history or force that history to be
        deleted. What a reader sees is the top, so that is what is asserted.
        """
        doc = REPO_ROOT / 'backend/docs/REPOSITORY_MIGRATION_STATUS.md'
        header = '\n'.join(doc.read_text(encoding='utf-8').splitlines()[:15])
        assert 'NOT complete' in header, (
            "REPOSITORY_MIGRATION_STATUS.md's opening section no longer says "
            'the migration is incomplete. It is ~12% adherent and deliberately '
            'fenced by CI-02 (QB-06), not finished. Anyone reading the old text '
            'concluded the work was done.')
        cited = _strip_quoted(header).upper()
        assert 'MIGRATION COMPLETE' not in cited, (
            'The header states the migration is complete outside of a quotation.')

    def test_doc02_nothing_calls_the_integration_tests_advisory(self):
        """DOC-02: five artifacts understated the integration suite.

        The harmful one was CLAUDE.md's "advisory and red on purpose" -- an
        engineer reading that dismisses a real failure. They are enforcing and
        they block the merge.
        """
        bad = re.compile(r'advisory and red|red on purpose|advisory only', re.I)
        offenders = []
        for path in _tracked('**/*.md'):
            # The remediation record has to be able to describe what the docs
            # used to say, or it cannot explain what was fixed.
            if 'remediation-2026-09' in path.parts or 'audit-2026-08' in path.parts:
                continue
            for i, line in enumerate(path.read_text(encoding='utf-8', errors='replace').splitlines(), 1):
                if bad.search(_strip_quoted(line)):
                    offenders.append(f'{path.relative_to(REPO_ROOT)}:{i}')
        assert not offenders, (
            'A document describes the integration tests as advisory:\n  '
            + '\n  '.join(offenders)
            + '\n\nThey are enforcing and a failure blocks the merge '
              '(tests-integration.yml, called by ci.yml).')

    def test_doc03_every_link_in_claude_md_resolves(self):
        """DOC-03: LOCAL_DEVELOPMENT.md was linked twice and did not exist.

        A broken link in the file every agent reads first is worse than no link:
        it reads as "this is documented elsewhere", and the reader goes looking
        instead of asking.
        """
        claude = REPO_ROOT / 'CLAUDE.md'
        text = claude.read_text(encoding='utf-8')
        broken = []
        for match in re.finditer(r'\[[^\]]+\]\(([^)]+)\)', text):
            target = match.group(1).split('#')[0].strip()
            if not target or target.startswith(('http://', 'https://', 'mailto:')):
                continue
            if not (REPO_ROOT / target).exists():
                broken.append(target)
        assert not broken, (
            'CLAUDE.md links to files that do not exist:\n  '
            + '\n  '.join(sorted(set(broken)))
            + '\n\nEither create them or remove the link. A broken link in the '
              'file every session reads first sends people looking for a '
              'document instead of asking.')

    def test_doc03_the_link_scan_found_links(self):
        """A floor, so the broken-link test above cannot pass by finding none.

        Lowered from 20 to 12 on 2026-09-10, when CLAUDE.md went from 656 lines
        to about 210 and its link count fell from 33 to 20. The number is not a
        target -- fewer links in a shorter file is the point of the exercise --
        it is only here to catch the regex breaking. 12 is comfortably below the
        20 the trimmed file carries and comfortably above zero.
        """
        text = (REPO_ROOT / 'CLAUDE.md').read_text(encoding='utf-8')
        links = [m for m in re.finditer(r'\[[^\]]+\]\(([^)]+)\)', text)]
        assert len(links) > 12, (
            f'Only {len(links)} markdown links parsed out of CLAUDE.md -- the '
            'regex is wrong, not the file suddenly bare.')

    def test_doc04_claude_md_does_not_tell_agents_to_commit_everything(self):
        """DOC-04: CLAUDE.md self-contradicted on commit scope.

        This is the one that was actively dangerous. Several agents share one
        working tree; "stage and commit ALL outstanding changes" sweeps somebody
        else's half-finished work into your commit and onto main under your
        message. It nearly happened once.
        """
        text = (REPO_ROOT / 'CLAUDE.md').read_text(encoding='utf-8')
        # Quoted spans removed from the WHOLE text, not line by line: CLAUDE.md
        # quotes the dangerous old wording in order to say it was wrong, and
        # that quotation wraps across a line break. Stripping per line would see
        # an opening quote with no close and leave the phrase standing.
        lowered = _strip_quoted(text).lower()
        # `git add -A` is deliberately NOT in this list: CLAUDE.md names it in
        # the rule that BANS it, so the string appears whether the guidance is
        # right or wrong. A discriminator that fires either way is not one.
        for phrase in ('commit all outstanding changes', 'push everything'):
            assert phrase not in lowered.replace('`', ''), (
                f'CLAUDE.md tells an agent to {phrase!r}. Several agents share '
                'this working tree -- see Critical Rule 12.')
        assert 'commit YOUR work' in text or 'commit only your own files' in lowered, (
            'CLAUDE.md lost the rule limiting a commit to the files you '
            'changed. That rule is the only thing standing between a parallel '
            "session and somebody else's uncommitted work.")

    def test_doc05_the_repo_root_stays_tidy(self):
        """DOC-05: ~20 planning docs cluttered the repo root.

        The rule is not a count for its own sake: a root markdown file is one
        an agent may read without being pointed at it, so each one has to be
        something CLAUDE.md vouches for.
        """
        claude = (REPO_ROOT / 'CLAUDE.md').read_text(encoding='utf-8')
        stray = [
            p.name for p in REPO_ROOT.glob('*.md')
            if p.name not in ('CLAUDE.md', 'README.md') and p.name not in claude
        ]
        assert not stray, (
            'Markdown files in the repo root that CLAUDE.md does not link:\n  '
            + '\n  '.join(sorted(stray))
            + '\n\nMove them under docs/, or link them from CLAUDE.md. The root '
              'is where an agent looks before being told where to look.')


class TestHyg03PipAuditHasNoUnexplainedSuppressions:
    """HYG-03: three pip-audit CVE suppressions, two of them silencing nothing.

    That is the worst state for a suppression: it reads as an accepted risk and
    is dead config. The rule the workflow states is that a new ignore needs a
    dated reason AND a re-check date.
    """

    WORKFLOW = REPO_ROOT / '.github/workflows/tests-backend.yml'

    def test_every_pip_audit_ignore_carries_a_recheck_date(self):
        text = self.WORKFLOW.read_text(encoding='utf-8')
        ignores = re.findall(r'--ignore-vuln\s+(\S+)', text)
        if not ignores:
            return  # The current state: none.
        has_date = re.search(r're-?check(?:ed)?\s*(?:after|by|on)?[:\s]*20\d\d-\d\d-\d\d', text, re.I)
        assert has_date, (
            f'pip-audit suppresses {len(ignores)} advisory/advisories '
            f'({", ".join(ignores)}) with no re-check date in the workflow. '
            'An ignore nobody revisits is a vulnerability with a comment on it.')

    def test_pip_audit_is_still_enforcing(self):
        text = self.WORKFLOW.read_text(encoding='utf-8')
        assert 'pip-audit --requirement requirements.txt' in text, (
            'pip-audit no longer audits the ROOT requirements.txt -- the file '
            'Render actually deploys. Auditing backend/requirements.txt instead '
            'is what made this gate blind to production (DEP-H1).')
        assert '--strict' in text, 'pip-audit lost --strict.'


class TestOps04TheBackupJobKeepsItsSafetyRails:
    """OPS-04: 3,548 objects of student evidence (8.36 GB) had no backups.

    The job that now backs them up can destroy them: `rclone sync` makes the
    destination match the source, so a source that reads as empty deletes the
    backup. Three rails were built for that, and all three are one careless
    edit from gone. Four defects shipped in this workflow that were reviewable
    on paper and only visible against reality -- including a GCS lifecycle rule
    that would have deleted all 3,548 objects on 2026-12-04.
    """

    WORKFLOW = REPO_ROOT / '.github/workflows/backup-storage.yml'

    def test_the_source_object_floor_is_still_there(self):
        text = self.WORKFLOW.read_text(encoding='utf-8')
        assert 'MIN=1000' in text, (
            'The source-object floor is gone. Without it, a credential or '
            'endpoint problem that makes the source list zero objects becomes '
            'a sync that deletes the backup.')

    def test_max_delete_is_still_there(self):
        text = self.WORKFLOW.read_text(encoding='utf-8')
        assert '--max-delete' in text, (
            'rclone --max-delete is gone. It is the second line of defence '
            'behind the object floor.')

    def test_the_decryption_round_trip_still_runs(self):
        text = self.WORKFLOW.read_text(encoding='utf-8')
        assert 'Prove one file actually decrypts' in text, (
            'The decrypt round-trip step is gone. A client-side-encrypted '
            'backup that cannot be decrypted is not a backup, and the only way '
            'to know is to decrypt one -- it FAILED the first time it ran.')


class TestOps02RenderYamlKnowsAboutTheMarketingSite:
    """OPS-02: render.yaml was not in effect, and was missing a whole service.

    Most of this finding is dashboard state that no repo test can see. One part
    is not: www.optioeducation.com is served by `optio-marketing`, and that
    service was absent from render.yaml entirely -- so anyone reading the file
    to find out what runs in production would not have known the marketing site
    existed.
    """

    def test_optio_marketing_is_declared(self):
        text = (REPO_ROOT / 'render.yaml').read_text(encoding='utf-8')
        assert 'optio-marketing' in text, (
            'render.yaml no longer mentions optio-marketing, which serves '
            'www.optioeducation.com. It was missing once already, and the file '
            'is what people read to find out what runs in production.')
