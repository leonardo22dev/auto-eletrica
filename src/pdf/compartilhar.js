import { supabase } from '../data/supabase.js'
import { registrarPdfDaOrdem } from '../data/ordens.js'
import { gerarPdfDaOS, nomeArquivoPdf } from './gerar.jsx'
import { linkWhatsApp } from '../lib/telefone.js'
import { mensagemWhatsApp } from './mensagem.js'

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

// No celular, a Web Share API entrega o arquivo direto ao WhatsApp.
// No desktop isso não existe: o navegador não anexa arquivo no WhatsApp Web,
// então o PDF sobe para o Storage e vai o link. Nos dois casos, quando a OS
// aceita assinatura, a mensagem leva também o link para o cliente assinar.
export async function enviarOsPorWhatsApp({ os, config, urlAssinatura }) {
  const blob = await gerarPdfDaOS(os, config)
  const nome = nomeArquivoPdf(os)
  const arquivo = new File([blob], nome, { type: 'application/pdf' })

  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({
        files: [arquivo],
        title: nome,
        text: mensagemWhatsApp({ os, config, urlAssinatura }),
      })
      return { via: 'compartilhamento' }
    } catch (erro) {
      if (erro?.name === 'AbortError') return { via: 'cancelado' }
      // Qualquer outra falha cai no caminho do link, abaixo.
    }
  }

  try {
    const urlPdf = await subirPdf(os, blob)
    const texto = mensagemWhatsApp({ os, config, urlPdf, urlAssinatura })
    window.open(linkWhatsApp(os.cliente_telefone, texto), '_blank')
    return { via: 'link', url: urlPdf }
  } catch {
    // Sem rede para subir, ao menos entrega o arquivo na mão do dono.
    baixarPdf(blob, nome)
    return { via: 'download' }
  }
}
