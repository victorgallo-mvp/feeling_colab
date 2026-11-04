import { z } from 'zod';
import * as S from './schemas.js';

const js = (s: z.ZodTypeAny) => z.toJSONSchema(s, { target: 'draft-7', io: 'input', unrepresentable: 'any' } as any);
const body = (s: z.ZodTypeAny) => ({ required: true, content: { 'application/json': { schema: js(s) } } });
const ok = (d = 'OK') => ({ 200: { description: d } });
const bearer = [{ bearerAuth: [] }];

export const openapi = {
  openapi: '3.0.3',
  info: { title: 'API Reconhecimento (white-label)', version: '0.1.0', description: 'Gamificação e reconhecimento entre colaboradores. Multi-tenant. Auth por magic link + JWT (1h) + refresh (30 dias).' },
  servers: [{ url: '/api' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  paths: {
    '/public/tenant': { get: { tags: ['public'], summary: 'Marca do tenant para login', parameters: [{ name: 'tenant', in: 'query', schema: { type: 'string' } }], responses: ok() } },
    '/auth/magic-link': { post: { tags: ['auth'], summary: 'Envia link de acesso por e-mail (rate limited)', requestBody: body(S.magicLinkBody), responses: ok() } },
    '/auth/click-login': { post: { tags: ['auth'], summary: 'Acesso por clique (só com tenant em auth_mode=click): escolhe a pessoa e recebe sessão', requestBody: body(S.clickLoginBody), responses: ok() } },
    '/public/users': { get: { tags: ['public'], summary: 'Pessoas para a tela de entrada por clique (vazio se o modo for magic link)', parameters: [{ name: 'tenant', in: 'query', schema: { type: 'string' } }], responses: ok() } },
    '/auth/verify': { post: { tags: ['auth'], summary: 'Troca token do link por accessToken + refreshToken', requestBody: body(S.verifyBody), responses: ok() } },
    '/auth/refresh': { post: { tags: ['auth'], summary: 'Rotaciona refresh token (30 dias deslizantes)', requestBody: body(S.refreshBody), responses: ok() } },
    '/auth/logout': { post: { tags: ['auth'], requestBody: body(S.refreshBody), responses: ok() } },
    '/me': { get: { tags: ['me'], security: bearer, summary: 'Perfil, tenant (marca) e chave VAPID', responses: ok() } },
    '/me/avatar': { post: { tags: ['me'], security: bearer, summary: 'Enviar minha foto (multipart, campo file, máx 8 MB; recorte quadrado 256px WebP)', responses: ok() }, delete: { tags: ['me'], security: bearer, summary: 'Remover minha foto', responses: ok() } },
    '/avatars/{id}': { get: { tags: ['public'], summary: 'Foto do usuário (pública, cache imutável, versionada por ?v=)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() } },
    '/admin/users/{id}/avatar': { post: { tags: ['admin'], security: bearer, summary: 'Enviar foto de um usuário', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() }, delete: { tags: ['admin'], security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() } },
    '/me/home': { get: { tags: ['me'], security: bearer, summary: 'Payload único da tela principal (ciclo, saldo, colegas, chips, missões, feed, fila)', responses: ok() } },
    '/recognitions': { post: { tags: ['recognitions'], security: bearer, summary: 'Dar reconhecimento (debita moedas, chip obrigatório, limite por pessoa)', requestBody: body(S.giveRecognitionBody), responses: { 201: { description: 'Criado' }, 409: { description: 'insufficient_balance | receiver_limit' } } } },
    '/recognitions/{id}': { patch: { tags: ['recognitions'], security: bearer, summary: 'Adicionar/editar texto opcional', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: body(S.messageBody), responses: ok() } },
    '/recognitions/feed': { get: { tags: ['recognitions'], security: bearer, parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }, { name: 'before', in: 'query', schema: { type: 'string', format: 'date-time' } }, { name: 'cycleId', in: 'query', schema: { type: 'string' } }, { name: 'all', in: 'query', schema: { type: 'boolean' } }], responses: ok() } },
    '/recognitions/{id}/reactions': { post: { tags: ['recognitions'], security: bearer, summary: 'Alterna 👏 (não pontua)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() } },
    '/missions': { get: { tags: ['missions'], security: bearer, summary: 'Missões ativas para mim, com status do período', responses: ok() }, post: { tags: ['missions'], security: bearer, summary: 'Criar missão (gestor+)', requestBody: body(S.createMissionBody), responses: { 201: { description: 'Criada' } } } },
    '/missions/templates': { get: { tags: ['missions'], security: bearer, responses: ok() }, post: { tags: ['missions'], security: bearer, requestBody: body(S.templateBody), responses: { 201: { description: 'Criado' } } } },
    '/missions/mine': { get: { tags: ['missions'], security: bearer, summary: 'Missões criadas por mim (gestor+)', responses: ok() } },
    '/missions/{id}': { delete: { tags: ['missions'], security: bearer, summary: 'Arquivar (soft delete)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() } },
    '/missions/{id}/complete': { post: { tags: ['missions'], security: bearer, summary: '"Concluí" → fila de validação', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 201: { description: 'Pendente' }, 409: { description: 'already_completed' } } } },
    '/completions/pending': { get: { tags: ['missions'], security: bearer, summary: 'Fila de validação do gestor', responses: ok() } },
    '/completions/{id}/review': { post: { tags: ['missions'], security: bearer, summary: 'Aprovar/recusar (pontos só creditam ao aprovar)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: body(S.reviewBody), responses: ok() } },
    '/cycles/current': { get: { tags: ['cycles'], security: bearer, responses: ok() } },
    '/cycles': { get: { tags: ['cycles'], security: bearer, summary: 'Histórico de temporadas', responses: ok() } },
    '/cycles/{id}/summary': { get: { tags: ['cycles'], security: bearer, summary: 'Ranking, participação, reconhecimentos por pessoa agrupados por chip', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() } },
    '/cycles/{id}/close': { post: { tags: ['cycles'], security: bearer, summary: 'Fechar ciclo (admin): snapshots + abre próxima temporada', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: body(S.closeCycleBody), responses: ok() } },
    '/cycles/{id}/team-reward': { patch: { tags: ['cycles'], security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: body(S.teamRewardBody), responses: ok() } },
    '/cycles/{id}/rewards/{userId}': { patch: { tags: ['cycles'], security: bearer, summary: 'Registrar prêmio individual decidido pelo CEO', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'userId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: body(S.rewardNoteBody), responses: ok() } },
    '/cycles/admin/inactive': { get: { tags: ['cycles'], security: bearer, summary: 'Quem está sem interagir há X dias', parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', default: 7 } }], responses: ok() } },
    '/admin/users': { get: { tags: ['admin'], security: bearer, responses: ok() }, post: { tags: ['admin'], security: bearer, requestBody: body(S.createUserBody), responses: { 201: { description: 'Criado' } } } },
    '/admin/users/{id}': { patch: { tags: ['admin'], security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: body(S.updateUserBody), responses: ok() }, delete: { tags: ['admin'], security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() } },
    '/admin/areas': { get: { tags: ['admin'], security: bearer, responses: ok() }, post: { tags: ['admin'], security: bearer, requestBody: body(S.areaBody), responses: { 201: { description: 'Criada' } } } },
    '/admin/areas/{id}': { patch: { tags: ['admin'], security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: body(S.areaBody), responses: ok() }, delete: { tags: ['admin'], security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() } },
    '/admin/chips': { get: { tags: ['admin'], security: bearer, responses: ok() }, post: { tags: ['admin'], security: bearer, requestBody: body(S.chipBody), responses: { 201: { description: 'Criado' } } } },
    '/admin/chips/{id}': { patch: { tags: ['admin'], security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: body(S.updateChipBody), responses: ok() }, delete: { tags: ['admin'], security: bearer, summary: 'Encerra vigência', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() } },
    '/admin/settings': { get: { tags: ['admin'], security: bearer, responses: ok() }, patch: { tags: ['admin'], security: bearer, requestBody: body(S.settingsBody), responses: ok() } },
    '/users/{id}/profile': { get: { tags: ['me'], security: bearer, summary: 'Perfil público: histórico de temporadas, chips recebidos, conquistas, sequência', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() } },
    '/wheel': { get: { tags: ['wheel'], security: bearer, summary: 'Roleta da semana: vencedor, prêmios, giro', responses: ok() } },
    '/wheel/spin': { post: { tags: ['wheel'], security: bearer, summary: 'Girar (só o vencedor da semana, 1x). Sorteio no servidor, ponderado por peso', responses: { 200: { description: 'OK' }, 403: { description: 'não é o vencedor' }, 409: { description: 'already_spun | no_prizes' } } } },
    '/admin/rewards': { get: { tags: ['admin'], security: bearer, responses: ok() }, post: { tags: ['admin'], security: bearer, summary: 'Catálogo de prêmios: individual, time ou roleta', requestBody: body(S.rewardBody), responses: { 201: { description: 'Criado' } } } },
    '/admin/rewards/{id}': { patch: { tags: ['admin'], security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: body(S.updateRewardBody), responses: ok() }, delete: { tags: ['admin'], security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok() } },
    '/admin/wheel/spins': { get: { tags: ['admin'], security: bearer, summary: 'Histórico de giros e entrega', responses: ok() } },
    '/admin/wheel/spins/{id}': { patch: { tags: ['admin'], security: bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: body(S.deliveredBody), responses: ok() } },
    '/notifications': { get: { tags: ['notifications'], security: bearer, responses: ok() } },
    '/notifications/read': { post: { tags: ['notifications'], security: bearer, requestBody: body(S.markReadBody), responses: ok() } },
    '/push/subscribe': { post: { tags: ['notifications'], security: bearer, requestBody: body(S.pushSubscribeBody), responses: { 201: { description: 'OK' } } }, delete: { tags: ['notifications'], security: bearer, requestBody: body(S.pushUnsubscribeBody), responses: ok() } },
  },
};

export const docsHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>API Docs</title></head>
<body><script id="api-reference" data-url="/api/docs.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script></body></html>`;
