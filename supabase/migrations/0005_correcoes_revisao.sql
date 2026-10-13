-- Correcoes apontadas na revisao do branch de implementacao.

-- ---------------------------------------------------------------------------
-- 1. Substituicao de itens em uma unica transacao.
--
-- Antes o front apagava e reinseria em duas requisicoes HTTP, logo duas
-- transacoes. Se a insercao falhasse depois do delete - 4G caindo no meio do
-- salvamento, que o spec declara esperar - a OS ficava sem nenhum item e com
-- total zero. Documento emitido destruido, sem copia.
create or replace function substituir_itens(p_os_id uuid, p_itens jsonb)
returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from ordens_servico where id = p_os_id) then
    raise exception 'OS % nao encontrada', p_os_id;
  end if;

  delete from os_itens where os_id = p_os_id;

  insert into os_itens (os_id, posicao, quantidade, descricao,
                        valor_unitario_centavos, valor_total_centavos)
  select p_os_id,
         (item->>'posicao')::int,
         (item->>'quantidade')::numeric,
         item->>'descricao',
         (item->>'valor_unitario_centavos')::int,
         (item->>'valor_total_centavos')::int
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) as item;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Data de abertura no fuso da oficina.
--
-- O Supabase roda com TimeZone = UTC, e current_date segue o GUC. Uma OS
-- aberta as 21h30 de 12/08 em Sao Paulo nascia datada de 13/08, e era essa
-- data que ia impressa no documento entregue ao cliente.
alter table ordens_servico
  alter column data_abertura
  set default (now() at time zone 'America/Sao_Paulo')::date;

-- ---------------------------------------------------------------------------
-- 3. Instante da finalizacao.
--
-- data_conclusao e `date`, entao nao havia como saber se uma edicao aconteceu
-- depois da emissao no mesmo dia - justamente o caso comum de correcao, em que
-- a marca "Editada em" precisava aparecer e nao aparecia.
alter table ordens_servico add column if not exists finalizada_em timestamptz;

update ordens_servico
   set finalizada_em = data_conclusao::timestamptz
 where status = 'finalizada' and finalizada_em is null and data_conclusao is not null;

-- ---------------------------------------------------------------------------
-- 4. Numeracao serializada.
--
-- nextval nao e transacional e nao trava nada: entre a leitura da ponta da
-- sequence em cancelar_os e o setval, outra sessao podia emitir uma OS. O
-- resultado era numeracao fora de ordem e, na OS seguinte, violacao de
-- unicidade chegando a tela como erro sem sentido. O lock consultivo faz as
-- duas operacoes se enfileirarem na mesma chave.
alter table ordens_servico alter column numero drop default;

create or replace function atribuir_numero_os() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('os_numero_seq'));
    new.numero := nextval('os_numero_seq');
  end if;
  return new;
end $$;

drop trigger if exists ordens_atribui_numero on ordens_servico;
create trigger ordens_atribui_numero before insert on ordens_servico
  for each row execute function atribuir_numero_os();

create or replace function cancelar_os(p_os_id uuid) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_numero bigint;
  v_status text;
  v_seq    bigint;
begin
  -- Mesma chave do gatilho de numeracao: cancelamento e emissao nao correm
  -- juntos.
  perform pg_advisory_xact_lock(hashtext('os_numero_seq'));

  select numero, status into v_numero, v_status
    from ordens_servico where id = p_os_id for update;

  if not found then
    raise exception 'OS % nao encontrada', p_os_id;
  end if;
  if v_status = 'cancelada' then
    return false;
  end if;

  update ordens_servico set status = 'cancelada' where id = p_os_id;

  v_seq := pg_sequence_last_value('os_numero_seq'::regclass);

  if v_numero is not null
     and v_seq = v_numero
     and not exists (select 1 from ordens_servico
                      where numero is not null and numero > v_numero) then
    update ordens_servico set numero = null where id = p_os_id;
    if v_numero <= 1 then
      perform setval('os_numero_seq', 1, false);
    else
      perform setval('os_numero_seq', v_numero - 1, true);
    end if;
    return true;
  end if;

  return false;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Carimbo de atualizacao nas configuracoes, que nenhum gatilho tocava.
create trigger configuracoes_toca_atualizado before update on configuracoes
  for each row execute function tocar_atualizado_em();
