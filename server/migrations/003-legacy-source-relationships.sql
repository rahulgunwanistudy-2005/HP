-- Preserve reviewed historical supersession in the same reversible relation model.
INSERT OR IGNORE INTO document_relationships(id,account_id,document_id,related_document_id,relation,created_at,data)
SELECT 'legacy-supersession-' || older.id, older.account_id, newer.id, older.id, 'supersedes',
 COALESCE(json_extract(newer.data,'$.reviewedAt'),json_extract(newer.data,'$.retrievedAt'),datetime('now')),
 json_object('id','legacy-supersession-' || older.id,'accountId',older.account_id,
 'documentId',newer.id,'relatedDocumentId',older.id,'type','supersedes','status','active',
 'reason','Retained curated source supersession; original source facts and versions preserved.',
 'createdAt',COALESCE(json_extract(newer.data,'$.reviewedAt'),json_extract(newer.data,'$.retrievedAt'),datetime('now')))
FROM documents older JOIN documents newer
 ON newer.id=json_extract(older.data,'$.supersededBy') AND newer.account_id=older.account_id
WHERE json_type(older.data,'$.supersededBy')='text' AND older.id<>newer.id;
