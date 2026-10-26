# Painel Eleições 2026 (presidente)

Painel estático (HTML + d3) com mapa por município e por local de votação, 1º × 2º turno. Fonte: TSE (portal de resultados e dados abertos) e malha do IBGE. Os dados podem estar desatualizados ou conter erros; para reporte ou decisão, conferir em resultados.tse.jus.br.

## Rodar

```bash
node painel-eleicoes/scripts/servir.mjs
```

Abrir http://localhost:8765 (não abre direto pelo arquivo, por causa dos dados em `dados/`).

## Gerar os dados (a pasta `dados/` não é versionada)

| Passo | Comando | O que faz |
|---|---|---|
| 1 | `node scripts/coletar.mjs` | Baixa o resultado por município (API do portal do TSE, 2 turnos) e a malha do IBGE |
| 2 | `node scripts/processar.mjs` | Cruza os turnos, calcula swing, viradas e decomposição; confere com os totais oficiais |
| 3 | `node scripts/locais.mjs` | Agrega por local de votação e bairro a partir dos CSVs em `dados/tse-csv/` |
| – | `node scripts/verificar-tse.mjs` | Só confere se o TSE publicou versão nova dos arquivos por seção (não baixa nada) |

Os passos 1 e 2 já cobrem os dois turnos. O passo 3 usa os CSVs de dados abertos, que hoje têm só o **1º turno** por seção.

## Quando o TSE publicar o 2º turno por seção

1. `node scripts/verificar-tse.mjs` aponta "NOVA VERSÃO" nos arquivos de resultado.
2. Confirmar o download (cerca de 480 MB) e rodar `node scripts/verificar-tse.mjs --baixar`: baixa, extrai e roda `locais.mjs`.
3. Se o resultado vier em arquivo novo (e não na mesma URL), ajustar `ARQUIVOS` em `verificar-tse.mjs`.
4. Recarregar o painel: swing e viradas por local e por bairro passam a funcionar sem mudar o código.

## Observações sobre os dados

- O cadastro de locais usa código de município com zeros à esquerda; os scripts normalizam.
- Brancos + nulos = comparecimento − votos válidos (no 1º turno, 5.246 votos nulos do portal não aparecem no campo de nulos por município).
- Cerca de 1% dos locais não tem coordenada válida e fica fora do mapa de pontos (continua nas tabelas).
- Boa Esperança do Norte/MT não tem polígono na malha do IBGE usada; o exterior (186 localidades) não aparece no mapa.
- O voto é secreto: o painel mostra saldos entre turnos, não migração de eleitores.
