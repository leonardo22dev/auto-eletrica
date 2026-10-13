import { supabase } from '../data/supabase.js'
import { registrarPdfDaOrdem } from '../data/ordens.js'
import { gerarPdfDaOS, nomeArquivoPdf } from './gerar.jsx'
import { linkWhatsApp } from '../lib/telefone.js'

const BUCKET = 'os-pdfs'

export function baixarPdf(blob, nome) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Regera e substitui o PDF já publicado. Precisa gravar exatamente sobre o
// caminho antigo — se o nome do arquivo fosse recalculado, o link que o
// cliente tem no WhatsApp continuaria apontando para a versão errada. E o
// nome muda: uma OS cancelada perde o número.
export async function republicarPdf({ os, config }) {
  if (!os?.pdf_path) return null
  const blob = await gerarPdfDaOS(os, config)
  return subirPdf(os, blob, os.pdf_path)
}

// O caminho carrega o uuid da OS: público, mas não adivinhável.
async function subirPdf(os, blob, caminhoExistente) {
  const caminho = caminhoExistente || `${os.id}/${nomeArquivoPdf(os)}`
  const { error } = await supabase.storage.from(BUCKET)
    .upload(caminho, blob, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error('Não foi possível enviar o PDF.')
  await registrarPdfDaOrdem(os.id, caminho)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho)
  return data.publicUrl
}

function mensagem(os, config, url) {
  const titulo = os.numero == null ? 'sua ordem de serviço' : `a OS nº ${os.numero}`
  const linhas = [
    `Olá, ${os.cliente_nome}! Segue ${titulo} da ${config.razao_social}.`,
    `Veículo: ${os.veiculo_descricao} — ${os.veiculo_placa}`,
  ]
  if (url) linhas.push(url)
  return linhas.join('\n')
}

// No celular, a Web Share API entrega o arquivo direto ao WhatsApp.
// No desktop isso não existe: o navegador não anexa arquivo no WhatsApp Web,
// então o PDF sobe para o Storage e vai o link.
export async function enviarOsPorWhatsApp({ os, config }) {
  const blob = await gerarPdfDaOS(os, config)
  const nome = nomeArquivoPdf(os)
  const arquivo = new File([blob], nome, { type: 'application/pdf' })

  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({
        files: [arquivo],
        title: nome,
        text: mensagem(os, config, null),
      })
      return { via: 'compartilhamento' }
    } catch (erro) {
      if (erro?.name === 'AbortError') return { via: 'cancelado' }
      // Qualquer outra falha cai no caminho do link, abaixo.
    }
  }

  try {
    const url = await subirPdf(os, blob)
    window.open(linkWhatsApp(os.cliente_telefone, mensagem(os, config, url)), '_blank')
    return { via: 'link', url }
  } catch {
    // Sem rede para subir, ao menos entrega o arquivo na mão do dono.
    baixarPdf(blob, nome)
    return { via: 'download' }
  }
}
