export default function EstadoVazio({ titulo, descricao, acao }) {
  return (
    <div className="rounded-xl border border-dashed border-linha bg-paper px-6 py-10 text-center">
      <p className="font-bold text-ink">{titulo}</p>
      {descricao && <p className="mt-1 text-sm text-mute">{descricao}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  )
}
