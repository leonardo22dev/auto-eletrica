-- O total nunca e responsabilidade do front: o banco recalcula sozinho.
create or replace function recalcular_total_os() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare alvo uuid;
begin
  alvo := coalesce(new.os_id, old.os_id);
  update ordens_servico
     set total_centavos = coalesce(
           (select sum(valor_total_centavos) from os_itens where os_id = alvo), 0),
         atualizado_em = now()
   where id = alvo;
  return null;
end $$;

create trigger os_itens_recalcula_total
after insert or update or delete on os_itens
for each row execute function recalcular_total_os();

create or replace function tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create trigger clientes_toca_atualizado before update on clientes
  for each row execute function tocar_atualizado_em();
create trigger veiculos_toca_atualizado before update on veiculos
  for each row execute function tocar_atualizado_em();
create trigger ordens_toca_atualizado before update on ordens_servico
  for each row execute function tocar_atualizado_em();

-- Cancela a OS e, se ela for a ultima emitida, devolve o numero a sequence.
-- Devolve true quando o numero foi devolvido.
create or replace function cancelar_os(p_os_id uuid) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_numero bigint;
  v_status text;
  v_seq    bigint;
begin
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

  -- So devolve se esta OS for de fato a ponta da numeracao. Se outra pessoa
  -- emitiu uma OS no intervalo, a sequence ja avancou, a comparacao falha e
  -- nada e devolvido - a condicao se protege sozinha contra concorrencia.
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

-- Usada na tela de Configuracoes para continuar de onde o talao parou.
create or replace function definir_proximo_numero(p_numero bigint) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_numero < 1 then
    raise exception 'O proximo numero precisa ser maior que zero';
  end if;
  if exists (select 1 from ordens_servico
              where numero is not null and numero >= p_numero) then
    raise exception 'Ja existe OS com numero maior ou igual a %', p_numero;
  end if;
  perform setval('os_numero_seq', p_numero, false);
end $$;
