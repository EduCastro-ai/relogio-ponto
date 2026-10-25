# Relógio de Ponto — app de ponto para empregados domésticos

App mobile (Expo/React Native, iPhone e Android) com duas visões (empregador e empregado), dados no Supabase.
Cálculos precisam seguir a LC 150/2015. Uso pessoal (1–3 empregados), com possibilidade de escalar comercialmente.
Usuário: sócio da Portofino, perfil dev, fala português. Respostas concisas e diretas. Avisar quando usar uma skill.

## Estado (25/10/2026)
- Supabase: projeto `vlzskpuqrxmzdownovpy` ("Relogio de Ponto", sa-east-1). NÃO usar o projeto `bqvfvjmpqriretdutejq` (é de outro app).
- `supabase/migrations/*`: schema v0.2 + lockdown + performance + seed rule_set 2026. JÁ APLICADO no projeto. Cenários de teste em `supabase/tests/`.
- `packages/calc`: motor de cálculo puro em TS (33 testes, `npm test`), inclui `punchesToDays` (batidas → dias). Premissas em `docs/premissas-motor-calculo.md`.
- `apps/mobile`: esqueleto Expo SDK 58 + expo-router (npm workspaces na raiz). Login por OTP de e-mail, perfil pelo vínculo
  no banco, onboarding (criar domicílio / aceitar convite), tela de ponto com fila offline, espelho do mês, simulador.
  `metro.config.js` resolve os imports `./x.js` → `.ts` do calc. `.env` local (não versionado) com URL + chave publishable.
  Empregador: `(employer)/_layout` é Stack com `(tabs)` (equipe, simulador) + `espelho/[workerId]` empilhado
  (tela oculta dentro de Tabs voltava sozinha).
- Testado em iPhone via Expo Go (25/10): login OTP, criar domicílio, convite, batidas online/offline com geo
  (`offline_synced`, dentro do raio), espelho mensalista. Rodar com `npx expo start --tunnel` em `apps/mobile`
  (CLI logado via `eas login --device`; o login por navegador do Expo falha neste Windows).
- Auth: SMTP próprio (Gmail + senha de app) e templates Magic Link/Confirm signup com `{{ .Token }}`.
  Para testar o empregado no mesmo e-mail: `educstr.67+empregado@gmail.com`.
- Dados de teste no banco: domicílio "Ap. da Batataes", empregada Fatima (mensalista R$ 4.000) com batidas de teste de 25/10.
- Migrations: versões nos arquivos (`20261025000001..4`) diferem das aplicadas no banco (`20261025131710` etc.).
- Próximo: ajustes de ponto, fechamento/ciência do espelho, feriados, push.

## Decisões de produto
- Um app só, perfil definido pelo login. Fase 1 simples, preparada para upgrades.
- Ponto pelo celular com geolocalização só no momento da batida (consentimento LGPD). Selfie opcional (desligada por padrão). CPF opcional.
- Ponto é append-only: escrita só via RPC `register_punch`; correções via `punch_adjustments` aceitas pela OUTRA parte.
- Batida offline entra em fila e é marcada `offline_synced`/`suspect_clock`; dia de trabalho é por TURNO (`shift_date`).
- Trata diarista e mensalista (a atual é diarista que às vezes dorme no local). Simulador diarista × mensalista.
- Alertas: push (Expo) primeiro; WhatsApp via adaptador (começar com MCP não oficial, trocar pela API oficial se escalar).
  Riscos do não oficial: banimento sem aviso; usar número dedicado e versão fixa.
- Roadmap: fase 3 férias/13º/rescisão/banco de horas/IRRF; fase 4 notificações e conferência com eSocial.

## Convenções
- Dinheiro em centavos inteiros; regras legais versionadas por vigência em `rule_sets` (nunca hardcoded na UI).
- Nunca pedir ou guardar segredos do usuário; usar a chave publishable do Supabase no app.
- Mexer no schema só por migration nova em `supabase/migrations`.
