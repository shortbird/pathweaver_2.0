/**
 * Documents attached to one checklist item.
 *
 * An item used to hold exactly one file in `document_url`, so uploading a second
 * offered to REPLACE the first — iCreate asked for an ID and a birth certificate
 * on a single I-9 item and the teacher had nowhere to put the second file. Items
 * carry a `documents` list now, and the server still writes `document_url` with
 * the first of them so older rows and readers keep working.
 *
 * Both shapes reach the UI (an in-flight checklist assigned before the change
 * still has the scalar), so every surface reads them through here.
 *
 * An entry is EITHER an upload (`path`, a blob in the checklist bucket) or a
 * document the office filed against the item out of the secure store
 * (`secure_document_id`, whose blob stays in that store). They open through
 * different endpoints, so callers branch on which field is set.
 */
export const itemDocuments = (item) => {
  const docs = item?.documents
  if (Array.isArray(docs)) {
    const out = docs.filter((d) => d && (d.path || d.secure_document_id))
    if (out.length) return out
  }
  return item?.document_url ? [{ path: item.document_url, filename: null }] : []
}
