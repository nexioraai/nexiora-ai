import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-white/8 backdrop-blur-md sticky top-0 z-50"
      style={{ background: 'rgba(10,5,14,0.75)' }}>

      <Link href="/" className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #4F6EF5 0%, transparent 60%), radial-gradient(circle at 70% 70%, #E07040 0%, transparent 60%), #16090e'
          }}
        >
          N
        </div>
        <span className="text-xl font-black tracking-tight text-nexiora hidden sm:block">
          nexiora
        </span>
      </Link>

      <div className="flex items-center gap-6">
        <Link href="/" className="text-white/60 hover:text-white text-sm transition-colors">Home</Link>
        <Link href="/about" className="text-white/60 hover:text-white text-sm transition-colors hidden md:block">About</Link>
        <Link href="/services" className="text-white/60 hover:text-white text-sm transition-colors hidden md:block">Services</Link>
        <Link href="/contact" className="text-white/60 hover:text-white text-sm transition-colors hidden md:block">Contact</Link>
        <Link
          href="/login"
          className="btn-nexiora px-5 py-2 rounded-full text-white text-sm font-semibold"
        >
          Login
        </Link>
      </div>
    </nav>
  );
}
