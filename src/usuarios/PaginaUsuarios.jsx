import { useCallback, useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useAuth } from '../auth/contexto.js'
import {
  listarUsuarios, criarUsuario, alterarUsuario, redefinirSenha, excluirUsuario,
  listarAtividadeDeUsuarios,
} from '../data/usuarios.js'
import { formatarDataHora } from '../lib/datas.js'
import ListaUsuarios from './ListaUsuarios.jsx'
import FormUsuario from './FormUsuario.jsx'
import Botao from '../ui/Botao.jsx'
import { textoDaAtividade } from './regras.js'

export default function PaginaUsuarios() {
  const { perfil } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [atividade, setAtividade] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [falha, setFalha] = useState('')
  // null | { tipo: 'novo' } | { tipo: 'editar'|'senha'|'bloquear', alvo }
  const [painel, setPainel] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [erroDoPainel, setErroDoPainel] = useState('')

  // Em cadeia de promessas, e não async/await, para que o efeito abaixo não
  // dispare um setState síncrono (mesmo padrão de useConfiguracoes).
  const carregar = useCallback(
    () =>
      Promise.all([listarUsuarios(), listarAtividadeDeUsuarios({ limite: 15 })])
        .then(([lista, eventos]) => {
          setUsuarios(lista)
          setAtividade(eventos)
          setFalha('')
        })
        .catch((e) => setFalha(e.message))
        .finally(() => setCarregando(false)),
    [],
  )

  useEffect(() => { carregar() }, [carregar])

  function abrir(novoPainel) {
    setErroDoPainel('')
    setPainel(novoPainel)
  }

  async function executar(acao) {
    setEnviando(true)
    setErroDoPainel('')
    try {
      await acao()
      setPainel(null)
      await carregar()
    } catch (e) {
      setErroDoPainel(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const salvar = (dados) => {
    if (painel.tipo === 'novo') return executar(() => criarUsuario(dados))
    if (painel.tipo === 'editar') {
      return executar(() => alterarUsuario({
        userId: painel.alvo.user_id, nome: dados.nome, papel: dados.papel,
        ativo: painel.alvo.ativo,
      }))
    }
    return executar(() => redefinirSenha({ userId: painel.alvo.user_id, senha: dados.senha }))
  }

  const mudarAtivo = (alvo, ativo) => executar(() => alterarUsuario({
    userId: alvo.user_id, nome: alvo.nome, papel: alvo.papel, ativo,
  }))

  const excluir = (alvo) => executar(() => excluirUsuario({ userId: alvo.user_id }))

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">Usuários</h1>
        {!painel && (
          <Botao tamanho="pequeno" className="w-auto" type="button"
            onClick={() => abrir({ tipo: 'novo' })}>
            <UserPlus size={16} aria-hidden="true" />
            Novo usuário
          </Botao>
        )}
      </div>

      {painel && painel.tipo === 'bloquear' && (
        <div className="mb-4 rounded-xl border border-red/40 bg-paper p-3">
          <p className="font-bold">Bloquear {painel.alvo.nome}?</p>
          <p className="mt-1 text-sm text-mute">
            A pessoa perde o acesso na hora, mesmo com o app aberto, e não consegue
            entrar de novo até ser reativada. As OS dela continuam no sistema.
          </p>
          {erroDoPainel && (
            <p role="alert" className="mt-2 text-sm font-semibold text-red">{erroDoPainel}</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Botao variante="fantasma" type="button" disabled={enviando}
              onClick={() => setPainel(null)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" type="button" disabled={enviando}
              onClick={() => mudarAtivo(painel.alvo, false)}>
              {enviando ? 'Bloqueando…' : 'Bloquear'}
            </Botao>
          </div>
        </div>
      )}

      {painel && painel.tipo === 'excluir' && (
        <div className="mb-4 rounded-xl border border-red/40 bg-paper p-3">
          <p className="font-bold">
            Excluir {painel.alvo.nome} (@{painel.alvo.usuario}) de vez?
          </p>
          <p className="mt-1 text-sm text-mute">
            A conta e a senha são apagadas e não têm volta. As OS que a pessoa fez
            continuam no sistema, e a atividade continua mostrando o nome dela.
            Se ela puder voltar um dia, prefira <strong>Bloquear</strong>.
          </p>
          {erroDoPainel && (
            <p role="alert" className="mt-2 text-sm font-semibold text-red">{erroDoPainel}</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Botao variante="fantasma" type="button" disabled={enviando}
              onClick={() => setPainel(null)}>
              Voltar
            </Botao>
            <Botao variante="perigo" type="button" disabled={enviando}
              onClick={() => excluir(painel.alvo)}>
              {enviando ? 'Excluindo…' : 'Excluir de vez'}
            </Botao>
          </div>
        </div>
      )}

      {painel && painel.tipo !== 'bloquear' && painel.tipo !== 'excluir' && (
        <FormUsuario
          key={`${painel.tipo}-${painel.alvo?.user_id ?? 'novo'}`}
          modo={painel.tipo}
          alvo={painel.alvo}
          aoSalvar={salvar}
          aoCancelar={() => setPainel(null)}
          enviando={enviando}
          erro={erroDoPainel}
        />
      )}

      {falha && (
        <p role="alert" className="mb-3 rounded-lg bg-red/10 px-3 py-2 text-sm font-semibold text-red">
          {falha}
        </p>
      )}

      {carregando ? (
        <p className="text-mute">Carregando…</p>
      ) : (
        <ListaUsuarios
          usuarios={usuarios}
          euId={perfil?.user_id}
          aoEditar={(u) => abrir({ tipo: 'editar', alvo: u })}
          aoRedefinir={(u) => abrir({ tipo: 'senha', alvo: u })}
          aoBloquear={(u) => abrir({ tipo: 'bloquear', alvo: u })}
          aoReativar={(u) => mudarAtivo(u, true)}
          aoExcluir={(u) => abrir({ tipo: 'excluir', alvo: u })}
        />
      )}

      {atividade.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
            Atividade recente
          </h2>
          <ul className="flex flex-col gap-1.5">
            {atividade.map((ev) => (
              <li key={ev.id} className="rounded-lg border border-linha bg-paper px-3 py-2 text-[13px]">
                <span className="block">{textoDaAtividade(ev)}</span>
                <span className="text-[11px] text-mute">{formatarDataHora(ev.em)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
