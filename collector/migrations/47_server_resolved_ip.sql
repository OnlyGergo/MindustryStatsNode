-- ─────────────────────────────────────────────────────────────────────────────
-- 47_server_resolved_ip.sql
--
-- Some servers are listed under both an IP and a domain (1.2.3.4:6567 and
-- play.example.com:6567). servers is keyed on the literal (host, port), so the
-- two addresses become two rows in two families and every total counts that
-- server's players twice.
--
-- resolved_ip is the IPv4 address the poller last reached a row on (written
-- only when the server answered). The admin merge page suggests live families
-- sharing (resolved_ip, port) as `same_endpoint`; an admin confirms the merge,
-- after which the read-side MAX collapse fixes history too, and the collector
-- polls only the family's primary member (see GetServers).
-- ─────────────────────────────────────────────────────────────────────────────

alter table servers add column if not exists resolved_ip inet;

create index if not exists idx_servers_resolved_endpoint
    on servers (resolved_ip, port)
    where retired_at is null and resolved_ip is not null;
