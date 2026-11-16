# FeiraMapa — Aplicativo para ajudar feirantes

Editor de mapa para planejar a distribuição de barracas em feiras, eventos e exposições.
Roda 100% no navegador (HTML, CSS e JavaScript puros, sem build e sem servidor), por isso
funciona direto no GitHub Pages.

## O que já faz

- **Mapas**: criar desenhando o local (retângulos, círculos, paredes, linhas) ou usando uma **foto do local** como fundo; renomear, **duplicar** para uma nova feira, excluir.
- **Barracas**: número, nome, produto, responsável, medidas, cor, observações, rotação, "precisa de tomada".
- **Tomadas** (com ligação às barracas), **entradas/saídas** (principal, secundária, saída, funcionários, fornecedores), **corredores** e **áreas proibidas** (árvore, poste, banheiro, extintor, saída de emergência…).
- **Avisos automáticos**: barracas sobrepostas, sobre área proibida/parede/corredor, passagens estreitas, fora do mapa, números repetidos, sem tomada ou longe dela, tomada coberta, entrada bloqueada. Os limites são configuráveis.
- **Medidor** de distâncias, **busca** de barracas (com realce no mapa), zoom/arrastar, grade e encaixe, **desfazer/refazer**, atalhos de teclado, uso no celular (toque e pinça).
- **Compartilhar**: link somente leitura (o mapa vai dentro do endereço), imagem PNG, PDF/impressão (mapa + lista de barracas + avisos) e arquivo `.json` (backup / importar em outro aparelho).
- Salva automaticamente no navegador (localStorage).

## Rodar localmente

```bash
python3 -m http.server 8000     # ou qualquer servidor estático
# abra http://localhost:8000
node tests/geometry.test.js     # testes da lógica de avisos
```

## Estrutura

```
index.html          página única
css/style.css       visual (responsivo + impressão)
js/geometry.js      geometria e validações (sem DOM, testável no Node)
js/store.js         salvar/carregar/importar mapas
js/editor.js        editor SVG (arrastar, redimensionar, girar, desenhar, medir)
js/share.js         link, PNG, JSON, impressão
js/app.js           telas e painéis
tests/              testes
.github/workflows/  publicação automática no GitHub Pages
```

## Publicação (GitHub Pages)

O workflow `.github/workflows/pages.yml` roda os testes e publica a cada push na `main`.
Em *Settings → Pages*, a origem deve ser **GitHub Actions**.

## Próximos passos possíveis

Mapa colaborativo em tempo real, contas de usuário, cadastro de feirantes e pagamento de
taxas, histórico de feiras, sugestão automática de disposição.
