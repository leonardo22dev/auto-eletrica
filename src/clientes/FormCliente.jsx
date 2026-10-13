import { useState } from 'react'
import Campo from '../ui/Campo.jsx'
import Botao from '../ui/Botao.jsx'

const VAZIO = { nome: '', telefone: '', email: '', observacoes: '' }

export default function FormCliente({
  valorInicial,
  aoSalvar,
  aoCancelar,
  embutido = false,
  rotuloSalvar = 'Salvar cliente',
}) {
  const [form, setForm] = useState({ ...VAZIO, ...(valorInicial || {}) })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  function mudar(chave, valor) {
    setForm((f) => ({ ...f, [chave]: valor }))
  }

  async function enviar(e) {
    e.preventDefault()
    if (!form.nome.trim()) {
      setErro('O nome do cliente é obrigatório.')
      return
    }
    setErro('')
    setSalvando(true)
    try {
      await aoSalvar({
        nome: form.nome.trim(),
        telefone: form.telefone?.trim() || null,
        email: form.email?.trim() || null,
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
          Cliente
        </h2>
      )}

      <Campo
        id="nome"
        rotulo="Nome"
        valor={form.nome}
        aoMudar={(v) => mudar('nome', v)}
        autoComplete="name"
      />
      <Campo
        id="telefone"
        rotulo="Telefone"
        inputMode="tel"
        valor={form.telefone || ''}
        aoMudar={(v) => mudar('telefone', v)}
        autoComplete="tel"
      />
      <Campo
        id="email"
        rotulo="E-mail"
        inputMode="email"
        valor={form.email || ''}
        aoMudar={(v) => mudar('email', v)}
      />

      <div className="mb-3">
        <label
          htmlFor="observacoes"
          className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-mute uppercase"
        >
          Observações
        </label>
        <textarea
          id="observacoes"
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
