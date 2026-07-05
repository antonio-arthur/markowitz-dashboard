import json
from pathlib import Path

import requests

URL_BRAPI = "https://brapi.dev/api/v2/tickers"
DIRETORIO_CARTEIRAS = Path(__file__).resolve().parents[1]
ARQUIVO_SAIDA = DIRETORIO_CARTEIRAS / "data" / "acoes_b3.json"


def identificar_classe(codigo: str) -> str:
    """
    Identifica a classe mais comum da ação
    pelo último número do código B3.
    """
    classes = {
        "3": "ON",
        "4": "PN",
        "5": "PNA",
        "6": "PNB",
        "7": "PNC",
        "8": "PND",
    }
    if not codigo:
        return "AÇÃO"
    return classes.get(codigo[-1], "AÇÃO")


def deve_incluir_acao(codigo: str, nome: str | None = None) -> bool:
    """
    Mantém somente ações ordinárias e preferenciais.
    Exclui variações como F, units e demais categorias.
    """
    if not codigo:
        return False

    codigo_limpo = codigo.strip().upper()
    if codigo_limpo.endswith("F"):
        return False
    if codigo_limpo.endswith("11"):
        return False
    if codigo_limpo.endswith("3") or codigo_limpo.endswith("4") or codigo_limpo.endswith("5") or codigo_limpo.endswith("6") or codigo_limpo.endswith("7") or codigo_limpo.endswith("8"):
        return True
    return False


def baixar_acoes_b3() -> list[dict]:
    """
    Baixa todas as ações ativas da B3.
    Exclui:
    - FIIs;
    - ETFs;
    - BDRs;
    - units;
    - índices;
    - instrumentos inativos.
    """
    pagina = 1
    acoes_encontradas = {}

    while True:
        print(f"Baixando página {pagina}...")
        parametros = {
            "type": "stock",
            "subType": "stock",
            "page": pagina,
            "limit": 2000,
            "sortBy": "symbol",
            "sortOrder": "asc",
        }
        resposta = requests.get(
            URL_BRAPI,
            params=parametros,
            timeout=60,
        )
        resposta.raise_for_status()
        dados = resposta.json()
        resultados = dados.get("results", [])

        for item in resultados:
            codigo = str(item.get("symbol", "")).strip().upper()
            if not codigo:
                continue
            if item.get("exchange") != "B3":
                continue
            if item.get("assetType") != "stock":
                continue
            if item.get("subType") != "stock":
                continue
            if item.get("isActive") is False:
                continue

            nome = item.get("name") or item.get("longName") or codigo
            if not deve_incluir_acao(codigo, nome):
                continue

            acoes_encontradas[codigo] = {
                "ticker": f"{codigo}.SA",
                "codigo": codigo,
                "nome": str(nome).strip(),
                "classe": identificar_classe(codigo),
            }

        paginacao = dados.get("pagination", {})
        if not paginacao.get("hasNextPage", False):
            break
        pagina += 1

    return sorted(acoes_encontradas.values(), key=lambda acao: acao["codigo"])


def salvar_catalogo(acoes: list[dict]) -> None:
    ARQUIVO_SAIDA.parent.mkdir(parents=True, exist_ok=True)
    with open(ARQUIVO_SAIDA, "w", encoding="utf-8") as arquivo:
        json.dump(acoes, arquivo, ensure_ascii=False, indent=2)

    print()
    print(f"{len(acoes)} ações salvas.")
    print(f"Arquivo: {ARQUIVO_SAIDA}")


def main() -> None:
    try:
        acoes = baixar_acoes_b3()
        if not acoes:
            raise RuntimeError("Nenhuma ação foi encontrada.")
        salvar_catalogo(acoes)
    except requests.RequestException as erro:
        raise SystemExit(f"Não foi possível consultar o catálogo da B3: {erro}") from erro
    except (ValueError, RuntimeError) as erro:
        raise SystemExit(str(erro)) from erro


if __name__ == "__main__":
    main()
