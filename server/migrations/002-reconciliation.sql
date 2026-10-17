CREATE TABLE IF NOT EXISTS document_relationships (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id),
 document_id TEXT NOT NULL REFERENCES documents(id),
 related_document_id TEXT NOT NULL REFERENCES documents(id),
 relation TEXT NOT NULL CHECK(relation IN ('supersedes','contradicts','corroborates','same_announcement')),
 created_at TEXT NOT NULL,
 data TEXT NOT NULL,
 UNIQUE(document_id,related_document_id,relation),
 CHECK(document_id <> related_document_id)
);
CREATE TABLE IF NOT EXISTS event_reconciliations (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id),
 source_event_id TEXT NOT NULL REFERENCES events(id),
 target_event_id TEXT NOT NULL REFERENCES events(id),
 created_at TEXT NOT NULL,
 data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS document_relationships_account ON document_relationships(account_id);
CREATE INDEX IF NOT EXISTS event_reconciliations_account ON event_reconciliations(account_id);
