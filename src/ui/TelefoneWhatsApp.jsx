import IconeWhatsApp from './IconeWhatsApp.jsx'
import { linkWhatsApp, telefoneWhatsApp } from '../lib/telefone.js'

// O telefone do cliente com o atalho do WhatsApp ao lado: um toque abre a
// conversa, sem copiar o número à mão. Número incompleto não vira atalho —
// um link que abre o WhatsApp sem destino só atrapalha quem está no balcão.
export default function TelefoneWhatsApp({ telefone }) {
  const texto = String(telefone ?? '').trim()
  if (texto === '') return null
  if (!telefoneWhatsApp(texto)) return <span>{texto}</span>

  return (
    <a
      href={linkWhatsApp(texto, '')}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Conversar com ${texto} no WhatsApp`}
      className="inline-flex items-center gap-1.5 font-bold"
    >
      {texto}
      <IconeWhatsApp size={15} className="text-[#25D366]" />
    </a>
  )
}
