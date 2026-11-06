import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface Chip { id: string; label: string; emoji: string | null; color: string | null }
export interface Colleague { id: string; name: string; avatar_url: string | null; role: string; area_name: string | null; given_count: number; can_receive: boolean }
export interface FeedItem {
  id: string; giver_id: string; giver_name: string; giver_avatar: string | null; receiver_id: string; receiver_name: string; receiver_avatar: string | null;
  message: string | null; created_at: string; chip: Chip | null;
}
/** Só o que a tela única usa. A API devolve mais campos; eles são ignorados. */
export interface Home {
  cycle: { id: string; name: string; recognition_cost: number };
  me: { balance: number | null; given: number; recognitions_received: number };
  colleagues: Colleague[];
  feed: FeedItem[];
}

export const useHome = () => useQuery<Home>({ queryKey: ['home'], queryFn: () => api('/me/home'), refetchInterval: 45_000, refetchOnWindowFocus: true });

export function useInvalidateHome() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['home'] });
}

export function useGiveRecognition() {
  const inv = useInvalidateHome();
  return useMutation({
    mutationFn: (b: { receiverId: string; message?: string }) => api<{ recognition: { id: string } }>('/recognitions', { method: 'POST', json: b }),
    onSuccess: inv,
  });
}
export const useAreas = (enabled = true) => useQuery<any[]>({ queryKey: ['areas'], queryFn: () => api('/admin/areas'), enabled });
