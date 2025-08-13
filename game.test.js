const fs = require('fs');
const vm = require('vm');

describe('saveSlot and loadSlot', () => {
  let context;

  beforeEach(() => {
    // mock storage
    let store = {};
    global.localStorage = {
      getItem: key => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: key => { delete store[key]; },
      clear: () => { store = {}; }
    };

    // extract functions from game.js
    const code = fs.readFileSync(__dirname + '/game.js', 'utf8');
    const saveSlotCode = code.match(/function saveSlot\(\)\{[^]*?safeStorageSet[^]*?\}\s*/)[0];
    const loadSlotCode = code.match(/function loadSlot\(\)\{[^]*?return true;\s*\}/)[0];
    const safeGetCode = code.match(/function safeStorageGet[^]*?\}\n/)[0];
    const safeSetCode = code.match(/function safeStorageSet[^]*?\}\n/)[0];

    context = {
      localStorage: global.localStorage,
      updHUD: () => {},
      resetWorld: () => {},
      lokiStats: { speed: 1000 }
    };
    vm.createContext(context);
    vm.runInContext(`
        var lvl=1, goal=15;
        var countL=0, countM=0, countY=0, xp=0;
      ${safeGetCode}
      ${safeSetCode}
      ${saveSlotCode}
      ${loadSlotCode}
    `, context);
  });

  test('restores game state after save/load', () => {
      Object.assign(context, { lvl: 3, goal: 100, countL: 1, countM: 2, countY: 3, xp: 7 });
    context.saveSlot();

    expect(localStorage.getItem('slot0')).not.toBeNull();
    expect(localStorage.getItem('slot')).toBeNull();

      Object.assign(context, { lvl: 0, goal: 0, countL: 0, countM: 0, countY: 0, xp: 0 });
    const result = context.loadSlot();

    expect(result).toBe(true);
      const { lvl, goal, countL, countM, countY, xp } = context;
      expect({ lvl, goal, countL, countM, countY, xp }).toEqual({
        lvl: 3,
        goal: 100,
        countL: 1,
        countM: 2,
        countY: 3,
        xp: 7
      });
  });
});

describe('catchMouse', () => {
  const code = fs.readFileSync(__dirname + '/game.js', 'utf8');

  test('overlap destroys mouse and increments counters', () => {
    const idx = code.indexOf('scene.physics.add.overlap(loki, miceGroup');
    expect(idx).toBeGreaterThan(-1);
    const body = code.slice(idx, code.indexOf('checkEnd();', idx));
    expect(body).toMatch(/m\.destroy\(\)/);
    expect(body).toMatch(/countL\+\+/);
    expect(body).not.toMatch(/goalCaught\+\+/);
    expect(body).toMatch(/xp\+\+/);
  });
});

describe('Loki world bounds', () => {
  const code = fs.readFileSync(__dirname + '/game.js', 'utf8');

  test('create includes world bounds collision', () => {
    const createSection = code.match(/function create\(\)[^]*?scene\.cameras\.main\.startFollow/)[0];
    const spriteIdx = createSection.indexOf("loki = scene.physics.add.sprite");
    expect(spriteIdx).toBeGreaterThan(-1);
    const collideIdx = createSection.indexOf("loki.setCollideWorldBounds(true)", spriteIdx);
    expect(collideIdx).toBeGreaterThan(spriteIdx);
  });

  test('resetWorld includes world bounds collision', () => {
    const resetSection = code.match(/function resetWorld\(\)[^]*?scene\.cameras\.main\.startFollow/)[0];
    const spriteIdx = resetSection.indexOf("loki = scene.physics.add.sprite");
    expect(spriteIdx).toBeGreaterThan(-1);
    const collideIdx = resetSection.indexOf("loki.setCollideWorldBounds(true)", spriteIdx);
    expect(collideIdx).toBeGreaterThan(spriteIdx);
  });
});

describe('speed configuration', () => {
  const code = fs.readFileSync(__dirname + '/game.js', 'utf8');

  test('lokiStats controls speed and applyLevelUp increases it', () => {
    expect(code).toMatch(/const lokiStats = \{\s*speed:\s*1000\s*\}/);
    const initMatch = code.match(/loki.speed\s*=\s*lokiStats.speed/);
    expect(initMatch).not.toBeNull();
    const applyMatch = code.match(/function applyLevelUp\(\)\{[^]*?const inc=50;[^]*?lokiStats.speed\s*\+=\s*inc/);
    expect(applyMatch).not.toBeNull();
  });
});

describe('nextLevel', () => {
  const code = fs.readFileSync(__dirname + '/game.js', 'utf8');

  test('increments level, resets counters, and applies level-up', () => {
    const nextLevelCode = code.match(/function nextLevel\(\)\{[^]*?\}\n/)[0];
    const context = {
      updHUD: () => {},
      resetWorld: () => {},
      resetCooldowns: () => {},
      applied: false
    };
    context.applyLevelUp = () => { context.applied = true; };
    vm.createContext(context);
    vm.runInContext(`
      var lvl=1, goal=15, countL=1, countM=2, countY=3;
      ${nextLevelCode}
    `, context);

    context.nextLevel();
    const { lvl, countL, countM, countY, applied } = context;
    expect(lvl).toBe(2);
    expect(countL).toBe(0);
    expect(countM).toBe(0);
    expect(countY).toBe(0);
    expect(applied).toBe(true);
  });
});

describe('minimap toggle', () => {
  const code = fs.readFileSync(__dirname + '/game.js', 'utf8');
  const applyCfgCode = code.match(/function applyCfg\(\)\{[^]*?\}\n/)[0];
  const btnMapCode = code.match(/btnMap\.onclick\s*=\s*\(\)\s*=>\s*\{[^]*?applyCfg\(\);[^]*?\};/)[0];

  test('hidden when mapToggle unchecked', () => {
    const context = {
      mapToggle: { checked: true },
      mm: { style: { display: 'block' } },
      joy: { style: {}, classList: { add: () => {}, remove: () => {} } },
      joySize: { value: 160 },
      ctrl: { value: 'joystick', classList: { add: () => {}, remove: () => {} } },
      sfxToggle: { checked: true },
      safeStorageSet: () => {},
      btnMap: {}
    };
    vm.createContext(context);
    vm.runInContext(`
      ${applyCfgCode}
      ${btnMapCode}
    `, context);

    context.btnMap.onclick();
    expect(context.mapToggle.checked).toBe(false);
    expect(context.mm.style.display).toBe('none');
  });
});
