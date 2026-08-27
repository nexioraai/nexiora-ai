// ============================================================
// LOT BLOG 6 -- RENDU DU CORPS D'ARTICLE.
//
// TEXTE PUR. AUCUN `dangerouslySetInnerHTML`, et ce n'est pas une precaution
// de style :
//   * la CSP du depot porte `script-src 'self' 'unsafe-inline'` -- elle
//     n'oppose RIEN a une balise <script> ni a un gestionnaire `onerror`
//     injectes dans du contenu. Elle ne rattraperait pas une injection ;
//   * `package.json` ne contient AUCUN sanitiseur (ni dompurify, ni
//     sanitize-html, ni xss) ni aucun rendu markdown : rendre du HTML
//     exigerait d'introduire une dependance et une allowlist entieres ;
//   * le generateur produit de la PROSE ("paragraphes courts", separes par
//     des sauts de ligne), jamais du balisage.
//
// React echappe tout ce qu'il rend comme enfant. `whiteSpace: pre-wrap`
// preserve les retours a la ligne reels sans jamais interpreter le contenu --
// c'est exactement l'idiome SEC-09 deja utilise par `ProductModal` et
// `MerchantProductModal` pour une donnee de meme nature.
//
// Une garde structurelle du depot (`jsonLdSerialization.test.ts`) fait par
// ailleurs echouer la suite si un nouveau sink apparait dans `src/`.
// ============================================================

export default function BlogText({ content, color }: { content: string; color: string }) {
  return (
    <div
      style={{
        whiteSpace: 'pre-wrap',
        fontSize: 17,
        lineHeight: 1.75,
        color,
      }}
    >
      {content}
    </div>
  )
}
