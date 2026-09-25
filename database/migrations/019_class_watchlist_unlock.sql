-- A manual unlock belongs to a class, never to a browser or individual grade.
CREATE TABLE class_watchlist_unlocks (
    cs_id BIGINT PRIMARY KEY REFERENCES class_sections(cs_id),
    unlocked_by BIGINT NOT NULL REFERENCES user_accounts(user_id),
    unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
