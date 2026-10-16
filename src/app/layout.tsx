import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "manyfork",
  description: "Automação de Instagram: comentário → direct, palavra-chave e story.",
  robots: { index: false, follow: false },
};

// Aplica o tema salvo antes de pintar (evita piscar claro→escuro).
const scriptTema = `try{var t=localStorage.getItem("mf_tema");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
