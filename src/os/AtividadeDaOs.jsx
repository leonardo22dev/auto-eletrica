import { useEffect, useState } from 'react'
import { listarAtividadeDaOs } from '../data/historico.js'
import { formatarDataHora } from '../lib/datas.js'
import { textoDoEvento } from './textoDoEvento.js'

export function ListaDeEventos({ eventos }) {
  if (eventos.length === 0) {
    return <p className="text-sm text-mute">Nenhuma atividade registrada.</p>
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {eventos.map((ev) => (
        <li key={ev.id} className="text-[13px]">
          <span className="block">{textoDoEvento(ev)}</span>
          <span className="text-[11px] text-mute">{formatarDataHora(ev.em)}</span>
        </li>
      ))}
    </ul>
  )
}

// `recarregarEm` é qualquer valor que muda quando a OS muda (o carimbo de
// atualização): a lista é lida de novo sem a tela precisar saber como.
export default function AtividadeDaOs({ osId, recarregarEm }) {
  const [eventos, setEventos] = useState([])
  const [falha, setFalha] = useState(false)

  useEffect(() => {
    let cancelado = false
    listarAtividadeDaOs(osId)
      .then((lista) => { if (!cancelado) { setEventos(lista); setFalha(false) } })
      .catch(() => { if (!cancelado) setFalha(true) })
    return () => { cancelado = true }
  }, [osId, recarregarEm])

  return (
    <section className="mt-3 rounded-xl border border-linha bg-paper p-3">
      <h2 className="mb-2 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
        Atividade
      </h2>
      {falha
        ? <p className="text-sm text-mute">Não foi possível carregar a atividade.</p>
        : <ListaDeEventos eventos={eventos} />}
    </section>
  )
}
