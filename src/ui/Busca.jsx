import { Search } from 'lucide-react'

export default function Busca({ valor, aoMudar, placeholder }) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl border-[1.5px] border-linha bg-paper px-3.5">
      <Search size={18} className="shrink-0 text-mute" aria-hidden="true" />
      <input
        type="search"
        value={valor ?? ''}
        onChange={(e) => aoMudar?.(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-12 w-full bg-transparent text-[15px] focus:outline-none"
      />
    </div>
  )
}
