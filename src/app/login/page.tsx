import { FormularioLogin } from "./formulario";

export const metadata = { title: "Entrar · manyfork" };

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  const { de } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo />
          <p className="mt-2 text-sm text-muted">Automação do seu Instagram</p>
        </div>
        <FormularioLogin de={de ?? "/"} />
      </div>
    </main>
  );
}

function Logo() {
  return (
    <div className="inline-flex items-center gap-2 font-mono text-2xl font-semibold tracking-tight">
      <span className="inline-block h-3 w-3 rounded-sm bg-accent" />
      manyfork
    </div>
  );
}
