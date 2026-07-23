# NF-e e CT-e - Consulta Local

Sistema local para **consulta, armazenamento e gestao** de XMLs de NF-e e CT-e.

> **Aviso importante**: este sistema **nao substitui um emissor fiscal homologado**. Ele armazena, lista, busca, gera XMLs de exemplo e gera um **PDF resumo** dos documentos, mas **nao assina nem transmite** para a SEFAZ, e o PDF gerado **nao e o DANFE/DACTE oficial**.

## O que ele faz

- Importa XMLs de NF-e (modelo 55), NFC-e (65) e CT-e (57)
- Lista com filtros (tipo, status, UF, data, texto)
- Busca por chave de acesso (com validacao do digito verificador modulo 11)
- Faz download do XML original
- **Gera e baixa um PDF resumo do documento** — por documento ja importado (via ID ou chave), por numero do documento, ou direto a partir de um XML colado/enviado (sem precisar importar)
- Mostra estatisticas (total, valor, cancelados)
- Fornece URL de consulta publica do Portal Nacional
- Gera XML de exemplo (NF-e e CT-e) para integracao

## O que ele NAO faz (ainda)

- Nao assina XML digitalmente (requer certificado A1/A3)
- Nao transmite para SEFAZ
- Nao cancela ou inutiliza
- Nao emite o DANFE/DACTE **oficial** (com selo grafico e QRCode validados pela SEFAZ) — o PDF gerado e um **resumo** dos dados do XML, para conferencia rapida

Para transmissao real, use **ACBr Monitor**, **NFePHP** ou outro emissor homologado, e importe o XML processado aqui via `/api/docs/upload`.

## Requisitos

- Node.js 18+ (recomendado 22.5+; o backend usa apenas modulos nativos do Node — sem pacotes de terceiros para rodar, e sem `npm install`, pois a pasta `backend/node_modules` ja vem pronta neste pacote)
- Windows / macOS / Linux

## Como rodar

**Sem precisar de npm** — a pasta `backend/node_modules` ja esta incluida neste pacote. Basta ter o Node.js instalado.

**Windows:** de duplo clique em `iniciar.bat` (ou rode pelo terminal).

**Linux / macOS:**
```bash
./iniciar.sh
```

**Manualmente (qualquer sistema):**
```bash
cd backend
node server.js
```

Acesse `http://localhost:3000` no navegador.

> Se a pasta `node_modules` for apagada por engano, os scripts tentam rodar `npm install` automaticamente — nesse caso sim, sera preciso ter internet e npm instalados.
>
> O backend detecta sozinho se sua versao do Node.js precisa da flag `--experimental-sqlite` para o modulo nativo de banco de dados, e reinicia com a flag correta automaticamente — nao e preciso fazer nada manualmente.

## PDF (resumo do documento)

Existem 3 formas de baixar o PDF:

1. **Por documento ja importado** — na tabela ou na tela de detalhes, clique em "Baixar PDF" (usa o ID interno ou a chave de acesso de 44 digitos).
2. **Por numero do documento** — use o card "Baixar PDF por numero" na tela inicial; se houver mais de um documento com o mesmo numero, uma lista aparece para voce escolher.
3. **Direto do XML** — cole o XML no card "Colar conteudo do XML" e clique em "Baixar PDF" (ou envie um arquivo `.xml` pelo botao "Enviar 1 arquivo e baixar PDF"), sem precisar importar o documento antes.

## Estrutura

```
consulta-cte/
├── index.html              # Frontend (ja existia)
├── backend/
│   ├── server.js           # API Express
│   ├── package.json
│   └── ...
├── data/
│   ├── app.db              # SQLite (criado automaticamente)
│   └── xml/                # XMLs importados
└── README.md
```

## API

| Metodo | Endpoint | Descricao |
|---|---|---|
| GET | `/api/health` | Healthcheck |
| GET | `/api/stats` | Estatisticas agregadas |
| GET | `/api/docs?kind=NFE&status=autorizado&uf=SP&q=...` | Listar com filtros |
| GET | `/api/docs/:id` | Detalhe (com XML) |
| GET | `/api/docs/:id/xml` | Download do XML |
| GET | `/api/docs/:id/pdf` | Baixar PDF resumo (id ou chave) |
| GET | `/api/docs/numero/:numero?kind=` | Buscar documentos salvos por numero |
| POST | `/api/pdf/from-xml` | Gerar e baixar PDF direto `{xml}`, sem importar |
| POST | `/api/pdf/from-upload` | Gerar e baixar PDF a partir de upload (`file`), sem importar |
| POST | `/api/docs/import` | Importar via JSON `{xml, kind, source}` |
| POST | `/api/docs/upload` | Importar via multipart (varios arquivos) |
| DELETE | `/api/docs/:id` | Remover documento |
| GET | `/api/consulta/nfe/:chave` | Info de consulta publica NF-e |
| GET | `/api/consulta/cte/:chave` | Info de consulta publica CT-e |
| GET | `/api/chave/validar/:chave` | Validar DV (modulo 11) da chave |
| POST | `/api/generate/nfe` | Gerar XML NF-e de exemplo |
| POST | `/api/generate/cte` | Gerar XML CT-e de exemplo |

## Proximos passos (futuro)

- [ ] Integracao com certificado A1 (.pfx) e biblioteca de assinatura
- [ ] Transmissao automatica para SEFAZ (NFeAutorizacao, CTeAutorizacao)
- [ ] Cancelamento e inutilizacao
- [ ] Geracao de DANFE/DACTE em PDF
- [ ] Contingencia EPEC / SVC
- [ ] Manifestacao do destinatario (ciencia, confirmacao, etc.)
- [ ] Importacao em lote via XML de distribuicao (NFeDistribuicaoDFe)
