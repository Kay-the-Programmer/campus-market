-- What a seller agreed to, and when.
--
-- Recorded because the terms are what an admin points at when they remove a
-- listing or refuse an application, and "you agreed to this" is only true if
-- there is a row saying so. The version travels with the timestamp for the
-- same reason: the clauses will change, and the question is always what was in
-- force on the day they accepted, not what is in force now.
--
-- Nullable, with no backfill. Every account that applied before this existed
-- genuinely did not accept these terms, and writing a version into their row
-- would manufacture a consent that never happened - the exact failure the
-- column is here to prevent. They are asked the next time they apply.
ALTER TABLE users ADD COLUMN seller_terms_version     VARCHAR(32);
ALTER TABLE users ADD COLUMN seller_terms_accepted_at TIMESTAMPTZ;
