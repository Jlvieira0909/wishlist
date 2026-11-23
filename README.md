# Garimpo

Wishlist dos seus achados do CSSBUY. Você cola o link do produto e o app guarda nome, preço e uma cópia da foto, então o item continua catalogado mesmo se o anúncio sair do ar. Dá para organizar em categorias suas (camisa, calçado, bijuteria...) e filtrar por categoria, loja, preço e nome.

## Instalação

O `package.json` já lista tudo que o app usa. Rode `npm install`, ou direto `npm run dev`: antes de subir, ele confere se falta algum pacote e instala sozinho (o mesmo vale para o `npm run build`).

| Pacote | Para quê |
| --- | --- |
| `playwright-core` | controla um navegador sem janela para ler a página do CSSBUY |
| `@sparticuz/chromium` | o navegador usado na Vercel (no PC o app usa o seu Chrome ou Edge) |
| `redis` | guarda a lista na nuvem |
| `@vercel/blob` | guarda as fotos na nuvem |

## Rodando no PC

Rode `npm run dev` e abra http://localhost:3000. Sem configurar nada, a lista e as fotos ficam na pasta `data/` do projeto (fora do git) e não há senha.

## Colocando na Vercel

1. Suba o projeto para um repositório no GitHub (com o `package.json` e o `package-lock.json` atualizados) e importe na Vercel (Add New > Project).
2. Em **Settings > Environment Variables**, crie `GARIMPO_PASSWORD` com a senha que você vai usar para entrar.
3. Na aba **Storage** do projeto:
   - crie um banco **Redis** (Upstash ou Redis Cloud, de preferência na região de São Paulo) e conecte ao projeto. Isso cria a variável `REDIS_URL`;
   - crie um **Blob store** e conecte ao projeto. Isso cria a variável `BLOB_READ_WRITE_TOKEN`.
4. Faça um novo deploy (aba Deployments, menu do último deploy, Redeploy).

O `vercel.json` já coloca as funções em São Paulo (`gru1`): perto de você e fora dos EUA, de onde o CSSBUY recusa alguns acessos. Se o app abrir mostrando o que falta configurar, é só seguir a lista da tela.

Com tudo pronto, abra o endereço do projeto e entre com a senha (a sessão dura um ano naquele navegador). A senha protege o site e a API inteiros.

### Usar a mesma lista no PC

Instale a CLI da Vercel (`npm i -g vercel`), rode `vercel link` e depois `vercel env pull .env.local`. O `npm run dev` passa a ler e gravar no mesmo Redis e Blob da Vercel (e a pedir a mesma senha).

## O que dá para colar

- Links do CSSBUY nos dois formatos: `cssbuy.com/item-micro-123.html` (antigo) e `cssbuy.com/shop/goodsDetail?type=micro&id=123` (novo)
- Links curtos `cssb.uy/...`
- Links diretos do Taobao/Tmall, Weidian, 1688 e Xianyu/Goofish
- Vários links de uma vez (por exemplo, uma coluna copiada de uma planilha)

Se o mesmo produto já estiver na lista, o app não duplica: ele rola até o item e destaca.

## Categorias e filtros

- **+ Nova categoria** cria uma categoria. Clicar numa categoria abre ela, e com uma categoria aberta, o que você colar já entra nela.
- No card, o seletor muda a categoria do item (ou cria uma nova ali mesmo).
- **Editar categorias** renomeia e exclui. Excluir uma categoria não apaga os itens: eles ficam em "Sem categoria".
- Filtros: busca por nome, loja, faixa de preço em yuan e ordem (mais recentes, mais antigos, menor ou maior preço).

## Como o app descobre nome e foto

- **Weidian**: consulta a API pública do Weidian. É rápido e não abre navegador.
- **Taobao, Xianyu e 1688** (ou se a API do Weidian falhar): abre a página do produto no CSSBUY num navegador sem janela, espera carregar e lê nome, foto e preço do que a própria página recebeu. No PC usa o seu Chrome ou Edge; na Vercel, o Chromium do `@sparticuz/chromium`. Leva alguns segundos por item.

Se nada funcionar, o link fica salvo com um nome provisório. No card dá para usar "Buscar de novo", renomear ou colar a foto (Ctrl+V com o card em foco, ou arrastar a imagem).

## Quando o nome ou a foto não vêm

1. O aviso na tela diz o motivo. Na Vercel, ele traz o link "Ver o que o navegador viu", com o print da página que o servidor abriu.
2. No PC, o print, o HTML e as respostas da página ficam em `data/debug/ultima-falha`, e o terminal mostra linhas começando com `[garimpo]`.
3. Na Vercel, os mesmos `[garimpo]` aparecem na aba Logs do projeto.

## Ajustes opcionais (`.env.local` no PC)

| Variável | Para quê |
| --- | --- |
| `GARIMPO_PASSWORD` | exige a senha também no PC |
| `GARIMPO_SHOW_BROWSER=1` | mostra a janela do navegador enquanto lê o CSSBUY |
| `GARIMPO_BROWSER_PATH=C:\caminho\para\brave.exe` | usa outro navegador baseado em Chromium |
| `GARIMPO_DEBUG=1` | salva print e HTML de toda leitura, não só das que falham |

Reinicie o `npm run dev` depois de mudar o `.env.local`.

## Limites do plano gratuito

- Vercel (Hobby): cada leitura do CSSBUY abre um Chromium dentro da função, o que leva alguns segundos. O limite é de 300 segundos por requisição e 2 GB de memória, com folga para isso.
- Redis e Vercel Blob têm cotas gratuitas folgadas para uma lista pessoal.
