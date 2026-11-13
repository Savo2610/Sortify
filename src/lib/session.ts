import { dedupe, orderQueue, TrackSet } from './queue';
import { loadTracks, pool } from './spotify';
import { storage } from './storage';
import { LIKED, type QueueItem, type SessionConfig } from './types';

export interface LoadStep {
  id: string;
  label: string;
  loaded: number;
  total: number;
  done: boolean;
}

export interface BuiltSession {
  queue: QueueItem[];
  /** Membership of every target playlist, kept up to date while sorting. */
  targetSets: Record<string, TrackSet>;
  sourceCount: number;
  excludedCount: number;
  inTargetsCount: number;
  seenCount: number;
}

export async function buildSession(
  config: SessionConfig,
  names: (id: string) => string,
  onSteps: (steps: LoadStep[]) => void,
  processed: Set<string> = new Set(),
): Promise<BuiltSession> {
  const otherIds = [...new Set([...config.excludeIds, ...config.targetIds])].filter((id) => id !== config.sourceId);
  const steps: LoadStep[] = [config.sourceId, ...otherIds].map((id) => ({
    id,
    label: names(id),
    loaded: 0,
    total: 0,
    done: false,
  }));
  const emit = () => onSteps(steps.map((s) => ({ ...s })));
  emit();

  const loadOne = async (id: string) => {
    const step = steps.find((s) => s.id === id)!;
    const items = await loadTracks(id, (loaded, total) => {
      step.loaded = loaded;
      step.total = total;
      emit();
    });
    step.done = true;
    emit();
    return items;
  };

  const [source, others] = await Promise.all([loadOne(config.sourceId), pool(otherIds, 3, loadOne)]);

  const loaded = new Map(otherIds.map((id, i) => [id, others[i]]));
  const excludeSet = new TrackSet(config.excludeIds.flatMap((id) => loaded.get(id)?.map((q) => q.track) ?? []));
  const targetSets: Record<string, TrackSet> = {};
  for (const id of config.targetIds) targetSets[id] = new TrackSet(loaded.get(id)?.map((q) => q.track) ?? []);
  const seen = config.hideSeen ? storage.getSeen(config.sourceId) : new Set<string>();

  let excludedCount = 0,
    inTargetsCount = 0,
    seenCount = 0;
  const unique = dedupe(source);
  const queue = unique.filter(({ track }) => {
    if (processed.has(track.id)) return false;
    if (excludeSet.has(track, config.fuzzyMatch)) {
      excludedCount++;
      return false;
    }
    if (config.skipInTargets && Object.values(targetSets).some((s) => s.has(track, config.fuzzyMatch))) {
      inTargetsCount++;
      return false;
    }
    if (seen.has(track.id)) {
      seenCount++;
      return false;
    }
    return true;
  });

  return {
    queue: orderQueue(queue, config.order),
    targetSets,
    sourceCount: unique.length,
    excludedCount,
    inTargetsCount,
    seenCount,
  };
}

export const isLiked = (id: string) => id === LIKED;
