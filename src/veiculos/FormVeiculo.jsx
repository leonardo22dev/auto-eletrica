import { useState } from 'react'
import { normalizarPlaca, placaValida } from '../lib/placa.js'
import Campo from '../ui/Campo.jsx'
import Botao from '../ui/Botao.jsx'

const VAZIO = { placa: '', marca: '', modelo: '', ano: '', cor: '', observacoes: '' }

export default function FormVeiculo({
  clienteId,
  valorInicial,
  aoSalvar,
  aoCancelar,
  embutido = false,
  rotuloSalvar = 'Salvar veículo',
}) {
  const [form, setForm] = useState({ ...VAZIO, ...(valorInicial || {}) })
  const [erro, setErro] = useState('')
  const [erroPlaca, setErroPlaca] = useState('')
  const [salvando, setSalvando] = useState(false)

  function mudar(chave, valor) {
    setForm((f) => ({ ...f, [chave]: valor }))
  }

  function mudarPlaca(valor) {
    setErroPlaca('')
    mudar('placa', normalizarPlaca(valor))
  }

  async function enviar(e) {
    e.preventDefault()
    if (!placaValida(form.placa)) {
      setErroPlaca('Placa inválida. Use ABC1234 ou ABC1D23.')
      return
    }
    setErro('')
    setSalvando(true)
    try {
      await aoSalvar({
        cliente_id: clienteId ?? form.cliente_id,
        placa: normalizarPlaca(form.placa),
        marca: form.marca?.trim() || null,
        modelo: form.modelo?.trim() || null,
        ano: form.ano ? Number(form.ano) : null,
        cor: form.cor?.trim() || null,
        observacoes: form.observacoes?.trim() || null,
      })
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form
      onSubmit={enviar}
      className={embutido ? '' : 'rounded-xl border border-linha bg-paper p-4'}
    >
      {embutido && (
        <h2 className="mb-3 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
          Veículo
        </h2>
      )}

      <Campo
        id="placa"
        rotulo="Placa"
        valor={form.placa}
        aoMudar={mudarPlaca}
        erro={erroPlaca}
        maxLength={7}
        autoCapitalize="characters"
        className="h-15 text-center text-2xl font-extrabold tracking-[0.14em]"
      />
      <Campo id="marca" rotulo="Marca" valor={form.marca || ''}
        aoMudar={(v) => mudar('marca', v)} />
      <Campo id="modelo" rotulo="Modelo" valor={form.modelo || ''}
        aoMudar={(v) => mudar('modelo', v)} />
      <Campo id="ano" rotulo="Ano" tipo="number" inputMode="numeric"
        valor={form.ano || ''} aoMudar={(v) => mudar('ano', v)} />
      <Campo id="cor" rotulo="Cor" valor={form.cor || ''}
        aoMudar={(v) => mudar('cor', v)} />

      <div className="mb-3">
        <label
          htmlFor="obs-veiculo"
          className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-mute uppercase"
        >
          Observações
        </label>
        <textarea
          id="obs-veiculo"
          rows={3}
          value={form.observacoes || ''}
          onChange={(e) => mudar('observacoes', e.target.value)}
          className="w-full rounded-xl border-[1.5px] border-linha bg-paper p-3.5 text-[15px] focus:border-ink focus:outline-none"
        />
      </div>

      {erro && <p className="mb-3 text-sm font-semibold text-red">{erro}</p>}

      <div className="flex gap-2">
        {aoCancelar && (
          <Botao type="button" variante="fantasma" onClick={aoCancelar}>
            Cancelar
          </Botao>
        )}
        <Botao type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : rotuloSalvar}
        </Botao>
      </div>
    </form>
  )
}
