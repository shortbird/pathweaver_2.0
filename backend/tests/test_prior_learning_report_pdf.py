"""
The credit report a reviewer sends a family (services/prior_learning_report_pdf.py).

What matters is that it says exactly what was awarded and from where: every
subject against its requirement, each transfer school, what the transferred
credit costs, and nothing still in review counted as done.
"""

import pytest

from services import prior_learning_report_pdf as report

DATA = {
    'student': {'name': 'Finn <O\'Neill>', 'schools': ['Optio Academy']},
    'progress': {'total_required': 24, 'total_counted': 4.5, 'subjects': [
        {'subject': 'math', 'name': 'Math', 'required': 3, 'earned': 3, 'transfer': 2, 'optio': 1},
        {'subject': 'science', 'name': 'Science', 'required': 3, 'earned': 1.5, 'transfer': 1.5, 'optio': 0},
    ]},
    'transfer_credits': [{'id': 't1', 'school_name': 'Cava Academy', 'credits': {'math': 2, 'science': 1.5},
                          'course_names': {'math': [{'name': 'Geometry', 'credits': 1}]},
                          'prior_learning_record_ids': ['r1'], 'accredited': False},
                         {'id': 't2', 'school_name': 'Lincoln High', 'credits': {'math': 0.5},
                          'accredited': True}],
    'transfer_cost': {'price_list': 'licensed', 'unaccredited_rate_cents': 5000, 'accredited_rate_cents': 0,
                      'total_cents': 17500, 'lines': [
                          {'transfer_credit_id': 't1', 'school_name': 'Cava Academy', 'accredited': False,
                           'credits': 3.5, 'rate_cents': 5000, 'cost_cents': 17500},
                          {'transfer_credit_id': 't2', 'school_name': 'Lincoln High', 'accredited': True,
                           'credits': 0.5, 'rate_cents': 0, 'cost_cents': 0}]},
    'records': [
        {'id': 'r1', 'title': 'Junior year', 'status': 'accepted', 'awarded_credits': {'math': 2, 'science': 1.5},
         'reviewed_at': '2026-08-17T12:00:00Z', 'provider': 'Cava Academy'},
        {'id': 'r2', 'title': 'Band camp', 'status': 'rejected', 'awarded_credits': {}},
        {'id': 'r3', 'title': 'Summer biology', 'status': 'under_review', 'awarded_credits': {}},
    ],
}


@pytest.mark.unit
class TestTheReportSaysWhereCreditCameFrom:
    html = report.build_html(DATA, generated_on='October 13, 2026')

    def test_the_totals_and_each_subject_are_there(self):
        assert '4.5</span> of 24 diploma credits' in self.html
        assert '<td>Math</td>' in self.html and '<td>Science</td>' in self.html

    def test_the_subject_table_has_a_total_and_marks_met_subjects(self):
        table = self.html.split('Credit by subject')[1].split('</table>')[0]
        assert '<td class="num met">Met</td>' in table          # math: 3 of 3
        assert '<tr class="total"><td>Total</td>' in table

    def test_each_transfer_school_says_what_and_whether_accredited(self):
        sources = self.html.split('Where transferred credit came from')[1]
        assert 'Cava Academy' in sources and 'NOT ACCREDITED' in sources
        assert '2 Math, 1.5 Science' in sources
        assert 'Geometry (1)' in sources

    def test_the_cost_section_prices_each_school(self):
        cost = self.html.split('Transfer credit cost')[1]
        assert '<td>Cava Academy</td><td class="num">3.5</td><td class="num">$50</td><td class="num">$175</td>' in cost
        assert '<td>Lincoln High</td><td class="num">0.5</td><td class="num">Free</td><td class="num">Free</td>' in cost
        assert 'half-price rate for students whose school uses Optio' in cost

    def test_a_school_priced_from_mixed_records_says_so(self):
        data = {**DATA, 'transfer_cost': {**DATA['transfer_cost'], 'lines': [
            {**DATA['transfer_cost']['lines'][0], 'accredited': None, 'rate_cents': None}]}}
        html = report.build_html(data, generated_on='October 13, 2026')
        assert 'PARTLY ACCREDITED' in html
        assert '<td class="num">Mixed</td>' in html

    def test_decisions_are_gone_and_open_records_stay(self):
        assert 'Prior learning decisions' not in self.html
        assert 'Band camp' not in self.html
        in_progress = self.html.split('Still in progress')[1]
        assert 'Summer biology' in in_progress

    def test_names_are_escaped(self):
        assert '&lt;O&#x27;Neill&gt;' in self.html

    def test_it_renders_a_real_pdf(self):
        assert report.render(DATA).startswith(b'%PDF')


@pytest.mark.unit
def test_an_opened_family_report_prints_no_price():
    """OpenEd families buy through OpenEd, which pays Optio (Tanner,
    2026-10-13): their report carries no cost table and no price."""
    from services import sis_prior_learning_queue as queue
    data = {**DATA, 'transfer_cost': queue.transfer_cost(DATA['transfer_credits'], DATA['records'], 'opened')}
    html = report.build_html(data, generated_on='October 13, 2026')
    assert 'Transfer credit cost' not in html
    assert 'transfer cost' not in html
    assert '$' not in html.replace('$0', '')
