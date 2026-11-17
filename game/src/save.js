// Progress is kept in the browser's localStorage: cash earned, story
// missions finished, the pistol, and lifetime stats. No server, no account.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      money: data.money | 0,
      missionIndex: data.missionIndex | 0,
      hasPistol: !!data.hasPistol,
      ammo: data.ammo | 0,
      storyDone: !!data.storyDone,
      stats: {
        carsStolen: data.stats?.carsStolen | 0,
        missionsDone: data.stats?.missionsDone | 0,
        busts: data.stats?.busts | 0,
        cashEarned: data.stats?.cashEarned | 0,
      },
    };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money,
      missionIndex: state.missionIndex,
      hasPistol: state.player.weapon === 'pistol' || state.hasPistol,
      ammo: state.player.ammo,
      storyDone: state.storyDone,
      stats: state.stats,
    }));
  } catch {
    // Storage can be unavailable (private mode); the game plays on regardless.
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
}
