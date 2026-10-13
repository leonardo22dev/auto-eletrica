alter table configuracoes   enable row level security;
alter table clientes        enable row level security;
alter table veiculos        enable row level security;
alter table ordens_servico  enable row level security;
alter table os_itens        enable row level security;

-- A oficina inteira usa o mesmo nivel de acesso; o que a RLS garante e que
-- ninguem sem sessao le nada, mesmo com a chave anon em maos.
create policy conf_le  on configuracoes for select to authenticated using (true);
create policy conf_upd on configuracoes for update to authenticated
  using (true) with check (true);

create policy cli_le  on clientes for select to authenticated using (true);
create policy cli_ins on clientes for insert to authenticated with check (true);
create policy cli_upd on clientes for update to authenticated
  using (true) with check (true);

create policy vei_le  on veiculos for select to authenticated using (true);
create policy vei_ins on veiculos for insert to authenticated with check (true);
create policy vei_upd on veiculos for update to authenticated
  using (true) with check (true);

create policy os_le  on ordens_servico for select to authenticated using (true);
create policy os_ins on ordens_servico for insert to authenticated with check (true);
create policy os_upd on ordens_servico for update to authenticated
  using (true) with check (true);

create policy item_le  on os_itens for select to authenticated using (true);
create policy item_ins on os_itens for insert to authenticated with check (true);
create policy item_upd on os_itens for update to authenticated
  using (true) with check (true);
create policy item_del on os_itens for delete to authenticated using (true);

-- Sem policy de delete em clientes, veiculos e ordens_servico: documento
-- emitido e cadastro com historico nao se apagam, so se cancelam.

insert into storage.buckets (id, name, public)
values ('os-pdfs', 'os-pdfs', true)
on conflict (id) do nothing;

-- Leitura publica para que o link enviado ao cliente por WhatsApp abra sem
-- login; o caminho contem o uuid da OS, entao nao e adivinhavel.
create policy pdf_le_publico on storage.objects for select to public
  using (bucket_id = 'os-pdfs');
create policy pdf_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'os-pdfs');
create policy pdf_regrava on storage.objects for update to authenticated
  using (bucket_id = 'os-pdfs') with check (bucket_id = 'os-pdfs');
