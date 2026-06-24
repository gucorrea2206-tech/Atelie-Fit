# Workspace Atelie Fit

Aplicacao operacional para estoque, producao, vendas, Promokit e atendimento pelo WhatsApp com IA.

## Integracoes de producao

- **Firebase**: autenticacao Google e Firestore.
- **OpenAI**: interpretacao de estoque, pedidos e leitura de boletos.
- **Promokit**: pedidos, clientes, status e disponibilidade do cardapio.
- **Evolution API**: WhatsApp, conversas, campanhas e automacoes.
- **Vercel**: hospedagem das APIs e tarefas agendadas.

As variaveis exigidas estao em [`.env.example`](.env.example). Segredos devem existir apenas na Vercel ou em `.env.local`, nunca no Git.

## Desenvolvimento local

```bash
npm install
npm run dev
```

Para reproduzir as integracoes localmente, autentique a Vercel e puxe as variaveis:

```bash
vercel env pull .env.local --environment=production
```

## Operacao automatica

O fluxo seguro e sempre em duas etapas:

1. A sincronizacao coleta os pedidos da Promokit e atualiza vendas, estoque e leads.
2. As automacoes elegiveis entram em fila; o processador de fila faz o envio pelo WhatsApp e registra o resultado.

Cada automacao e deduplicada por cliente e ciclo do ultimo pedido. Assim, rodar a rotina varias vezes nao envia a mesma recuperacao repetidamente.

O `vercel.json` mantem uma rotina diaria de contingencia. Para pedidos, campanhas e atendimento com resposta rapida, use o n8n da VPS como agendador principal, chamando com `Authorization: Bearer <CRON_SECRET>`:

- `GET /api/promokit/sync-new-orders` a cada 5 minutos;
- `GET /api/whatsapp/run-automations` a cada 15 minutos;
- `GET /api/whatsapp/send?limit=12` a cada 5 minutos.

O `CRON_SECRET` deve ficar salvo como credencial no n8n, nunca em um node de texto ou no repositorio.

## Checklist de publicacao

1. Confirme que o dominio da Vercel esta autorizado no Firebase Authentication.
2. Confirme a URL publica do webhook na instancia Evolution e configure `WEBHOOK_SECRET` nos dois lados.
3. Verifique as variaveis da Vercel com `vercel env ls production`.
4. Execute uma sincronizacao de pedido, uma campanha de teste para seu proprio numero e uma leitura de boleto de teste.
