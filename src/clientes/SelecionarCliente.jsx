import { useCallback, useEffect, useState } from 'react'
import { listarClientes } from '../data/clientes.js'
import { useDebounce } from '../ui/useDebounce.js'
import Busca from '../ui/Busca.jsx'
import Botao from '../ui/Botao.jsx'
import FormCliente from './FormCliente.jsx'

// Sem isto, o único caminho para cadastrar um veículo passava por criar um
// cliente novo — e o dono que trouxesse o segundo carro viraria um segundo
// cadastro, partindo o histórico em dois.
export default function SelecionarCliente({ aoEscolher, aoCriar }) {
  const [criando, setCriando] = useState(false)
  const [termo, setTermo] = useState('')
  const termoAtrasado = useDebounce(termo)
  const [clientes, setClientes] = useState([])
  const [erro, setErro] = useState('')

  const buscar = useCallback(
    (t) =>
      listarClientes({ termo: t })
        .then((lista) => { setClientes(lista.slice(0, 6)); setErro('') })
        .catch((e) => setErro(e.message)),
    [],
  )

  useEffect(() => { buscar(termoAtrasado) }, [buscar, termoAtrasado])

  if (criando) {
    return (
      <>
        <p className="mb-3 text-sm text-mute">Cadastro do novo cliente.</p>
        <FormCliente embutido aoSalvar={aoCriar} aoCancelar={() => setCriando(false)} />
      </>
    )
  }

  return (
    <>
      <h2 className="mb-2 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
        De quem é este carro?
      </h2>

      <Busca valor={termo} aoMudar={setTermo} placeholder="Nome ou telefone do cliente" />

      {erro && <p className="mb-2 text-sm font-semibold text-red">{erro}</p>}

      {clientes.length === 0 && (
        <p className="mb-2 text-sm text-mute">
          {termo ? 'Nenhum cliente com esse nome.' : 'Nenhum cliente cadastrado ainda.'}
        </p>
      )}

      <ul className="mb-3">
        {clientes.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => aoEscolher(c)}
              className="mb-1.5 flex w-full items-center rounded-xl border border-linha bg-paper px-3 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{c.nome}</span>
                <span className="text-xs text-mute">{c.telefone || 'sem telefone'}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Botao variante="fantasma" tamanho="pequeno" onClick={() => setCriando(true)}>
        + Cadastrar cliente novo
      </Botao>
    </>
  )
}
