-- Mizuho OS - excluir OS (so administrador), com registro minimo.
-- Cole no SQL Editor do Supabase e rode UMA vez, ANTES de publicar o app novo:
-- o botao Excluir OS chama a funcao criada aqui.

begin;

-- ====== 0012_excluir_os.sql ======
-- Excluir OS: so o administrador, qualquer OS (inclusive a assinada), por uma
-- funcao. Pela API continua sem existir apagar direto: nao ha policy de delete
-- em ordens_servico.
--
-- Fica um registro minimo do que foi excluido, legivel so pelo administrador.
-- Ele NAO guarda os itens nem o desenho da assinatura: o que some, some.

-- ---------------------------------------------------------------------------
-- 1. Registro minimo (so de inclusao)
-- ---------------------------------------------------------------------------
create table os_excluidas (
  id                bigint generated always as identity primary key,
  -- Sem chave estrangeira: a OS ja nao existe quando isto e lido.
  os_id             uuid not null,
  numero            bigint,
  cliente_nome      text not null,
  veiculo_placa     text,
  veiculo_descricao text,
  data_os           date,
  status            text,
  total_centavos    int,
  assinada          boolean not null default false,
  aceite_em         timestamptz,
  excluida_por      uuid,
  -- Copia congelada, como nos outros registros: renomear ou apagar a pessoa
  -- nao reescreve o passado.
  excluida_por_nome text not null,
  excluida_em       timestamptz not null default now()
);
create index os_excluidas_em_idx on os_excluidas (excluida_em desc, id desc);

alter table os_excluidas enable row level security;
create policy os_excluidas_le on os_excluidas for select to authenticated
  using ((select usuario_admin()));
revoke insert, update, delete, truncate on os_excluidas from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. A funcao
--
-- security definer: apaga como dono, o unico caminho de exclusao. O registro e
-- tirado ANTES de qualquer mudanca, para guardar o status e o numero que a OS
-- tinha. Se ela ainda nao estava cancelada, passa por cancelar_os primeiro, que
-- ja sabe devolver o numero a fila quando e o da ponta.
-- ---------------------------------------------------------------------------
create or replace function excluir_os(p_os_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v       ordens_servico%rowtype;
  v_nome  text;
begin
  if not usuario_admin() then
    raise exception 'acesso_negado';
  end if;

  -- Mesma chave da numeracao: excluir, cancelar e emitir nao correm juntos.
  perform pg_advisory_xact_lock(hashtext('os_numero_seq'));

  select * into v from ordens_servico where id = p_os_id for update;
  if not found then
    raise exception 'OS % nao encontrada', p_os_id;
  end if;

  select nome into v_nome from perfis where user_id = auth.uid();

  insert into os_excluidas (
    os_id, numero, cliente_nome, veiculo_placa, veiculo_descricao, data_os,
    status, total_centavos, assinada, aceite_em, excluida_por, excluida_por_nome
  ) values (
    v.id, v.numero, v.cliente_nome, v.veiculo_placa, v.veiculo_descricao, v.data_os,
    v.status, v.total_centavos, v.aceite_em is not null, v.aceite_em,
    auth.uid(), coalesce(v_nome, 'Sistema')
  );

  if v.status <> 'cancelada' then
    perform cancelar_os(p_os_id);
  end if;

  -- Itens, atividade e codigo de assinatura saem junto (cascade).
  delete from ordens_servico where id = p_os_id;
end $$;

revoke execute on function excluir_os(uuid) from public, anon;
grant  execute on function excluir_os(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. PDF no armazenamento
--
-- O app remove o arquivo da OS excluida para o link do WhatsApp deixar de
-- abrir. So o administrador apaga.
-- ---------------------------------------------------------------------------
create policy pdf_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'os-pdfs' and (select usuario_admin()));


commit;
