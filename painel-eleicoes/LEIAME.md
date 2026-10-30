# Painel Eleições 2026 (presidente)

Painel estático (HTML + d3) com mapa por município e por local de votação, 1º × 2º turno. Fonte: TSE (portal de resultados e dados abertos) e malha do IBGE. Os dados podem estar desatualizados ou conter erros; para reporte ou decisão, conferir em resultados.tse.jus.br.

## Rodar

```bash
node painel-eleicoes/scripts/servir.mjs
```

Abrir http://localhost:8765 (não abre direto pelo arquivo, por causa dos dados em `dados/`).

- **Análise por região ou estado:** escolha a região e/ou o estado nos seletores acima do mapa (ou clique numa linha em "Regiões e UFs"). O mapa mostra só aquele recorte, e a aba **Região / Estado** traz KPIs, decomposição dos votos a mais, a tabela de estados da região e rankings de municípios. "Ver Brasil" volta à visão nacional.
- **Filtros de capitais e de tamanho:** ao lado dos seletores de região e estado, "Capitais" (todas, só as 27 capitais ou sem as capitais) e "Tamanho" (até 10 mil, 10 a 50 mil, 50 a 200 mil, mais de 200 mil eleitores aptos, dado do TSE). Combinam entre si e com região/estado; municípios fora do filtro ficam quase brancos no mapa, e KPIs, setas, legenda e tabelas passam a valer só para o recorte (a aba **Recorte**, antes "Região / Estado"). A aba **Capitais e tamanho** compara os grupos lado a lado (Δ fatia, swing, % de municípios e de votos pró-Lula, margem e viradas) dentro da região/estado escolhido; clicar numa linha aplica o filtro. São características do município, não do eleitor (voto secreto). Idade, escolaridade e renda ainda não entraram: precisam de arquivos novos (perfil do eleitorado do TSE e Censo 2022 do IBGE).
- **Legenda:** mostra os números das pontas (−60/0/+60 etc.), avisa que a cor satura além deles e traz os extremos reais do recorte (municípios com ≥ 2 mil válidos) e quantos municípios passam dos limites. A caixa "Ajustar escala ao recorte" troca os limites fixos (comparáveis entre recortes) por limites que cobrem 98% dos municípios do recorte atual.
- **Medida principal: Δ fatia.** A camada **Deslocamento (Δ fatia)** compara Lula ÷ (Lula + Flávio) nos dois turnos. As setas usam a mesma medida. O **swing** (margem do 2º turno − margem do 1º, Lula − Flávio, p.p. dos válidos) é a medida convencional e fica só como apoio, em tabelas, quadros e no detalhe do município, sem camada própria no mapa: ele inclui um efeito mecânico (os "outros" do 1º turno somem e ampliam qualquer vantagem que já existia).
- **% dos municípios e % dos votos:** o quadro do topo mostra quantos municípios (e que % dos votos válidos) se deslocaram a favor de Lula nas duas medidas. A aba Brasil e a aba Região / Estado trazem duas barras (pró-Lula, estável e pró-Flávio), uma em % dos municípios e outra em % dos votos válidos do 2º turno. A legenda das setas e a tabela Regiões e UFs (colunas "% mun. pró-Lula" e "% votos") usam o mesmo mínimo do controle "mín." das setas. Municípios grandes pesam mais em "% votos" do que em "% de municípios".
- **Setas de deslocamento:** no mapa (Brasil, região ou estado), cada município com Δ fatia de pelo menos o mínimo escolhido (padrão 3,0 p.p., ajustável de 0 a 5; as setas começam desligadas) recebe uma seta: **← vermelha** quando o resultado se deslocou a favor de Lula e **→ azul** quando se deslocou a favor de Flávio. O tamanho é proporcional ao valor. Com as setas ligadas, o mapa fica em cinza claro neutro. O botão "Setas" alterna entre nenhuma, só Lula, só Flávio ou ambas, e a legenda mostra quantos municípios têm cada seta no recorte. A seta indica para onde o resultado se moveu, não quem ganhou.
- **Nível padrão: município.** A camada de locais de votação e as abas Bairros/Local só carregam com `http://localhost:8765/?locais=1` (precisa do passo 3 abaixo; são 11 MB e dificultam a leitura das viradas).

## Identidade visual

