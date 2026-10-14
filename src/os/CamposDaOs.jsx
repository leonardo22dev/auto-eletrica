import { normalizarPlaca } from '../lib/placa.js'
import Campo from '../ui/Campo.jsx'

// Os cinco campos do talão. Usado na Nova OS e na correção da OS aberta —
// sem cadastro por trás, são estes campos que formam o documento.
export default function CamposDaOs({ campos, aoMudar, erroPlaca = '' }) {
  function mudar(chave, valor) {
    aoMudar({ ...campos, [chave]: valor })
  }

  return (
    <>
      <div className="mb-3">
        <label
          htmlFor="placa"
          className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-mute uppercase"
        >
          Placa
        </label>
        {/* maxLength 10, não 7: colar "ABC-1234" do WhatsApp era truncado
            pelo navegador antes da normalização, e o campo ficava "ABC123" —
            sem sugestão e sem aviso de garantia. Quem valida é placaValida. */}
        <input
          id="placa"
          value={campos.veiculo_placa}
          onChange={(e) => mudar('veiculo_placa', normalizarPlaca(e.target.value))}
          maxLength={10}
          autoCapitalize="characters"
          placeholder="ABC1D23"
          className={`h-15 w-full rounded-xl border-[1.5px] bg-paper text-center text-2xl font-extrabold tracking-[0.14em] focus:outline-none ${erroPlaca ? 'border-red' : 'border-ink'}`}
        />
        {erroPlaca && <p className="mt-1 text-xs font-semibold text-red">{erroPlaca}</p>}
      </div>

      <Campo
        id="data_os"
        rotulo="Data"
        tipo="date"
        valor={campos.data_os}
        aoMudar={(v) => mudar('data_os', v)}
      />
      <Campo
        id="cliente_nome"
        rotulo="Nome do cliente"
        autoComplete="name"
        valor={campos.cliente_nome}
        aoMudar={(v) => mudar('cliente_nome', v)}
      />
      <Campo
        id="cliente_telefone"
        rotulo="Telefone"
        inputMode="tel"
        autoComplete="tel"
        valor={campos.cliente_telefone}
        aoMudar={(v) => mudar('cliente_telefone', v)}
      />
      <Campo
        id="veiculo_descricao"
        rotulo="Veículo"
        valor={campos.veiculo_descricao}
        aoMudar={(v) => mudar('veiculo_descricao', v)}
        placeholder="GM Chevette 1982 — Bege"
      />
    </>
  )
}
