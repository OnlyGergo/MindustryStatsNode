-- Owner replies to reviews (F5), Google Maps style: at most one reply per
-- review, so review_id is the primary key and a second reply from any manager
-- of the server (a co-owner, an admin) replaces the first.
--
-- There is no server_id here: the reply hangs off the review, and the review
-- already stores the raw servers.id the reviewer saw. The backend checks on
-- every write that the review belongs to the family of the server in the URL
-- and that the caller may manage that server (ownershipRepository.canManageServer).
--
-- author_user_id cascades like server_reviews.user_id: deleting an account
-- (UK GDPR erasure) takes that user's replies with it, and deleting a review
-- takes its reply. If upsertReview folds a user's merge-leftover duplicate
-- reviews into one, a reply on a deleted duplicate goes with it.
--
-- removed_at / removed_reason are moderation columns reserved for F7, same as
-- on server_reviews: a removed reply is hidden from public reads and an owner
-- cannot silently overwrite it by replying again.
--
-- Same explicit-GRANT rule as every user-content migration.

create table if not exists review_replies (
    review_id      bigint primary key references server_reviews (id) on delete cascade,
    author_user_id bigint not null references users (id) on delete cascade,
    body           text not null check (char_length(body) between 1 and 2000),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    removed_at     timestamptz,
    removed_reason text
);
create index if not exists review_replies_author_user_id_idx on review_replies (author_user_id);

grant select, insert, update, delete on review_replies to app_user_rw;
