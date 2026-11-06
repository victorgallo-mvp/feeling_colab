import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useHome } from '../../api/hooks';
import { useAuth } from '../../lib/auth';
import { Recognize } from '../../features/recognition/Recognize';
import { Recent } from '../../features/feed/Recent';
import { Spinner } from '../../components/ui';
import { UserProfileModal } from '../../features/profile/UserProfileModal';

/** Tela única: dar uma moeda a um colega e ver as últimas. */
export function HomePage() {
  const { me } = useAuth();
  const home = useHome();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const recId = params.get('rec');

  // deep link da notificação: /?rec=ID rola até o item
  useEffect(() => {
    if (!home.data || !recId) return;
    setTimeout(() => document.getElementById(`rec-${recId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    const t = setTimeout(() => setParams({}, { replace: true }), 2500);
    return () => clearTimeout(t);
  }, [home.data, recId, setParams]);

  if (home.isLoading || !me) return <div className="flex justify-center py-24 text-fg-faint"><Spinner className="h-6 w-6" /></div>;
  if (home.isError || !home.data) return <div className="py-16 text-center text-sm text-fg-2">Não consegui carregar. <button className="underline" onClick={() => home.refetch()}>Tentar de novo</button></div>;

  return (
    <div className="space-y-14">
      <Recognize data={home.data} />
      <Recent data={home.data} meId={me.user.id} highlightId={recId} onOpenProfile={setProfileId} />
      <UserProfileModal userId={profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}
