# RR Reparação Manager

Sistema inicial de gestão para oficina mecânica, feito com HTML, CSS e JavaScript puro.

## Como abrir

1. Abra a pasta do projeto.
2. Dê dois cliques em `dashboard.html`.
3. Use o menu lateral para acessar Clientes, Veículos, Serviços, Orçamentos e Financeiro.

## Como testar o fluxo principal

1. Cadastre um cliente em `clientes.html`.
2. No próprio cadastro do cliente, adicione um ou mais carros.
3. Crie um pré-orçamento em `orcamentos.html`, escolhendo o cliente e um dos carros cadastrados nele.
4. Volte para `dashboard.html` para aprovar, marcar como não aprovado, editar ou imprimir.
5. Lance somente despesas manuais em `financeiro.html`.
6. Confira receitas, custos, despesas e lucro em `financeiro.html`.

## Orçamentos

O orçamento trabalha com:

- status inicial sempre `Pré-orçamento`;
- aprovação ou reprovação feita pelo dashboard;
- lista de peças com quantidade, valor unitário e total;
- preço de custo das peças para cálculo financeiro interno;
- lista de serviços com horas, valor/hora editável e total;
- valor/hora padrão de R$ 120,00;
- resumo geral do orçamento;
- botão de impressão para salvar em PDF pelo navegador.

## Financeiro

As receitas não são lançadas manualmente. Elas nascem automaticamente quando um orçamento é aprovado.

No financeiro você lança apenas despesas manuais. O sistema calcula:

- receitas de orçamentos aprovados;
- custo de peças dos orçamentos aprovados;
- despesas manuais;
- lucro estimado.

## Onde os dados ficam salvos

O sistema mantém uma cópia local no LocalStorage do navegador e sincroniza com Firebase quando o login está configurado.

## Firebase

Para ativar login e banco online:

1. Acesse `https://console.firebase.google.com`.
2. Crie um projeto.
3. Em Authentication, ative o provedor `Email/password`.
4. Em Firestore Database, crie um banco em modo de produção.
5. Registre um app Web no Firebase.
6. Copie o objeto `firebaseConfig`.
7. Cole os dados no arquivo `firebase-config.js`.

Use estas regras no Firestore:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /workspaces/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Com isso, cada usuário logado acessa apenas o próprio banco de dados.


## Próximos passos recomendados

1. Testar todos os cadastros com dados reais da oficina.
2. Ajustar campos que faltarem no dia a dia.
3. Criar impressão de orçamento.
4. Criar exportação em PDF.
5. Publicar no GitHub.
6. Evoluir para login e banco de dados online, como Firebase ou Supabase.
