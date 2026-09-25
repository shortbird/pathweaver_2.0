---
name: MOU
description: Produce an Optio Academy credit-partner Memorandum of Understanding (MOU) for a new client program, as a branded PDF, from the client's details. Use for "/MOU", "make an MOU for X", "draft the partner agreement for X", or to update an existing client's MOU.
---

# Credit-partner MOU

An MOU is the working agreement between Optio (Optio Academy, the accredited
school) and an outside program whose students earn credit by documenting what
they already do there. The first one was Music So Simple (Stathia Orwig,
2026-09-21). The document text is fixed; only the client's details change.

- Builder: `docs/partner/build_mou.py`
- Output: `~/Desktop/Optio_MOU_<Program_Name>.pdf`, always
- One JSON file per client: `docs/partner/mou_clients/<slug>.json`
- Every field, blank: `mou_clients/template.json`. A worked example:
  `mou_clients/music-so-simple.json`.

## 1. Gather the client's details

Take what the user gave in the `/MOU` arguments first. Fill gaps from, in order:
the in-repo CRM (`crm_leads` on the production Optio project, check the schema
before querying), Fyxer meeting notes for the conversation with the client, then
Gmail. Ask the user for anything still missing in one question, not a series.

| Field | What it is | Default |
|---|---|---|
| `PROGRAM_NAME` | The client's business name | none, required |
| `PROGRAM_LOCATION` | "City, State", state spelled out | none, required |
| `PROGRAM_CONTACT` | "Name, Title" of the signer | none, required |
| `PROGRAM_EMAIL` | Signer's email | none, required |
| `DATE` | "Month D, YYYY" | today |
| `CREDIT_ROWS` | One row per subject: `subject`, `credit` (per term), `earns`, `dates` (a string, or a list for one line per term) | none, required |
| `OPTIO_FAMILY_CONTACT` | "Name, email" families write to | Emmeline Iglinski, emmeline@optioeducation.com |
| `EVIDENCE_EXAMPLES` | Lowercase list finishing "Evidence can be ..." | specific to the program's activity |
| `PRICE` | Optio's fee per student per term | $100 |
| `INVOICE_TIMING` | Finishes "one invoice ..." | at the start of each term |
| `PAYMENT_DAYS` | Net days | 30 |
| `WITHDRAW_DAYS` | No-charge withdrawal window | 14 |

The credit rows are the part that needs judgment. Each `earns` sentence has to
describe work the program's students really do, since an Optio teacher awards
credit against it and it has to hold up for accreditation. Never invent a
subject or a credit amount: if the user did not say which subjects and how much
credit, ask. If the client is to choose them, give the row `"_blank": true` and
bracketed placeholder text; it prints as fill-in fields (see
`mou_clients/xp-league-clearwater.json`). Write `earns` in the pattern of the Music So Simple rows: the
activity, "with learning evidence recorded each week", then any culminating
event or test.

Copy rules for the values (they appear in a signed document): no emojis, no em
dashes, "Optio" not "Optio Education", say "class" rather than "credit" where
either works.

## 2. Build it

Write `docs/partner/mou_clients/<kebab-case-program-name>.json`, then:

```
python3 docs/partner/build_mou.py <slug>
```

It always saves the PDF to the user's Desktop as
`~/Desktop/Optio_MOU_<Program_Name>.pdf` (their standing preference; never
save MOUs in the repo), and prints a temp directory holding the HTML and page
previews. Tell the user the Desktop path. Read every page PNG in it and
check that nothing is cut off, the credit table does not split awkwardly, and
the signature block sits whole on one page. It runs to 3 pages at the Music So
Simple length; a much longer credit table can push the signatures onto a 4th
page, which is fine as long as the block is not split.

## 3. Hand it over

Send the PDF to the user with SendUserFile and list the values you chose or
defaulted (not the ones they told you), so they can correct them before it goes
to the client. Do not email it to the client yourself.

To change the document's wording for every client, edit `PAGE` in
`build_mou.py` and rebuild them all with `python3 docs/partner/build_mou.py --all`.
