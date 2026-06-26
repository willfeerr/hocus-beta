# hocuspocus-coolify-cli

Build de produção para subir Hocuspocus v4 no Coolify com:

- WebSocket + HTTP healthcheck no mesmo serviço.
- Persistência Yjs binária em S3/MinIO ou PostgreSQL.
- Redis opcional para sincronização horizontal entre múltiplas instâncias.
- Auth por token estático para bootstrap ou webhook para integrar com NextAuth/Auth.js.
- Dockerfile e Docker Compose prontos para Coolify.

## Por que não usar só `npx @hocuspocus/cli`?

O CLI oficial é ótimo para subir um servidor rápido localmente. Para produção no Coolify, este projeto usa `@hocuspocus/server` diretamente para ter healthcheck, hooks, validação de room, autenticação, graceful shutdown e configuração explícita via ENV.

## Arquitetura sugerida para SKRBE / Notion-like

```txt
Next.js app / provider
  -> wss://collab.seudominio.com
    -> hocuspocus-coolify-cli
      -> MinIO/S3: fonte de verdade dos binários Yjs
      -> Redis: fanout realtime entre réplicas
      -> Auth webhook: app principal valida sessão/permissão
```

Rooms recomendadas:

```txt
page:{pageId}:v1
datasource:{dataSourceId}:v1
database:{databaseId}:v2
board:{boardId}:v1
calendar:{calendarId}:v1
```

Importante: o conteúdo Yjs precisa ser persistido como binário. Não converta o documento principal para JSON e depois recrie o Y.Doc a partir de JSON, porque isso cria histórico novo e pode duplicar conteúdo.

## Subir local

```bash
cp .env.example .env
npm install
npm run dev
```

Com Docker Compose completo:

```bash
docker compose up --build
curl http://localhost:1234/health
```

## Subir no Coolify com MinIO + Redis

1. Crie um novo recurso no Coolify usando **Docker Compose** a partir deste repositório.
2. Use `docker-compose.yml`.
3. Atribua domínio ao serviço `hocuspocus`.
4. Como o container escuta na porta `1234`, configure o domínio apontando para a porta interna `1234`, por exemplo:

```txt
https://collab.seudominio.com:1234
```

5. Depois de subir, teste:

```bash
curl https://collab.seudominio.com/health
curl https://collab.seudominio.com/ready
```

6. No client, conecte com `wss://collab.seudominio.com`.

## Subir com PostgreSQL em vez de MinIO

Use `docker-compose.postgres.yml` no Coolify.

Ou configure manualmente:

```env
STORAGE_DRIVER=postgres
DATABASE_URL=postgres://user:pass@host:5432/hocuspocus
POSTGRES_DOCUMENTS_TABLE=hocuspocus_documents
```

O servidor cria a tabela automaticamente, mas o SQL também está em `sql/001_hocuspocus_documents.sql`.

## ENV principal

| Variável | Padrão | Uso |
|---|---:|---|
| `PORT` | `1234` | Porta HTTP/WebSocket |
| `AUTH_MODE` | `static` | `none`, `static` ou `webhook` |
| `HOCUSPOCUS_TOKEN` | obrigatório em static | Token enviado pelo provider |
| `AUTH_ENDPOINT` | obrigatório em webhook | Endpoint do app principal para validar sessão |
| `STORAGE_DRIVER` | `s3` | `s3`, `postgres` ou `memory` |
| `S3_ENDPOINT` | `http://minio:9000` no Compose | Endpoint MinIO/S3 |
| `S3_BUCKET` | `hocuspocus-documents` | Bucket dos binários |
| `REDIS_URL` | `redis://redis:6379` | Redis para multi-réplica |
| `ROOM_NAME_REGEX` | `^[a-zA-Z0-9:._-]{1,240}$` | Validação de nome das rooms |

## Integração com Next.js / HocuspocusProvider

```ts
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'

const ydoc = new Y.Doc()

const provider = new HocuspocusProvider({
  url: process.env.NEXT_PUBLIC_HOCUSPOCUS_URL!, // wss://collab.seudominio.com
  name: `page:${pageId}:v1`,
  document: ydoc,
  token: await getCollaborationToken(),
})
```

Para o modo `static`, `getCollaborationToken()` retorna o `HOCUSPOCUS_TOKEN` configurado no Coolify.
Para produção real, prefira `AUTH_MODE=webhook`.

## Endpoint de auth webhook

O servidor chama `AUTH_ENDPOINT` com `POST`:

```json
{
  "documentName": "page:abc:v1",
  "token": "token-do-provider",
  "providerVersion": "...",
  "params": {}
}
```

Resposta esperada:

```json
{
  "userId": "user_123",
  "readOnly": false,
  "permissions": ["read", "write"]
}
```

Se retornar HTTP 401/403/500, a conexão é recusada.

Exemplo de rota no Next.js:

```ts
// app/api/hocuspocus/auth/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const bearer = request.headers.get('authorization')

  // Troque isto pela validação real da sua sessão/Auth.js.
  if (!bearer || !body.documentName) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  // Aqui você valida workspace, page/database/datasource e permissão do usuário.
  return NextResponse.json({
    userId: 'user_123',
    readOnly: false,
    permissions: ['read', 'write'],
  })
}
```

## Healthcheck

```bash
GET /health  # simples, usado pelo Docker/Coolify
GET /ready   # mostra auth/storage/redis/connections
GET /version # versão do serviço
```

## Observações de produção

- Redis não é persistência primária. Ele sincroniza instâncias Hocuspocus entre si.
- MinIO/S3 ou PostgreSQL devem ser a fonte de verdade dos binários Yjs.
- Para Coolify, mantenha o healthcheck ativo; problemas de 503 geralmente envolvem healthcheck, domínio ou porta interna errada.
- Para WebSocket atrás do proxy, use domínio `https` no Coolify e `wss` no client.
- Evite `AUTH_MODE=none` em produção.
