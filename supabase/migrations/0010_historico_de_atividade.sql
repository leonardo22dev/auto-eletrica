-- Historico de atividade por OS: quem criou, quem mudou o que e quando.
--
-- Gravado por gatilho, no banco, para nao depender da tela: uma chamada direta
-- a API deixa o mesmo rastro. Tabela so de inclusao.

create table os_historico (
  id           bigint generated always as identity primary key,
  -- cascade: a limpeza manual de OS de teste (delete no SQL Editor) precisa
  -- continuar possivel; quem usa o sistema nao apaga OS.
  os_id        uuid not null references ordens_servico(id) on delete cascade,
  usuario_id   uuid,
  -- Copia congelada: renomear ou apagar a pessoa nao reescreve o passado.
  usuario_nome text not null,
  acao         text not null check (acao in
                 ('criada', 'dados_alterados', 'itens_alterados',
                  'status_alterado', 'link_gerado', 'aceita', 'cancelada')),
  detalhe      jsonb not null default '{}'::jsonb,
  -- Junta as linhas de item de uma mesma operacao em um evento so.
  transacao    bigint not null default txid_current(),
  em           timestamptz not null default now()
);
create index os_historico_os_idx on os_historico (os_id, em, id);
create unique index os_historico_itens_unico
  on os_historico (os_id, transacao) where acao = 'itens_alterados';

alter table os_historico enable row level security;
create policy os_historico_le on os_historico for select to authenticated
  using ((select usuario_ativo()));
revoke insert, update, delete, truncate on os_historico from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Registrar (interna: so os gatilhos chamam, como dono)
-- ---------------------------------------------------------------------------
create or replace function registrar_historico(
  p_os uuid, p_acao text, p_detalhe jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid;
  v_nome text;
begin
  if p_acao = 'aceita' then
    -- Quem assina e o cliente, mesmo que haja um funcionario logado no mesmo
    -- navegador.
    v_nome := 'Cliente (assinatura)';
  else
    v_uid := auth.uid();
    select nome into v_nome from perfis where user_id = v_uid;
    if v_nome is null then
      v_uid := null;
      v_nome := 'Sistema';
    end if;
  end if;

  insert into os_historico (os_id, usuario_id, usuario_nome, acao, detalhe)
  values (p_os, v_uid, v_nome, p_acao, coalesce(p_detalhe, '{}'::jsonb))
  on conflict (os_id, transacao) where acao = 'itens_alterados' do nothing;
end $$;

revoke execute on function registrar_historico(uuid, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gatilho da OS
-- ---------------------------------------------------------------------------
create or replace function historico_da_os() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_dados jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    perform registrar_historico(new.id, 'criada',
      jsonb_build_object('status', new.status, 'numero', new.numero));
    return null;
  end if;

  -- O total muda por causa dos itens: completa o evento de itens da mesma
  -- transacao (aberto pelo gatilho de os_itens) com o total final.
  if new.total_centavos is distinct from old.total_centavos then
    update os_historico
       set detalhe = detalhe || jsonb_build_object('total_para', new.total_centavos)
     where os_id = new.id and acao = 'itens_alterados' and transacao = txid_current();
  end if;

  if old.aceite_em is null and new.aceite_em is not null then
    perform registrar_historico(new.id, 'aceita', jsonb_build_object(
      'total_centavos', new.aceite_total_centavos,
      'status_de', old.status, 'status_para', new.status));
  elsif new.status is distinct from old.status then
    if new.status = 'cancelada' then
      perform registrar_historico(new.id, 'cancelada',
        jsonb_build_object('de', old.status));
    else
      perform registrar_historico(new.id, 'status_alterado',
        jsonb_build_object('de', old.status, 'para', new.status));
    end if;
  end if;

  if new.assinatura_codigo is not null
     and new.assinatura_codigo is distinct from old.assinatura_codigo then
    perform registrar_historico(new.id, 'link_gerado',
      jsonb_build_object('expira_em', new.assinatura_expira_em));
  end if;

  if new.cliente_nome is distinct from old.cliente_nome then
    v_dados := v_dados || jsonb_build_object('cliente_nome',
      jsonb_build_object('de', old.cliente_nome, 'para', new.cliente_nome));
  end if;
  if new.cliente_telefone is distinct from old.cliente_telefone then
    v_dados := v_dados || jsonb_build_object('cliente_telefone',
      jsonb_build_object('de', old.cliente_telefone, 'para', new.cliente_telefone));
  end if;
  if new.veiculo_descricao is distinct from old.veiculo_descricao then
    v_dados := v_dados || jsonb_build_object('veiculo_descricao',
      jsonb_build_object('de', old.veiculo_descricao, 'para', new.veiculo_descricao));
  end if;
  if new.veiculo_placa is distinct from old.veiculo_placa then
    v_dados := v_dados || jsonb_build_object('veiculo_placa',
      jsonb_build_object('de', old.veiculo_placa, 'para', new.veiculo_placa));
  end if;
  if new.data_os is distinct from old.data_os then
    v_dados := v_dados || jsonb_build_object('data_os',
      jsonb_build_object('de', old.data_os, 'para', new.data_os));
  end if;
  if new.observacoes is distinct from old.observacoes then
    v_dados := v_dados || jsonb_build_object('observacoes',
      jsonb_build_object('de', old.observacoes, 'para', new.observacoes));
  end if;
  if v_dados <> '{}'::jsonb then
    perform registrar_historico(new.id, 'dados_alterados', v_dados);
  end if;

  return null;
end $$;

create trigger ordens_historico
after insert or update on ordens_servico
for each row execute function historico_da_os();

-- ---------------------------------------------------------------------------
-- Gatilho dos itens
--
-- BEFORE, para ler o total ANTES de a linha mudar e de o recalculo rodar. O
-- nome sorteia antes de os_itens_trava_assinada: se a trava recusar, a
-- instrucao inteira desfaz, inclusive este registro.
-- ---------------------------------------------------------------------------
create or replace function historico_dos_itens() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_os    uuid := coalesce(new.os_id, old.os_id);
  v_total int;
begin
  select total_centavos into v_total from ordens_servico where id = v_os;
  -- OS ja removida (apagada no SQL Editor, itens saindo em cascata): nada a
  -- registrar, e gravar aqui violaria a chave estrangeira do historico.
  if found then
    perform registrar_historico(v_os, 'itens_alterados',
      jsonb_build_object('total_de', v_total, 'total_para', v_total));
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger os_itens_historico
before insert or update or delete on os_itens
for each row execute function historico_dos_itens();
