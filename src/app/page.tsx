export default function Home() {
return (
<main style={{
minHeight: '100vh',
background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1b4b 50%, #0a0a1a 100%)',
color: 'white',
fontFamily: 'sans-serif'
}}>
{/* Navbar */}
<nav style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 40px', borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
<div style={{fontSize:'24px', fontWeight:'bold', color:'#60a5fa'}}>NX</div>
<div style={{display:'flex', gap:'30px', fontSize:'14px'}}>
<a href="#" style={{color:'#94a3b8', textDecoration:'none'}}>Features</a>
<a href="#" style={{color:'#94a3b8', textDecoration:'none'}}>Pricing</a>
<a href="#" style={{color:'#94a3b8', textDecoration:'none'}}>Docs</a>
<a href="#" style={{color:'white', textDecoration:'none', background:'#2563eb', padding:'8px 16px', borderRadius:'8px'}}>Login</a>
</div>
</nav>

{/* Hero */}
<section style={{textAlign:'center', padding:'100px 20px'}}>
<h1 style={{fontSize:'64px', fontWeight:'900', marginBottom:'20px', background:'linear-gradient(to right, #60a5fa, #a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>
Build your business<br/>with AI
</h1>
<p style={{fontSize:'20px', color:'#94a3b8', marginBottom:'40px'}}>
Nexiora automatically creates websites, dashboards<br/>and digital business systems in minutes.
</p>
<div style={{display:'flex', gap:'16px', justifyContent:'center'}}>
<button style={{background:'#2563eb', color:'white', padding:'16px 32px', borderRadius:'12px', border:'none', fontSize:'16px', cursor:'pointer'}}>Start Building</button>
<button style={{background:'transparent', color:'white', padding:'16px 32px', borderRadius:'12px', border:'1px solid rgba(255,255,255,0.2)', fontSize:'16px', cursor:'pointer'}}>Watch Demo</button>
</div>
</section>

{/* Features */}
<section style={{display:'flex', gap:'24px', justifyContent:'center', padding:'60px 40px'}}>
{[
{title:'AI Website Builder', desc:'Generate full websites in seconds with AI'},
{title:'Business Dashboard', desc:'Real-time analytics and business insights'},
{title:'Instant Deployment', desc:'Deploy globally with one click'}
].map((f, i) => (
<div key={i} style={{background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'16px', padding:'32px', width:'280px', textAlign:'center'}}>
<h3 style={{fontSize:'20px', marginBottom:'12px', color:'#60a5fa'}}>{f.title}</h3>
<p style={{color:'#94a3b8', fontSize:'14px'}}>{f.desc}</p>
</div>
))}
</section>
</main>
);
}