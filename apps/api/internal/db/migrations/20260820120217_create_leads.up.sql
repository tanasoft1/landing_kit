CREATE TABLE leads (
    id          uuid PRIMARY KEY,
    name        text        NOT NULL,
    email       text        NOT NULL,
    message     text        NOT NULL,
    locale      text        NOT NULL,
    source_page text,
    ip          inet,
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- The admin list is newest-first and is the only read path. Without this index that list is a
-- sequential scan plus a sort, which is invisible at 10 leads and not at 100,000.
CREATE INDEX leads_created_at_idx ON leads (created_at DESC);
