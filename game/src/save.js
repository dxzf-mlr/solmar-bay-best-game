// Save and load for Solmar Bay: one localStorage key holding money,
// reputation, which jobs are done, and where Dana stands. The game saves
// itself after every completed mission and on pause.

const SAVE_KEY = 'solmar-bay-save-v1';

export function createSave(G) {
  const save = {};

  save.write = function writeSave() {
    try {
      const data = {
        version: 1,
        money: G.money,
        rep: G.rep,
        missionIndex: G.missions.currentIndex,
        completed: [...G.missions.completed],
        playerX: G.player.pos.x,
        playerZ: G.player.pos.z,
        health: G.player.health,
        wanted: G.police.wanted,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      return false;
    }
  };

  save.read = function readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return null;
      return data;
    } catch (err) {
      return null;
    }
  };

  save.hasSave = function hasSaveGame() {
    return save.read() !== null;
  };

  save.apply = function applySave(data) {
    if (!data) return false;
    G.money = data.money || 0;
    G.rep = data.rep || 0;
    G.missions.currentIndex = data.missionIndex || 0;
    G.missions.completed = new Set(data.completed || []);
    G.missions.status = 'idle';
    G.missions.stepIndex = 0;
    G.missions.stepProgress = 0;
    G.player.pos.x = data.playerX ?? G.world.places.playerStart.x;
    G.player.pos.z = data.playerZ ?? G.world.places.playerStart.z;
    G.player.group.position.copy(G.player.pos);
    G.player.health = data.health || 100;
    G.police.setWanted(data.wanted || 0);
    return true;
  };

  save.clear = function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (err) {
      // A missing key is fine.
    }
  };

  return save;
}
