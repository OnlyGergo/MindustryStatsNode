-- ─────────────────────────────────────────────────────────────────────────────
-- 49_server_resolved_port.sql
--
-- Mindustry resolves a hostname on the default port through an SRV record
-- (_mindustry._tcp.play.example.com -> host:6000), and the poller now does the
-- same. The row keeps the address as listed (play.example.com:6567), so
-- resolved_ip alone would pair it with the wrong port. resolved_port is the
-- port that answered, written alongside resolved_ip; the merge page's
-- same_endpoint match uses COALESCE(resolved_port, port).
-- ─────────────────────────────────────────────────────────────────────────────

alter table servers add column if not exists resolved_port integer;

drop index if exists idx_servers_resolved_endpoint;

create index if not exists idx_servers_resolved_endpoint
    on servers (resolved_ip, (coalesce(resolved_port, port)))
    where retired_at is null and resolved_ip is not null;
