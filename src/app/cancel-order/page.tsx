"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function CancelOrderInner() {
  const params = useSearchParams();
  const orderId = params.get("id") || "";
  const token = params.get("token") || "";
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  const handleCancel = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/shop/cancel-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, token }),
      });
      const data = await res.json();
      setOk(!!data.ok);
      setMessage(data.message || data.error || "Une erreur est survenue.");
      setDone(true);
    } catch {
      setOk(false);
      setMessage("Une erreur reseau est survenue. Reessayez dans un instant.");
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  if (!orderId || !token) {
    return <p style={{ color: "#b00" }}>Lien invalide.</p>;
  }

  if (done) {
    return (
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
          {ok ? "Commande annulee" : "Annulation impossible"}
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "#444" }}>{message}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Annuler votre commande</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: "#444", marginBottom: 24 }}>
        Nous allons verifier aupres du fournisseur si votre commande peut encore
        etre annulee. Si oui, vous serez rembourse automatiquement.
      </p>
      <button
        onClick={handleCancel}
        disabled={busy}
        style={{
          background: busy ? "#999" : "#d33",
          color: "white",
          border: "none",
          borderRadius: 10,
          padding: "12px 22px",
          fontSize: 15,
          fontWeight: 600,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Verification en cours..." : "Confirmer l'annulation"}
      </button>
    </div>
  );
}

export default function CancelOrderPage() {
  return (
    <main
      style={{
        fontFamily: "-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        maxWidth: 520,
        margin: "80px auto",
        padding: "0 20px",
        color: "#1a1a1a",
      }}
    >
      <Suspense fallback={<p>Chargement...</p>}>
        <CancelOrderInner />
      </Suspense>
    </main>
  );
}
