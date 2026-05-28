import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
      <Link href="/" className="text-3xl font-black text-blue-400">NX</Link>
      <div className="flex items-center gap-6">
        <Link href="/" className="text-slate-300 hover:text-white">Home</Link>
        <Link href="/about" className="text-slate-300 hover:text-white">About</Link>
        <Link href="/services" className="text-slate-300 hover:text-white">Services</Link>
        <Link href="/contact" className="text-slate-300 hover:text-white">Contact</Link>
        <button className="bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-full">Login</button>
      </div>
    </nav>
  );
}