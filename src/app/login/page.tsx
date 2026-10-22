import { Marca } from "@/components/marca";
import { FormularioLogin } from "./formulario";

export const metadata = { title: "Entrar · manyfork" };

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  const { de } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Marca id="login" className="mx-auto h-11 w-auto text-fg" />
          <p className="mt-3 text-sm text-muted">Automação do seu Instagram</p>
        </div>
        <FormularioLogin de={de ?? "/"} />
      </div>
    </main>
  );
}
