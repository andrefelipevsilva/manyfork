import { describe, expect, it } from "vitest";
import { cifrar, conferirSenha, decifrar, gerarHashSenha } from "./crypto";
import { criarSessao, sessaoValida } from "./session";

describe("senha do painel", () => {
  it("confere a senha certa e recusa a errada", async () => {
    const h = await gerarHashSenha("uma senha bem comprida");
    expect(h).not.toContain("$"); // o Next expande $ no .env
    expect(await conferirSenha("uma senha bem comprida", h)).toBe(true);
    expect(await conferirSenha("outra", h)).toBe(false);
    expect(await conferirSenha("x", "lixo")).toBe(false);
  });
});

describe("cifra do token", () => {
  it("cifra e decifra; cada cifra sai diferente", () => {
    const a = cifrar("IGAA-token");
    expect(a).not.toBe(cifrar("IGAA-token"));
    expect(decifrar(a)).toBe("IGAA-token");
    const [v, iv, tag, dados] = a.split(".");
    expect(() => decifrar([v, iv, tag, dados.slice(0, -2) + "AA"].join("."))).toThrow();
  });
});

describe("sessão", () => {
  it("vale até expirar e não aceita adulteração", async () => {
    const s = await criarSessao("segredo", 0);
    expect(await sessaoValida(s, "segredo", 1000)).toBe(true);
    expect(await sessaoValida(s, "outro", 1000)).toBe(false);
    expect(await sessaoValida(s, "segredo", 8 * 24 * 3600 * 1000)).toBe(false);
    expect(await sessaoValida(s.replace(/^./, "x"), "segredo", 1000)).toBe(false);
    expect(await sessaoValida(undefined, "segredo")).toBe(false);
  });
});
