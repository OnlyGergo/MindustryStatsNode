alter table public.servers
    drop constraint servers_host_port_key;

alter table public.servers
    add constraint servers_host_port_group_key
        unique (host, port, server_group_id);