begin;

do $$
declare
  c_id uuid; v_id uuid;
  os1 uuid; os2 uuid;
  n1 bigint; n2 bigint;
  devolveu boolean;
begin
  insert into clientes (nome, telefone) values ('Cliente Teste', '11988887777')
    returning id into c_id;
  insert into veiculos (cliente_id, placa, marca, modelo)
    values (c_id, 'ABC1D23', 'GM', 'Chevette') returning id into v_id;

  -- total comeca em zero
  insert into ordens_servico (cliente_id, veiculo_id, cliente_nome,
                              veiculo_descricao, veiculo_placa)
    values (c_id, v_id, 'Cliente Teste', 'GM Chevette', 'ABC1D23')
    returning id, numero into os1, n1;
  assert (select total_centavos from ordens_servico where id = os1) = 0,
    'OS sem item deveria ter total zero';

  -- trigger recalcula na insercao
  insert into os_itens (os_id, posicao, quantidade, descricao,
                        valor_unitario_centavos, valor_total_centavos)
    values (os1, 1, 1, 'Alternador', 38000, 38000);
  insert into os_itens (os_id, posicao, quantidade, descricao,
                        valor_unitario_centavos, valor_total_centavos)
    values (os1, 2, 1, 'Correia', 10000, 10000);
  assert (select total_centavos from ordens_servico where id = os1) = 48000,
    'trigger de total falhou na insercao';

  -- trigger recalcula na remocao
  delete from os_itens where os_id = os1 and posicao = 2;
  assert (select total_centavos from ordens_servico where id = os1) = 38000,
    'trigger de total falhou na remocao';

  -- numeracao e sequencial
  insert into ordens_servico (cliente_id, veiculo_id, cliente_nome,
                              veiculo_descricao, veiculo_placa)
    values (c_id, v_id, 'Cliente Teste', 'GM Chevette', 'ABC1D23')
    returning id, numero into os2, n2;
  assert n2 = n1 + 1, 'numeracao deveria ser sequencial';

  -- cancelar a ultima devolve o numero e a OS cancelada o solta
  select cancelar_os(os2) into devolveu;
  assert devolveu, 'cancelar a ultima OS deveria devolver o numero';
  assert (select numero from ordens_servico where id = os2) is null,
    'OS cancelada que devolveu o numero deveria ficar sem numero';
  assert pg_sequence_last_value('os_numero_seq'::regclass) = n1,
    'a sequence deveria ter recuado';

  -- cancelar de novo nao devolve nada
  select cancelar_os(os2) into devolveu;
  assert not devolveu, 'cancelar duas vezes nao deveria devolver numero';

  -- cancelar uma OS que nao e a ultima mantem o numero
  select cancelar_os(os1) into devolveu;
  assert not devolveu, 'OS antiga nao deveria devolver numero';
  assert (select numero from ordens_servico where id = os1) = n1,
    'OS antiga cancelada deveria manter o numero';

  -- placa precisa estar normalizada
  begin
    insert into veiculos (cliente_id, placa) values (c_id, 'abc-1234');
    raise exception 'o check de placa deveria ter recusado minuscula com hifen';
  exception when check_violation then null;
  end;

  -- cliente com veiculo nao se apaga
  begin
    delete from clientes where id = c_id;
    raise exception 'nao deveria apagar cliente com veiculo';
  exception when foreign_key_violation then null;
  end;

  raise notice 'TODOS OS TESTES DE SCHEMA PASSARAM';
end $$;

rollback;
