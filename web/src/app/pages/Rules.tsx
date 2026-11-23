import { Link } from 'react-router-dom';
import { useHome } from '../../api/hooks';

const RULES: [string, string][] = [
  ['Não pode enviar moeda para si mesmo.', 'O reconhecimento é sempre entre colegas.'],
  ['Toda moeda exige uma justificativa.', 'Conte qual atitude motivou o reconhecimento.'],
  ['Não vale combinar ou cobrar moedas.', 'A participação precisa ser espontânea e genuína.'],
];
const ATTITUDES: [string, string][] = [
  ['Colaboração', 'Ajudou alguém ou outro setor.'],
  ['Proatividade', 'Viu um problema e tomou iniciativa.'],
  ['Comprometimento', 'Assumiu responsabilidade pela entrega.'],
  ['Atitude de dono', 'Cuidou do resultado como parte dele.'],
  ['Resolução', 'Trouxe solução, não só apontou dificuldade.'],
  ['Excelência', 'Entregou com qualidade acima do esperado.'],
];
const FAIR: [string, string][] = [
  ['Reconhecimento verdadeiro', 'Moedas representam atitudes reais.'],
  ['Sem troca de favores', 'Não combine moedas nem faça acordos.'],
  ['Sem pressão', 'Ninguém deve cobrar ou pedir moedas.'],
  ['Mesma oportunidade', 'Todos podem reconhecer e ser reconhecidos.'],
  ['Acompanhamento', 'A liderança pode verificar distribuições fora do padrão.'],
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="font-display text-2xl leading-none text-fg">{title}</h2><div className="mt-4">{children}</div></section>;
}
function Pairs({ items, numbered }: { items: [string, string][]; numbered?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {items.map(([t, d], i) => (
        <li key={t} className="flex gap-4 py-3">
          {numbered && <span className="w-8 font-display text-2xl leading-none tabular-nums text-brand-text">{String(i + 1).padStart(2, '0')}</span>}
          <div><div className="font-semibold text-fg">{t}</div><div className="text-sm text-fg-muted">{d}</div></div>
        </li>
      ))}
    </ul>
  );
}

/** As regras do programa, como no material de apresentação. Os números (moedas, prêmios) vêm da configuração. */
export function RulesPage() {
  const home = useHome();
  const perWeek = home.data?.rules.coins_per_week ?? 0;
  const prizes = home.data?.wheel.prizes ?? [];
  return (
    <div className="space-y-12">
      <header>
        <h1 className="font-display text-4xl leading-none text-fg sm:text-5xl">Como funciona</h1>
        <p className="mt-3 text-lg text-fg-2">Fazer as boas atitudes serem percebidas. Não é só sobre ganhar moedas: é sobre criar o hábito de reconhecer o valor das pessoas.</p>
      </header>

      <Block title={perWeek > 0 ? `Cada pessoa começa a semana com ${perWeek} ${perWeek === 1 ? 'moeda' : 'moedas'}` : 'As moedas'}>
        <Pairs items={[
          ['Para distribuir entre colegas', 'Use ao longo da semana, quando uma atitude fizer a diferença.'],
          ['Renovação semanal', 'As moedas zeram toda segunda-feira e não acumulam para a semana seguinte.'],
          ['Sem valor financeiro', 'Moedas são reconhecimento, não dinheiro ou crédito.'],
        ]} />
      </Block>

      <Block title="Três regras simples. Sem exceção."><Pairs items={RULES} numbered /></Block>

      <Block title="Moeda é para atitude que faz diferença">
        <Pairs items={ATTITUDES} />
        <p className="mt-3 text-sm text-fg-muted">Pequenas atitudes também contam. Não precisa ser algo extraordinário.</p>
      </Block>

      <Block title="A moeda precisa vir acompanhada de contexto">
        <p className="rounded-xl bg-card-2 px-4 py-3 text-base text-fg">“Você me ajudou a resolver uma demanda urgente hoje, mesmo estando cheio de atividades.”</p>
        <Pairs items={[['O que a pessoa fez?', 'Descreva a atitude.'], ['Como isso ajudou?', 'Mostre o impacto no time ou no trabalho.']]} />
      </Block>

      <Block title="Quem recebe mais moedas ganha o giro">
        <p className="text-base text-fg-2">O 1º lugar da semana é o Destaque da Semana e ganha o direito de girar a roleta na semana seguinte.</p>
        <Pairs items={[
          ['1º critério de desempate', 'Mais moedas recebidas de diferentes colegas.'],
          ['2º critério de desempate', 'Se persistir o empate, giro prévio: maior número vence.'],
        ]} />
        <p className="mt-3 text-sm text-fg-muted">O ranking considera o reconhecimento da semana, não uma avaliação completa de desempenho.</p>
      </Block>

      {prizes.length > 0 && (
        <Block title={`${prizes.length} possibilidades na roleta`}>
          <ol className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {prizes.map((p, i) => (
              <li key={p.id} className={`flex gap-3 rounded-xl px-3 py-2 text-sm ${p.effect === 'double_next' ? 'bg-brand font-semibold text-brand-fg' : 'bg-card-2 text-fg'}`}>
                <span className="w-5 tabular-nums opacity-70">{String(i + 1).padStart(2, '0')}</span><span>{p.title}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-fg-muted"><b className="text-fg">Caiu em “Dobre e passe para o próximo”?</b> O prêmio não sai naquela semana. Na semana seguinte, quem ficar em 1º lugar gira a roleta e recebe em dobro o prêmio sorteado.</p>
          <p className="mt-2 text-sm text-fg-muted"><b className="text-fg">Prêmio bom não pode parar a entrega.</b> Folga, Home Office e saídas antecipadas precisam ser combinados com a liderança, respeitando reuniões, clientes, prazos e cobertura do time.</p>
        </Block>
      )}

      <Block title="A competição só funciona se for justa"><Pairs items={FAIR} /></Block>

      <p className="text-lg text-fg">Fez o time ficar melhor? <Link to="/" className="focus-ring rounded font-semibold underline">Dê uma moeda.</Link></p>
    </div>
  );
}
