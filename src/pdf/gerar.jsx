import { pdf } from '@react-pdf/renderer'
import DocumentoOS from './DocumentoOS.jsx'
import { montarDadosDocumento } from './dadosDocumento.js'

// JPEG, e não o PNG do app: o logo tem fundo branco e vai embutido em cada
// PDF guardado, então o arquivo menor poupa o Storage a cada OS.
const LOGO = '/logo-mizuho-pdf.jpg'

export function nomeArquivoPdf(os) {
  const base = os.numero == null ? 'sem-numero' : os.numero
  return `OS-${base}-${os.veiculo_placa || 'veiculo'}.pdf`
}

export async function gerarPdfDaOS(os, config) {
  if (!config) throw new Error('Configurações da empresa ainda não carregaram.')
  const dados = montarDadosDocumento(os, config)
  return pdf(<DocumentoOS dados={dados} logoSrc={LOGO} />).toBlob()
}
