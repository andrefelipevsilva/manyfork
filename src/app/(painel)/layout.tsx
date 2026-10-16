import { MenuLateral } from "@/components/menu-lateral";
import { contaAtual } from "@/lib/account";

export const dynamic = "force-dynamic";

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const conta = await contaAtual();
  return (
    <div className="md:flex">
      <MenuLateral conta={{ username: conta.username, simulada: conta.simulated, foto: conta.profilePictureUrl }} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