Cabeçalho verde (`0A2824`) com o logo Portofino em branco (`assets/portofino-logo-branco.png`), botões e abas na paleta do template corporativo (`0A413B`, `158775`, `05C18B`) e fonte Montserrat. O mapa mantém vermelho (Lula) e azul (Flávio), que são cores de leitura do resultado. O logo foi recortado do slide de encerramento do template `pmfo-apresentacao.potx` (skill `templates-pmfo`) e o fundo verde foi convertido em transparência, sem alterar o desenho. A Montserrat (400, 600 e 700, subconjunto latin do pacote `@fontsource/montserrat` 5.1.0, licença OFL) fica em `dados/vendor/montserrat-5.1.0/` e é embutida no HTML autônomo; fora dele, o painel carrega os arquivos dessa pasta e, se não existirem, o navegador usa Segoe UI.

## Gerar os dados (a pasta `dados/` não é versionada)

| Passo | Comando | O que faz |
|---|---|---|
| 1 | `node scripts/coletar.mjs` | Baixa o resultado por município (API do portal do TSE, 2 turnos) e a malha do IBGE |
| 2 | `node scripts/processar.mjs` | Cruza os turnos, calcula swing, viradas e decomposição; confere com os totais oficiais |
| 3 | `node scripts/locais.mjs` | Agrega por local de votação e bairro a partir dos CSVs em `dados/tse-csv/` |
| 4 | `node scripts/empacotar.mjs` | Gera `dist/painel-eleicoes-2026.html`: um único arquivo (cerca de 5,8 MB) com d3, dados e mapa embutidos. Abre com duplo clique, sem servidor e sem internet. Não inclui a camada de locais de votação. Precisa do d3 em `dados/vendor/d3-7.9.0/d3.min.js` e das fontes em `dados/vendor/montserrat-5.1.0/` |
| – | `node scripts/verificar-tse.mjs` | Só confere se o TSE publicou versão nova dos arquivos por seção (não baixa nada) |

Os passos 1 e 2 já cobrem os dois turnos. O passo 3 usa os CSVs de dados abertos, que hoje têm só o **1º turno** por seção.

## Quando o TSE publicar o 2º turno por seção

1. `node scripts/verificar-tse.mjs` aponta "NOVA VERSÃO" nos arquivos de resultado.
2. Confirmar o download (cerca de 480 MB) e rodar `node scripts/verificar-tse.mjs --baixar`: baixa, extrai e roda `locais.mjs`.
3. Se o resultado vier em arquivo novo (e não na mesma URL), ajustar `ARQUIVOS` em `verificar-tse.mjs`.
4. Recarregar o painel: swing e viradas por local e por bairro passam a funcionar sem mudar o código.

## Apresentação e gráfico de fluxo de votos

- **Apresentação "Análise da Virada Eleitoral":** `node scripts/analise.mjs` (gera `dados/analise.json`) e `node scripts/apresentacao.mjs` (gera `dist/apresentacao-virada-2026.html`; o PDF sai do Chrome em modo headless).
- **Gráfico de fluxo 1º → 2º turno (estimativa):** o voto é secreto, então os fluxos entre categorias (Lula, Flávio, outros, brancos/nulos, abstenção) são estimados por inferência ecológica a partir das seções. Precisa do ambiente Python do projeto (`painel-eleicoes/.venv`, com numpy, pandas, scipy, pymc e arviz).
  1. `node scripts/secoes.mjs`: base por seção com os dois turnos (`dados/secoes.csv`).
  2. `.venv\Scripts\python.exe scripts/fluxos.py --boot 100`: limites exatos, estimativa EM por estrato (cada capital, o interior de cada UF e o exterior) e intervalo por bootstrap (`dados/fluxos.json`).
  3. `.venv\Scripts\python.exe scripts/fluxos_validacao.py`: valida o estimador com dados simulados.
  4. `node scripts/fluxos-html.mjs`: gera `dist/fluxos-votos-2026.html`, autônomo. Abra esse arquivo, não o modelo `apresentacao/fluxos.html`.
- Recortes do gráfico: Brasil, 27 capitais juntas, demais municípios, cada capital, regiões e estados. As margens e a fatia entre os finalistas vêm dos totais oficiais do TSE; só os fluxos entre categorias são estimados, com aviso de método na página.

## Observações sobre os dados

- O cadastro de locais usa código de município com zeros à esquerda; os scripts normalizam.
- Brancos + nulos = comparecimento − votos válidos (no 1º turno, 5.246 votos nulos do portal não aparecem no campo de nulos por município).
- Cerca de 1% dos locais não tem coordenada válida e fica fora do mapa de pontos (continua nas tabelas).
- Boa Esperança do Norte/MT não tem polígono na malha do IBGE usada; o exterior (186 localidades) não aparece no mapa.
- O voto é secreto: o painel mostra saldos entre turnos, não migração de eleitores.
