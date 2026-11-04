import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface Chip { id: string; label: string; emoji: string | null; color: string | null }
export interface Colleague { id: string; name: string; avatar_url: string | null; role: string; area_name: string | null; given_count: number; can_receive: boolean }
export interface Mission {
  id: string; title: string; description: string | null; points: number; recurrence: 'once' | 'weekly' | 'monthly'; scope: 'all' | 'area';
  creator_name: string; period_key: string; due_at: string | null; completion_id: string | null; completion_status: 'pending' | 'approved' | 'rejected' | null; review_note: string | null;
}
export interface FeedItem {
  id: string; giver_id: string; giver_name: string; giver_avatar: string | null; receiver_id: string; receiver_name: string; receiver_avatar: string | null;
  message: string | null; created_at: string; chip: Chip; claps: number; clapped: boolean;
}
export interface QueueItem { id: string; mission_id: string; title: string; points: number; user_id: string; user_name: string; user_avatar: string | null; period_key: string; completed_at: string }
export interface Home {
  cycle: { id: string; name: string; starts_at: string; ends_at: string; progress_pct: number; coins_per_user: number; recognition_cost: number; max_per_receiver: number; goal: { pct: number; min_recognitions: number; min_missions: number } };
  me: { balance: number; given: number; points_total: number; points_recognition: number; points_missions: number; recognitions_received: number; missions_completed: number; met_participation: boolean; streak: number; rank: number | null };
  ranking: { user_id: string; name: string; avatar_url: string | null; area_name: string | null; rank: number; points_total: number; recognitions_received: number; missions_completed: number; streak: number }[];
  rewards: { id: string; title: string; description: string | null; kind: 'individual' | 'team' }[];
  wheel: { week_key: string; winner: { user_id: string; name: string; avatar_url: string | null; points: number } | null; spin: { id: string; user_id: string; reward_title: string; spun_at: string } | null; prizes: { id: string; title: string; description: string | null; weight: number }[]; can_spin: boolean };
  team: { met: number; total: number; pct: number; reached: boolean };
  colleagues: Colleague[]; chips: Chip[]; missions: Mission[]; feed: FeedItem[]; queue: QueueItem[];
}

export const useHome = () => useQuery<Home>({ queryKey: ['home'], queryFn: () => api('/me/home'), refetchInterval: 45_000, refetchOnWindowFocus: true });

export function useInvalidateHome() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['home'] });
}

export function useGiveRecognition() {
  const inv = useInvalidateHome();
  return useMutation({
    mutationFn: (b: { receiverId: string; chipId: string; message?: string }) => api('/recognitions', { method: 'POST', json: b }),
    onSuccess: inv,
  });
}
export function useSetMessage() {
  const inv = useInvalidateHome();
  return useMutation({ mutationFn: ({ id, message }: { id: string; message: string }) => api(`/recognitions/${id}`, { method: 'PATCH', json: { message } }), onSuccess: inv });
}
export function useClap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ clapped: boolean; claps: number }>(`/recognitions/${id}/reactions`, { method: 'POST' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['home'] });
      const prev = qc.getQueryData<Home>(['home']);
      if (prev) qc.setQueryData<Home>(['home'], { ...prev, feed: prev.feed.map((f) => f.id === id ? { ...f, clapped: !f.clapped, claps: f.claps + (f.clapped ? -1 : 1) } : f) });
      return { prev };
    },
    onError: (_e, _id, ctx) => { if (ctx?.prev) qc.setQueryData(['home'], ctx.prev); },
  });
}
export function useCompleteMission() {
  const inv = useInvalidateHome();
  return useMutation({ mutationFn: (id: string) => api(`/missions/${id}/complete`, { method: 'POST' }), onSuccess: inv });
}
export function useReview() {
  const inv = useInvalidateHome();
  return useMutation({ mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string }) => api(`/completions/${id}/review`, { method: 'POST', json: { approve, note } }), onSuccess: inv });
}
export function useCreateMission() {
  const inv = useInvalidateHome();
  return useMutation({ mutationFn: (b: any) => api('/missions', { method: 'POST', json: b }), onSuccess: inv });
}
export const useTemplates = (enabled: boolean) => useQuery<any[]>({ queryKey: ['templates'], queryFn: () => api('/missions/templates'), enabled });
export const useAreas = (enabled = true) => useQuery<any[]>({ queryKey: ['areas'], queryFn: () => api('/admin/areas'), enabled });
