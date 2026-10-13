import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { listarOrdens } from './data/ordens.js'
import { STATUS } from './lib/status.js'
import { hojeISO } from './lib/datas.js'
import { formatarBRL, somarCentavos } from './lib/dinheiro.js'
import { LinhaOS } from './os/ListaOS.jsx'
import Botao from './ui/Botao.jsx'
import EstadoVazio from './ui/EstadoVazio.jsx'

function Numero({ valor, rotulo, miudo = false }) {
  return (
    <div className="flex-1 rounded-xl border border-linha bg-paper px-2 py-2.5">
      <strong
        className={`block font-extrabold tracking-tight ${miudo ? 'text-[15px]' : 'text-[19px]'}`}
      >
        {valor}
      </strong>
      <span className="text-[9px] font-semibold tracking-[0.07em] text-mute uppercase">
        {rotulo}
      </span>
    </div>
  )
}

export default function Inicio() {
  const navegar = useNavigate()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  const buscar = useCallback(
    () =>
      Promise.all([
        listarOrdens({ status: STATUS.APROVADA, limite: 200 }),
        listarOrdens({ status: STATUS.ORCAMENTO, limite: 200 }),
        listarOrdens({ status: STATUS.FINALIZADA, limite: 500 }),
        listarOrdens({ limite: 8 }),
      ])
        .then(([aprovadas, orcamentos, finalizadas, recentes]) => {
          const inicioDoMes = `${hojeISO().slice(0, 8)}01`
          const faturado = somarCentavos(
            finalizadas
              .filter((o) => o.data_conclusao && o.data_conclusao >= inicioDoMes)
              .map((o) => o.total_centavos),
          )
          setDados({
            emAberto: aprovadas.length,
            orcamentos: orcamentos.length,
            faturado,
            recentes,
          })
          setErro('')
        })
        .catch((e) => setErro(e.message))
        .finally(() => setCarregando(false)),
    [],
  )

  useEffect(() => { buscar() }, [buscar])

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <Botao className="mb-3.5" onClick={() => navegar('/os/nova')}>
        <Plus size={20} aria-hidden="true" /> Nova OS
      </Botao>

      {erro && <p className="mb-3 text-sm font-semibold text-red">{erro}</p>}
      {carregando && <p className="text-mute">Carregando…</p>}

      {dados && (
        <>
          <div className="mb-3.5 flex gap-1.5">
            <Numero valor={dados.emAberto} rotulo="Em aberto" />
            <Numero valor={dados.orcamentos} rotulo="Orçam." />
            <Numero valor={formatarBRL(dados.faturado)} rotulo="Mês" miudo />
          </div>

          <h2 className="mb-2 text-[9.5px] font-bold tracking-[0.14em] text-mute uppercase">
            Recentes
          </h2>

          {dados.recentes.length === 0 ? (
            <EstadoVazio
              titulo="Nenhuma OS ainda"
              descricao="A primeira OS começa pela placa do veículo."
              acao={<Botao onClick={() => navegar('/os/nova')}>Abrir a primeira</Botao>}
            />
          ) : (
            <ul>
              {dados.recentes.map((o) => (
                <li key={o.id}>
                  <LinhaOS os={o} aoClicar={() => navegar(`/os/${o.id}`)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
