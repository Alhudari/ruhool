import type { StoreData } from '../types.js';
import type { Migration } from './index.js';

export const migration002: Migration = {
  id: 2,
  name: 'hierarchical dispatch limits',
  up: (store: StoreData) => {
    const s = store as unknown as { limits?: { hierarchicalDispatchUsd?: number; dispatchMaxFanout?: number } };
    if (!s.limits) s.limits = {};
    if (s.limits.hierarchicalDispatchUsd == null) s.limits.hierarchicalDispatchUsd = 0.5;
    if (s.limits.dispatchMaxFanout == null) s.limits.dispatchMaxFanout = 3;
  },
};
