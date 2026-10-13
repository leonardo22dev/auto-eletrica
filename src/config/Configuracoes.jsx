import { useState } from 'react'
import {
  useConfiguracoes,
  salvarConfiguracoes,
  definirProximoNumero,
} from '../data/configuracoes.js'
import { useAuth } from '../auth/contexto.js'
import Campo from '../ui/Campo.jsx'
import Botao from '../ui/Botao.jsx'

const CAMPOS = [
  { chave: 'razao_social', rotulo: 'Razão social' },
  { chave: 'cnpj', rotulo: 'CNPJ' },
  { chave: 'inscricao_estadual', rotulo: 'Inscrição estadual' },
  { chave: 'endereco', rotulo: 'Endereço' },
  { chave: 'cidade_uf', rotulo: 'Cidade / UF' },
  { chave: 'telefone', rotulo: 'Telefone', inputMode: 'tel' },
  { chave: 'email', rotulo: 'E-mail', inputMode: 'email' },
]

export default function Configuracoes() {
  const { config, carregando, erro, recarregar } = useConfiguracoes()
  const { sair } = useAuth()
  const [form, setForm] = useState(null)
  const [servicos, setServicos] = useState('')
  const [carregado, setCarregado] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [falha, setFalha] = useState('')

  const [proximo, setProximo] = useState('')
  const [avisoNumero, setAvisoNumero] = useState('')
  const [falhaNumero, setFalhaNumero] = useState('')

  // Ajuste de estado durante o render, não em efeito: quando chega uma
  // configuração nova do banco, o formulário é semeado com ela. Em efeito
  // isso custaria um render extra e um piscar de campos vazios.
  if (config && config !== carregado) {
    setCarregado(config)
    setForm(config)
    setServicos((config.servicos_cabecalho || []).join('\n'))
  }

  function mudar(chave, valor) {
    setForm((f) => ({ ...f, [chave]: valor }))
  }

  async function aoSalvar(e) {
    e.preventDefault()
    setAviso('')
    setFalha('')
    setSalvando(true)
    try {
      const dados = {}
      for (const { chave } of CAMPOS) dados[chave] = form[chave]
      dados.servicos_cabecalho = servicos
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      dados.texto_garantia = form.texto_garantia
      dados.garantia_meses = Number(form.garantia_meses) || 3

      await salvarConfiguracoes(dados)
      setAviso('Configurações salvas.')
      recarregar()
    } catch (err) {
      setFalha(err.message)
    } finally {
      setSalvando(false)
    }
  }

  async function aoDefinirNumero(e) {
    e.preventDefault()
    setAvisoNumero('')
    setFalhaNumero('')
    try {
      await definirProximoNumero(proximo)
      setAvisoNumero('Próxima OS sairá com o número ' + proximo + '.')
      setProximo('')
    } catch (err) {
      setFalhaNumero(err.message)
    }
  }

  if (carregando) return <p className="p-6 text-mute">Carregando…</p>
  if (erro) return <p className="p-6 text-red">{erro}</p>
  if (!form) return null

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Configurações</h1>

      <form onSubmit={aoSalvar} className="rounded-xl border border-linha bg-paper p-4">
        <h2 className="mb-3 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
          Dados da empresa
        </h2>

        {CAMPOS.map(({ chave, rotulo, inputMode }) => (
          <Campo
            key={chave}
            id={chave}
            rotulo={rotulo}
            inputMode={inputMode}
            valor={form[chave] || ''}
            aoMudar={(v) => mudar(chave, v)}
          />
        ))}

        <div className="mb-3">
          <label
            htmlFor="servicos"
            className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-mute uppercase"
          >
            Serviços do cabeçalho (um por linha)
          </label>
          <textarea
            id="servicos"
            rows={6}
            value={servicos}
            onChange={(e) => setServicos(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-linha bg-paper p-3.5 text-[15px] focus:border-ink focus:outline-none"
          />
        </div>

        <div className="mb-3">
          <label
            htmlFor="texto_garantia"
            className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-mute uppercase"
          >
            Texto da garantia (tarja do documento)
          </label>
          <textarea
            id="texto_garantia"
            rows={2}
            value={form.texto_garantia || ''}
            onChange={(e) => mudar('texto_garantia', e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-linha bg-paper p-3.5 text-[15px] focus:border-ink focus:outline-none"
          />
        </div>

        <Campo
          id="garantia_meses"
          rotulo="Meses de garantia"
          tipo="number"
          inputMode="numeric"
          min={1}
          valor={form.garantia_meses ?? 3}
          aoMudar={(v) => mudar('garantia_meses', v)}
        />

        {aviso && <p className="mb-3 text-sm font-semibold text-[#15803D]">{aviso}</p>}
        {falha && <p className="mb-3 text-sm font-semibold text-red">{falha}</p>}

        <Botao type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </form>

      <form
        onSubmit={aoDefinirNumero}
        className="mt-4 rounded-xl border border-linha bg-paper p-4"
      >
        <h2 className="mb-1 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
          Numeração
        </h2>
        <p className="mb-3 text-sm text-mute">
          Defina o número da próxima OS para continuar de onde o talão de papel parou.
          Só funciona se nenhuma OS já tiver esse número ou um maior.
        </p>

        <Campo
          id="proximo"
          rotulo="Próximo número"
          tipo="number"
          inputMode="numeric"
          min={1}
          valor={proximo}
          aoMudar={setProximo}
        />

        {avisoNumero && (
          <p className="mb-3 text-sm font-semibold text-[#15803D]">{avisoNumero}</p>
        )}
        {falhaNumero && (
          <p className="mb-3 text-sm font-semibold text-red">{falhaNumero}</p>
        )}

        <Botao type="submit" variante="fantasma" disabled={!proximo}>
          Definir
        </Botao>
      </form>

      <div className="mt-4">
        <Botao variante="fantasma" onClick={sair}>
          Sair
        </Botao>
      </div>
    </div>
  )
}
