import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useHome } from '../../api/hooks';
import { useAuth } from '../../lib/auth';
import { CycleBar } from '../../features/cycle/CycleBar';
import { PeopleGrid } from '../../features/recognition/PeopleGrid';
import { MissionList } from '../../features/missions/MissionList';
import { Feed } from '../../features/feed/Feed';
import { ValidationQueue } from '../../features/manager/ValidationQueue';
import { NewMissionSheet } from '../../features/manager/NewMissionSheet';
import { Button, Spinner } from '../../components/ui';
import { Ranking } from '../../features/ranking/Ranking';
import { RewardsCard, WheelCard } from '../../features/rewards/Wheel';
import { UserProfileModal } from '../../features/profile/UserProfileModal';

export function HomePage() {
  const { me } = useAuth();
  const home = useHome();
  const [newMission, setNewMission] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const focus = params.get('focus');
  const missionId = params.get('mission');
  const recId = params.get('rec');

  // deep links das notificações: /?focus=missions&mission=ID, /?focus=feed&rec=ID, /?focus=recognize
  useEffect(() => {
    if (!home.data || !focus) return;
    if (focus === 'profile' && me) setProfileId(me.user.id);
    const target = missionId ? `mission-${missionId}` : recId ? `rec-${recId}` : focus === 'recognize' ? 'recognize' : focus === 'missions' ? 'missions' : focus === 'feed' ? 'feed' : focus === 'wheel' ? 'wheel' : focus === 'ranking' ? 'ranking' : null;
    if (target) setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    const t = setTimeout(() => setParams({}, { replace: true }), 2500);
    return () => clearTimeout(t);
  }, [home.data, focus, missionId, recId, setParams, me]);

  if (home.isLoading || !me) return <div className="flex justify-center py-20 text-fg-faint"><Spinner className="h-6 w-6" /></div>;
  if (home.isError || !home.data) return <div className="card p-8 text-center text-sm text-fg-2">Não consegui carregar. <button className="text-brand-text underline" onClick={() => home.refetch()}>Tentar de novo</button></div>;
  const d = home.data;
  const isManager = me.user.role !== 'member';

  return (
    <div className="space-y-4">
      <CycleBar data={d} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-7">
          <PeopleGrid data={d} />
          {isManager && <ValidationQueue data={d} />}
          <MissionList data={d} highlightId={missionId}
            action={isManager ? <Button size="sm" variant="soft" onClick={() => setNewMission(true)}>+ Nova missão</Button> : undefined} />
        </div>
        <div className="min-w-0 space-y-4 lg:col-span-5">
          <Ranking data={d} meId={me.user.id} onOpenProfile={setProfileId} />
          <WheelCard data={d} meId={me.user.id} focus={focus === 'wheel'} />
          <RewardsCard data={d} />
          <Feed data={d} meId={me.user.id} highlightId={recId} onOpenProfile={setProfileId} />
        </div>
      </div>
      <UserProfileModal userId={profileId} onClose={() => setProfileId(null)} />
      {isManager && <NewMissionSheet open={newMission} onClose={() => setNewMission(false)} isAdmin={me.user.role === 'admin'} myAreaId={me.user.area?.id ?? null} />}
    </div>
  );
}
