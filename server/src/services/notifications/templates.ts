import type { NotificationType } from './provider.js';

export function render(type: NotificationType, d: Record<string, any>): { title: string; body: string; deepLink: string } {
  switch (type) {
    case 'balance_reminder':
      return { title: `Você ainda tem ${d.balance} moedas pra dar`, body: `Elas expiram no fim da ${d.cycleName}. Reconheça um colega em 2 cliques.`, deepLink: '/?focus=recognize' };
    case 'mission_new':
      return { title: `Nova missão: ${d.title}`, body: `Vale ${d.points} pontos. Marque "Concluí" quando terminar.`, deepLink: `/?focus=missions&mission=${d.missionId}` };
    case 'mission_validated':
      return { title: `Missão validada: ${d.title}`, body: `+${d.points} pontos creditados.`, deepLink: '/?focus=missions' };
    case 'mission_rejected':
      return { title: `Missão não validada: ${d.title}`, body: d.note ? `Motivo: ${d.note}` : 'Fale com o gestor e envie de novo quando estiver ok.', deepLink: '/?focus=missions' };
    case 'recognition_received':
      return { title: `${d.giverName} reconheceu você`, body: d.message ? `"${d.message}"` : d.chipLabel ? `"${d.chipLabel}"` : 'Pela sua colaboração.', deepLink: `/?rec=${d.recognitionId}` };
    case 'cycle_ending':
      return { title: `${d.cycleName} termina em ${d.days} dia${d.days === 1 ? '' : 's'}`, body: d.balance > 0 ? `Você ainda tem ${d.balance} moedas. Use ou perca!` : 'Última chance de concluir missões.', deepLink: '/?focus=recognize' };
    case 'achievement':
      return { title: `${d.emoji} Conquista desbloqueada: ${d.label}`, body: 'Ela já aparece no seu perfil.', deepLink: '/?focus=profile' };
    case 'wheel_winner':
      return { title: '🎡 Você ganhou a roleta da semana!', body: `Foi quem mais recebeu pontos na semana passada (${d.points}). Gire até domingo.`, deepLink: '/?focus=wheel' };
    case 'cycle_closed':
      return { title: `${d.cycleName} encerrada`, body: `${d.teamGoal ? 'Meta coletiva batida! 🎉' : 'Meta coletiva não atingida desta vez.'} Começou a ${d.nextName}.`, deepLink: `/temporadas/${d.cycleId}` };
  }
}
