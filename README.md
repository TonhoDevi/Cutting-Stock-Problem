# Cutting Stock Problem — Calculadora de Corte de Vigas

Aplicação web client-side para otimizar o corte de barras de aço (vigas) a partir de uma lista de peças necessárias, minimizando o desperdício de material. É uma implementação prática do clássico **Cutting Stock Problem** (Problema do Corte de Estoque), com suporte a importação automática de listas de peças a partir de projetos estruturais em PDF.

Roda inteiramente no navegador — sem backend, sem build, sem dependências instaladas. Basta abrir o `index.html`.

## O problema

Dado um estoque de barras de comprimento fixo (12 metros) e uma lista de peças menores que precisam ser cortadas dessas barras (com comprimento e quantidade desejada), o objetivo é determinar **o menor número de barras** necessário e **como cortar cada uma**, minimizando a sobra de material.

O problema é resolvido de forma independente para cada diâmetro (bitola) de aço, já que peças de diâmetros diferentes não podem ser combinadas na mesma barra.

## Como funciona

O cálculo (`script.js`) segue três etapas:

1. **Verificação de viabilidade** — garante que nenhuma peça solicitada excede o comprimento da barra matriz (1200 cm).
2. **Geração de padrões de corte** — gera recursivamente todas as combinações válidas de peças que cabem em uma barra (`generatePatterns`), respeitando a restrição:

   ```
   Σ (quantidade_i × comprimento_i) ≤ comprimento_da_barra
   ```

3. **Resolução via heurística gulosa** (`solve`) — a cada iteração, escolhe o padrão de corte que melhor aproveita a demanda restante (maior uso útil, com penalidade por excesso produzido além do necessário) e o aplica o máximo de vezes possível sem ultrapassar a demanda. Repete até que toda a demanda seja atendida.

O resultado inclui: número total de barras necessárias, percentual de desperdício, comparação com o mínimo teórico (`⌈comprimento total necessário / comprimento da barra⌉`), e um plano de corte detalhado barra a barra, pronto para impressão.

## Importação de PDF

O módulo `pdf-import.js` usa [PDF.js](https://mozilla.github.io/pdf.js/) para extrair texto de projetos estruturais em PDF (listas de ferragem) e reconhecer automaticamente tabelas no formato:

```
AÇO | POS | BIT (mm) | QUANT | COMPR. UNIT (cm) | COMPR. TOTAL (cm)
```

agrupadas por viga (ex: `V101`). O parser:

- Reordena os itens de texto do PDF por posição (top→bottom, left→right) e os agrupa em linhas por proximidade vertical, já que o PDF.js não preserva a estrutura visual da tabela.
- Reconhece cabeçalhos de viga e linhas de dados via expressões regulares tolerantes a variações de espaçamento.
- Normaliza o diâmetro extraído para a bitola comercial mais próxima (6.3, 10 ou 12.5 mm).

Após a extração, o usuário revisa os dados num modal com filtro por viga e seleção de linhas antes de confirmar a importação para a calculadora.

## Estrutura do projeto

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Estrutura da página e modal de importação de PDF |
| `style.css` | Estilo visual (tema escuro industrial) |
| `script.js` | Algoritmo de otimização de corte e renderização dos resultados |
| `pdf-import.js` | Extração e parsing de tabelas de ferragem a partir de PDF |

## Como usar

1. Abra `index.html` em qualquer navegador moderno.
2. Adicione as peças manualmente (diâmetro, comprimento, quantidade) ou clique em **IMPORTAR PDF** para extrair automaticamente de um projeto estrutural.
3. Clique em **CALCULAR PLANO DE CORTE**.
4. Revise o passo a passo do cálculo e o plano de corte final, com opção de impressão.

## Stack

HTML, CSS e JavaScript puro (vanilla), sem frameworks ou etapa de build. Dependência externa única: PDF.js (via CDN), usado apenas para leitura de texto de PDFs.
