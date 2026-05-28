export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-8 text-center text-slate-500 bg-slate-900">
      <p>© 2026 Nexiora AI. All rights reserved.</p>
      <div className="flex justify-center gap-6 mt-4">
        <a href="#" className="hover:text-white transition">Privacy</a>
        <a href="#" className="hover:text-white transition">Terms</a>
        <a href="#" className="hover:text-white transition">Contact</a>
      </div>
    </footer>
  );
}