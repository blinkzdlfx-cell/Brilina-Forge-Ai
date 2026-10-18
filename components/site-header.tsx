import Link from "next/link"

export function SiteHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center border-b px-4">
      <Link href="/" className="text-sm font-semibold tracking-tight">
        Brilina Forge
      </Link>
    </header>
  )
}
