import { useEffect, useState } from 'react'
import { listarOsExcluidas } from '../data/ordens.js'
import { formatarDataHora } from '../lib/datas.js'
import { formatarPlaca } from '../lib/placa.js'
import { formatarBRL } from '../lib/dinheiro.js'

export function ListaOsExcluidas({ registros }) {
  if (registros.length === 0) {
    return <p className="text-sm text-mute">Nenhuma OS excluída.</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {registros.map((r) => (
        <li key={r.id} className="rounded-xl border border-linha bg-paper px-3 py-2.5 text-[13px]">
          <p className="font-bold">
            {r.numero != null ? `OS nº ${r.numero} · ` : ''}{r.cliente_nome}
          </p>
          <p className="text-mute">
            {[formatarPlaca(r.veiculo_placa), r.veiculo_descricao, formatarBRL(r.total_centavos)]
              .filter(Boolean).join(' · ')}
          </p>
          {r.assinada && (
            <p className="text-[12px] font-semibold text-red">
              Estava assinada pelo cliente em {formatarDataHora(r.aceite_em)}
            </p>
          )}
          <p className="mt-1 text-[11.5px] text-mute">
            Excluída por {r.excluida_por_nome} em {formatarDataHora(r.excluida_em)}
          </p>
        </li>
      ))}
    </ul>
  )
}

// Só o administrador chega aqui (a página de Ajustes é dele) e só ele lê a
// tabela: para os outros a lista voltaria vazia.
export default function OsExcluidas() {
  const [registros, setRegistros] = useState(null)
  const [falha, setFalha] = useState(false)

  useEffect(() => {
    let cancelado = false
    listarOsExcluidas()
      .then((dados) => { if (!cancelado) setRegistros(dados) })
      .catch(() => { if (!cancelado) setFalha(true) })
    return () => { cancelado = true }
  }, [])

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
        OS excluídas
      </h2>
      {falha && <p className="text-sm text-mute">Não foi possível carregar o registro.</p>}
      {!falha && registros === null && <p className="text-sm text-mute">Carregando…</p>}
      {!falha && registros !== null && <ListaOsExcluidas registros={registros} />}
    </section>
  )
}
