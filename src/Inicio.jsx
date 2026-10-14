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
        listarOrdens({ status: STATUS.ORCAMENTO, limite: 200 }),
        listarOrdens({ status: STATUS.FINALIZADA, limite: 500 }),
        listarOrdens({ emAberto: true, limite: 200 }),
      ])
        .then(([orcamentos, finalizadas, pendentes]) => {
          const inicioDoMes = `${hojeISO().slice(0, 8)}01`
          const faturado = somarCentavos(
            finalizadas
              .filter((o) => o.data_os && o.data_os >= inicioDoMes)
              .map((o) => o.total_centavos),
          )
          setDados({
            // A lista do que está pendurado já traz orçamentos e aprovadas:
            // os dois números saem dela, sem uma consulta a mais.
            emAberto: pendentes.length,
            // A tela mostra as primeiras; o resto vive no Histórico.
            maisQueCabe: Math.max(0, pendentes.length - 20),
            orcamentos: orcamentos.length,
            faturado,
            pendentes,
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
            Em aberto
          </h2>

          {dados.pendentes.length === 0 ? (
            <EstadoVazio
              titulo="Nada em aberto"
              descricao="Todo orçamento foi respondido e todo serviço foi concluído."
              acao={<Botao onClick={() => navegar('/os/nova')}>Nova OS</Botao>}
            />
          ) : (
            <ul>
              {dados.pendentes.slice(0, 20).map((o) => (
                <li key={o.id}>
                  <LinhaOS os={o} aoClicar={() => navegar(`/os/${o.id}`)} />
                </li>
              ))}
            </ul>
          )}

          {dados.maisQueCabe > 0 && (
            <button
              type="button"
              onClick={() => navegar('/os')}
              className="mt-1 w-full py-2 text-sm font-semibold text-red"
            >
              e mais {dados.maisQueCabe} no Histórico
            </button>
          )}
        </>
      )}
    </div>
  )
}
