
(() => {
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const biomes = ['kitchen','garden','garage','street'];
  const META = {w:128,h:130,rows:{idle:0,run:1,sprint:2},frames:{idle:10,run:10,sprint:10}};
  const WORLD = { w: 4800, h: 3200 };
  const OBST = {
    0:[[600,300,460,60],[1100,500,420,80],[1900,1200,500,60],[2600,800,380,90]],
    1:[[700,700,300,140],[1600,1000,420,120],[2300,400,260,100],[3200,900,380,90]],
    2:[[800,600,420,110],[1500,1200,380,90],[2400,800,420,120],[3000,1400,560,80]],
    3:[[600,600,600,100],[1700,900,500,90],[2600,700,420,90],[3400,1200,480,100]]
  };

  const hud = document.getElementById('hud'), menu = document.getElementById('menu');
    const cL=document.getElementById('cL'), cM=document.getElementById('cM'), cY=document.getElementById('cY'), xpEl=document.getElementById('xp');
    const lvlEl = document.getElementById('lvl'), goalNeed = document.getElementById('goalNeed'), goalLeft = document.getElementById('goalLeft');
    const statMsg=document.getElementById('statMsg');
  const btnNew = document.getElementById('btnNew'), btnContinue = document.getElementById('btnContinue');
  const btnRestart=document.getElementById('btnRestart'), btnMenu=document.getElementById('btnMenu'), btnMap=document.getElementById('btnMap'), btnPause=document.getElementById('btnPause'), btnMute=document.getElementById('btnMute');
  const ctrl = document.getElementById('ctrl'), joy = document.getElementById('joy'), stick = document.getElementById('stick'), joySize=document.getElementById('joySize');
  const mapToggle = document.getElementById('mapToggle'), sfxToggle=document.getElementById('sfxToggle');
  const btnSettings=document.getElementById('btnSettings'), btnCredits=document.getElementById('btnCredits');
  const settings=document.getElementById('settings'), credits=document.getElementById('credits');
  const mm = document.getElementById('minimap'), mctx = mm.getContext('2d');
  const ovWin=document.getElementById('ovWin'), winMsg=document.getElementById('winMsg'), btnNext=document.getElementById('btnNext');
  const ovLose=document.getElementById('ovLose'), loseMsg=document.getElementById('loseMsg'), btnRetry=document.getElementById('btnRetry');
  const bgm = document.getElementById('bgm'); const sCatch=document.getElementById('sCatch'), sPounce=document.getElementById('sPounce'), sSprint=document.getElementById('sSprint');
  const skillbar = document.querySelector('.skillbar');
  let gameReady = false;

  const INITIAL_GOAL = 15;
    let state='menu',lvl=1,goal=INITIAL_GOAL;
    let countL=0,countM=0,countY=0,xp=0;
    function updHUD(){ cL.textContent=countL; cM.textContent=countM; cY.textContent=countY; lvlEl.textContent=lvl; goalNeed.textContent=goal; goalLeft.textContent=Math.max(0, goal-countL); xpEl.textContent=xp; }

  function showStatMsg(msg){ if(!statMsg) return; statMsg.textContent=msg; statMsg.style.display='block'; setTimeout(()=>{ statMsg.style.display='none'; },2000); }

  function safeStorageGet(key, fallback=null){ try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
  function safeStorageSet(key, value){ try { localStorage.setItem(key, value); } catch { } }

  let cfg={};
  try { cfg = JSON.parse(safeStorageGet('loki_v10_cfg','{}')); } catch { cfg={}; }
  ctrl.value = cfg.ctrl || 'joystick'; mapToggle.checked = (cfg.map ?? true); sfxToggle.checked = (cfg.sfx ?? true); joySize.value = cfg.joySize || 160;
  function applyCfg(){ joy.style.width=joySize.value+'px'; joy.style.height=joySize.value+'px'; mm.style.display = mapToggle.checked ? 'block' : 'none'; if(ctrl.value==='swipe'){ joy.classList.add('hidden'); } else { joy.classList.remove('hidden'); } safeStorageSet('loki_v10_cfg', JSON.stringify({ ctrl: ctrl.value, map: mapToggle.checked, sfx: sfxToggle.checked, joySize:+joySize.value })); }
  ['input','change'].forEach(ev=> joySize.addEventListener(ev, applyCfg)); ctrl.addEventListener('change',applyCfg); mapToggle.addEventListener('change',applyCfg); sfxToggle.addEventListener('change',applyCfg); applyCfg();

  function initMenu(){
    document.getElementById('btnSettings').onclick = ()=>{ settings.style.display = settings.style.display? '' : 'block'; credits.style.display='none'; };
    document.getElementById('btnCredits').onclick = ()=>{ credits.style.display = credits.style.display? '' : 'block'; settings.style.display='none'; };
    btnNew.onclick = ()=>{ if(!gameReady) return; newGame(); startGame(); };
    btnContinue.onclick = ()=>{ if(!gameReady) return; if(loadSlot()) startGame(); else newGame(), startGame(); };
    btnRestart.onclick = ()=>{ newGame(); startGame(); };
    btnMenu.onclick = ()=>{ showMenu(); saveSlot(); };
    btnMap.onclick = ()=>{ mapToggle.checked = !mapToggle.checked; applyCfg(); };
    btnPause.onclick = ()=>{ scene.scene.pause(); };
    btnMute.onclick = ()=>{ if(!bgm.paused) bgm.pause(); else { if(sfxToggle.checked) bgm.play(); } };
    btnNext.onclick = () => { ovWin.style.display='none'; nextLevel(); scene.scene.resume(); };
    btnRetry.onclick = () => { ovLose.style.display='none'; newGame(); startGame(); scene.scene.resume(); };

    const ensureTouchClick = btn => btn.addEventListener('touchend', () => btn.click());
    ensureTouchClick(btnNew);
    ensureTouchClick(btnContinue);

    updHUD(); if(safeStorageGet('slot0') || safeStorageGet('slot')) btnContinue.style.display='';
    showMenu();
  }

  initMenu();

  const config = {
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#000',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1280,
      height: 720
    },
    physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
    scene: { preload, create, update }
  };
  const game = new Phaser.Game(config);
  let scene, layers=null, loki, merlin=null, yumi=null, miceGroup, obstGroup;
  let keys;
  let jdx=0,jdy=0, swipeActive=false, swipeStart=null;
  const BASE_MICE = /iPhone|iPad|iPod/.test(navigator.userAgent)?80:100;
  const lokiStats = { speed: 1000 };
  const maxMice = () => Math.floor(BASE_MICE * (1 + 0.5*(lvl-1)));

  function preload(){
    scene=this;
    for(const b of biomes){
      // Use the existing single background image for all parallax layers
      this.load.image(b, `${b}.webp`);
    }
    this.load.spritesheet('loki', 'loki_sheet.webp', { frameWidth: META.w, frameHeight: META.h });
    this.load.spritesheet('merlin', 'merlin_sheet.webp', { frameWidth: META.w, frameHeight: META.h });
    this.load.spritesheet('yumi', 'yumi_sheet.webp', { frameWidth: META.w, frameHeight: META.h });
    this.load.spritesheet('mouse', 'mouse_sheet.webp', { frameWidth: 56, frameHeight: 36 });
  }

  function create(){
    this.scale.lockOrientation('landscape');
    if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(()=>{});
    const addAnim = (key, prefix) => {
      scene.anims.create({ key: `${key}_idle`, frames: scene.anims.generateFrameNumbers(prefix, { start:0, end: META.frames.idle-1 }), frameRate: 8, repeat: -1 });
      scene.anims.create({ key: `${key}_run`, frames: scene.anims.generateFrameNumbers(prefix, { start:META.frames.idle, end: META.frames.idle+META.frames.run-1 }), frameRate: 14, repeat: -1 });
      scene.anims.create({ key: `${key}_sprint`, frames: scene.anims.generateFrameNumbers(prefix, { start:META.frames.idle+META.frames.run, end: META.frames.idle+META.frames.run+META.frames.sprint-1 }), frameRate: 16, repeat: -1 });
    };
    addAnim('loki','loki'); addAnim('merlin','merlin'); addAnim('yumi','yumi');
    scene.anims.create({ key:'mouse_run', frames: scene.anims.generateFrameNumbers('mouse', { start:0, end:7 }), frameRate: 16, repeat: -1 });

    scene.cameras.main.setBounds(0,0,WORLD.w,WORLD.h);
    scene.physics.world.setBounds(0,0,WORLD.w,WORLD.h);

    initWorld(); // sets up layers, sprites, and camera follow
    // loki speed is configured in initWorld via lokiStats

    keys = scene.input.keyboard.addKeys('W,A,S,D,LEFT,RIGHT,UP,DOWN,SPACE,SHIFT');
    keys.SHIFT.on('down', () => {
      loki.boost = loki.boost ? 0 : 1;
      if (loki.boost && sfxToggle.checked) {
        sSprint.currentTime = 0;
        sSprint.play();
      }
    });
    const cvs = scene.game.canvas;
    const prevent = e => { if(!e.target.closest('#menu, #hud')) e.preventDefault(); };
    ['touchstart','touchmove','touchend','gesturestart'].forEach(ev=> cvs.addEventListener(ev, prevent, {passive:false}));
    cvs.addEventListener('pointerdown', e=>{ if(ctrl.value!=='swipe') return; swipeActive=true; swipeStart={x:e.clientX,y:e.clientY}; if(bgm.paused&&sfxToggle.checked) bgm.play(); });
    window.addEventListener('pointermove', e=>{ if(ctrl.value!=='swipe'||!swipeActive) return; const dx=e.clientX-swipeStart.x, dy=e.clientY-swipeStart.y; const max=180; const len=Math.hypot(dx,dy)||1; const rx=(dx/len)*Math.min(1, Math.abs(dx)/max); const ry=(dy/len)*Math.min(1, Math.abs(dy)/max); jdx=rx; jdy=ry; });
    window.addEventListener('pointerup', ()=>{ if(ctrl.value!=='swipe') return; swipeActive=false; jdx=jdy=0; });

    joy.addEventListener('pointerdown',e=>{ if(ctrl.value!=='joystick') return; joy.setPointerCapture?.(e.pointerId); moveStick(e); if(bgm.paused&&sfxToggle.checked) bgm.play(); });
    joy.addEventListener('pointermove',e=>{ if(ctrl.value!=='joystick') return; moveStick(e); });
    joy.addEventListener('pointerup',()=>{ if(ctrl.value!=='joystick') return; setStick(0,0); jdx=jdy=0; });
    function moveStick(e){ const rect=joy.getBoundingClientRect(); const t=e.touches?e.touches[0]:e; const dx=t.clientX-(rect.left+rect.width/2); const dy=t.clientY-(rect.top+rect.height/2); const max=Math.min(rect.width,rect.height)/2 - 18; const len=Math.hypot(dx,dy)||1; const nx=dx/len*Math.min(len,max), ny=dy/len*Math.min(len,max); setStick(nx,ny); const dz=0.12; const rx=(nx/max), ry=(ny/max); jdx = Math.abs(rx)<dz ? 0 : rx; jdy = Math.abs(ry)<dz ? 0 : ry; }
    function setStick(nx,ny){ stick.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`; }

    gameReady = true;
    btnNew.disabled = btnContinue.disabled = false;

  }

  function spawnMouse(){
    const isGolden = Math.random() < 0.05;
    const m = scene.physics.add.sprite(80+Math.random()*(WORLD.w-160), 80+Math.random()*(WORLD.h-160), 'mouse').play('mouse_run');
    if(isGolden) m.setTint(0xffd700);
    const d = 36;
    m.setCircle(d / 2, (56 - d) / 2, (36 - d) / 2); // 36px diameter centered in 56×36 sprite
    m.base = 120 + Math.random()*40;
    m.dir = new Phaser.Math.Vector2((Math.random()*2-1),(Math.random()*2-1)).normalize();
    m.body.setVelocity(m.dir.x*m.base, m.dir.y*m.base);
    m.setFlipX(m.body.velocity.x < 0);
    m.setBounce(1,1).setCollideWorldBounds(true);
    scene.physics.add.collider(m, obstGroup);
    miceGroup.add(m);
    return m;
  }

  function resetCooldowns(){
    skillbar?.querySelectorAll('.skillbtn').forEach(btn => btn.removeAttribute('data-cd'));
  }

  function startGame(){
    state='play';
    hud.style.display='flex';
    menu.style.display='none';
    if (skillbar) skillbar.style.display = 'flex';
    resetCooldowns();
    if(bgm.paused && sfxToggle.checked) bgm.play();
  }

  function showMenu(){
    state='menu';
    hud.style.display='none';
    menu.style.display='flex';
    if (skillbar) skillbar.style.display = 'none';
  }

  function newGame(){
    lvl=1; goal=INITIAL_GOAL; countL=countM=countY=0; xp=0; lokiStats.speed=1000;
    updHUD();
    resetWorld();
    resetCooldowns();
  }

  function applyLevelUp(){ const inc=50; lokiStats.speed+=inc; if(loki) loki.speed=lokiStats.speed; showStatMsg(`Geschwindigkeit +${inc}`); }

  function nextLevel(){
    lvl++;
    goal = Math.floor(goal*1.1); countL=0; countM=0; countY=0;
    applyLevelUp();
    updHUD();
    resetWorld();
    resetCooldowns();
  }

  function resetWorld(){
    initWorld();
    // speed handled in initWorld
  }

  function initWorld(){
    scene.cameras.main.stopFollow();
    scene.cameras.main.setScroll(0,0);
    const biome = biomes[(lvl-1)%biomes.length];
    if(!layers){
      layers = {
        far: scene.add.tileSprite(0,0, WORLD.w, WORLD.h, `${biome}`).setOrigin(0,0).setScrollFactor(0),
        mid: scene.add.tileSprite(0,0, WORLD.w, WORLD.h, `${biome}`).setOrigin(0,0).setScrollFactor(0),
        near: scene.add.tileSprite(0,0, WORLD.w, WORLD.h, `${biome}`).setOrigin(0,0).setScrollFactor(0)
      };
    } else {
      layers.far.setTexture(biome);
      layers.mid.setTexture(biome);
      layers.near.setTexture(biome);
    }

    if(obstGroup){
      obstGroup.clear(true,true);
    } else {
      obstGroup = scene.physics.add.staticGroup();
    }
    for(const o of OBST[(lvl-1)%4]){
      const r = scene.add.rectangle(o[0]+o[2]/2, o[1]+o[3]/2, o[2], o[3], 0x222a55, 0.55).setStrokeStyle(2,0x23284a);
      obstGroup.add(r);
    }

    if(loki){ loki.destroy(); }
    if(merlin){ merlin.destroy(); merlin=null; }
    if(yumi){ yumi.destroy(); yumi=null; }
    loki = scene.physics.add.sprite(WORLD.w/2, WORLD.h/2, 'loki').setDepth(10);
    loki.setCollideWorldBounds(true);
    const scale = 0.75;
    const radius = 32 * scale;
    loki.setScale(scale);
    loki.play('loki_idle');
    loki.setCircle(radius, META.w * scale / 2 - radius, META.h * scale / 2 - radius);
    loki.speed=lokiStats.speed; loki.boost=0;
    loki.body.setDrag(180, 180);
    loki.setFlipX(loki.body.velocity.x < 0);

    if(miceGroup){
      miceGroup.clear(true,true);
    } else {
      miceGroup = scene.physics.add.group({ allowGravity:false });
    }
    for (let i = 0; i < maxMice(); i++) spawnMouse();

    scene.physics.add.collider(loki, obstGroup);
    scene.physics.add.overlap(loki, miceGroup, (cat, m)=>{
      const { x, y } = m;
      m.destroy();
      // Particle burst at the mouse position
      const particles = scene.add.particles('mouse');
      const emitter = particles.createEmitter({
        frame: 0,
        speed: { min: -200, max: 200 },
        scale: { start: 0.6, end: 0 },
        lifespan: 300,
        quantity: 10
      })
      emitter.explode(10, x, y);
      scene.time.delayedCall(300, () => particles.destroy());
      if (navigator.vibrate) navigator.vibrate(100);
      countL++;
      xp++;
      if (sfxToggle.checked) {
        sCatch.currentTime = 0;
        sCatch.play();
      }
      updHUD();
      checkEnd();
    });

    scene.cameras.main.startFollow(loki, false, 0.5, 0.5);
  }

    function saveSlot(){ const s={lvl,goal,countL,countM,countY,xp}; safeStorageSet('slot0',JSON.stringify(s)); }
    function loadSlot(){ const s=safeStorageGet('slot0') || safeStorageGet('slot'); if(!s) return false; let o; try{ o=JSON.parse(s); }catch{ return false; } lvl=o.lvl; goal=o.goal; countL=o.countL; countM=o.countM; countY=o.countY; xp=o.xp||0; lokiStats.speed=1000+50*(lvl-1); updHUD(); resetWorld(); if(!safeStorageGet('slot0')) safeStorageSet('slot0', s); return true; }

  function checkEnd(){
    if(countM>=goal || countY>=goal){
      ovLose.style.display='flex';
      loseMsg.textContent=(countM>=goal?'Merlin':'Yumi')+' war schneller!';
      scene.scene.pause();
      return true;
    }
    if(countL>=goal){
      ovWin.style.display='flex';
      winMsg.textContent="Weiter geht's!";
      scene.scene.pause();
      return true;
    }
    return false;
  }

  function update(time, delta){
    if(state!=='play') return;
    const dt = Math.min(0.02, delta/1000);
    if(miceGroup.countActive(true) < maxMice()) spawnMouse();
    const left = keys.A.isDown || keys.LEFT.isDown;
    const right = keys.D.isDown || keys.RIGHT.isDown;
    const up = keys.W.isDown || keys.UP.isDown;
    const down = keys.S.isDown || keys.DOWN.isDown;
    let ax = (left?-1:0) + (right?1:0) + jdx;
    let ay = (up?-1:0) + (down?1:0) + jdy;
    let len = Math.hypot(ax,ay)||1; ax/=len; ay/=len;
    loki.body.setVelocity(ax*(loki.speed+(loki.boost?200:0)), ay*(loki.speed+(loki.boost?200:0)));
    loki.setFlipX(loki.body.velocity.x < 0);
    loki.play(Math.hypot(loki.body.velocity.x,loki.body.velocity.y)>30 ? (loki.boost?'loki_sprint':'loki_run') : 'loki_idle', true);

    if(lvl>=2 && !merlin){
      merlin = scene.physics.add.sprite(loki.x - 200, loki.y - 200, 'merlin');
      const scale = 0.75;
      const radius = 21 * scale;
      merlin.setScale(scale);
      merlin.play('merlin_run');
      merlin.speed=330;
      merlin.setCircle(radius, META.w * scale / 2 - radius, META.h * scale / 2 - radius);
      merlin.setCollideWorldBounds(true);
      scene.physics.add.collider(merlin, obstGroup);
      scene.physics.add.overlap(merlin, miceGroup, (cat,m)=>{ m.destroy(); countM++; updHUD(); checkEnd(); });
    }
    if(lvl>=3 && !yumi){
      yumi = scene.physics.add.sprite(WORLD.w-200,WORLD.h-200,'yumi');
      const scale = 0.75;
      const radius = 21 * scale;
      yumi.setScale(scale);
      yumi.play('yumi_run');
      yumi.speed=300;
      yumi.setCircle(radius, META.w * scale / 2 - radius, META.h * scale / 2 - radius);
      yumi.setCollideWorldBounds(true);
      scene.physics.add.collider(yumi, obstGroup);
      scene.physics.add.overlap(yumi, miceGroup, (cat,m)=>{ m.destroy(); countY++; updHUD(); checkEnd(); });
    }

    const chase = (cat)=>{
      let target=null, td=1e9;
      miceGroup.children.iterate(m => { if(!m) return; const d = Phaser.Math.Distance.Between(cat.x,cat.y,m.x,m.y); if(d<td){td=d; target=m;} });
      if(target){ const ang = Phaser.Math.Angle.Between(cat.x,cat.y,target.x,target.y); scene.physics.velocityFromRotation(ang, cat.speed, cat.body.velocity); }
    };
    if(merlin) chase(merlin); if(yumi) chase(yumi);

    miceGroup.children.iterate(m => {
      if(!m) return;
      const targets = [loki,merlin,yumi].filter(Boolean);
      let nearest=null, nd=1e9;
      targets.forEach(t=>{ const d=Phaser.Math.Distance.Between(m.x,m.y,t.x,t.y); if(d<nd){nd=d; nearest=t;} });
      if(nearest && nd<200){
        const ang = Phaser.Math.Angle.Between(nearest.x,nearest.y,m.x,m.y);
        scene.physics.velocityFromRotation(ang, Math.min(240, m.base+120), m.body.velocity);
      } else {
        if(Math.random()<0.03){ const ang=Math.random()*Math.PI*2; scene.physics.velocityFromRotation(ang, m.base, m.body.velocity); }
      }
      m.setFlipX(m.body.velocity.x < 0);
    });

    if(checkEnd()) return;

    const cam=scene.cameras.main;
    layers.far.tilePositionX=cam.scrollX*0.2; layers.far.tilePositionY=cam.scrollY*0.2;
    layers.mid.tilePositionX=cam.scrollX*0.5; layers.mid.tilePositionY=cam.scrollY*0.5;
    layers.near.tilePositionX=cam.scrollX*0.8; layers.near.tilePositionY=cam.scrollY*0.8;

    if(mapToggle.checked){ const w=mm.width,h=mm.height; mctx.clearRect(0,0,w,h); mctx.fillStyle='#0b0e1a'; mctx.fillRect(0,0,w,h); const sx=w/WORLD.w, sy=h/WORLD.h;
      mctx.fillStyle='#cbd1ea'; miceGroup.children.iterate(m2 => { if(!m2)return; mctx.fillRect(m2.x*sx, m2.y*sy, 2, 2); });
      mctx.fillStyle='#06d6a0'; mctx.fillRect(loki.x*sx-2, loki.y*sy-2, 4, 4);
      if(merlin){ mctx.fillStyle='#ffd166'; mctx.fillRect(merlin.x*sx-2, merlin.y*sy-2, 4, 4); }
      if(yumi){ mctx.fillStyle='#ff6b6b'; mctx.fillRect(yumi.x*sx-2, yumi.y*sy-2, 4, 4); }
      mctx.strokeStyle='#23284a'; mctx.strokeRect(cam.scrollX*sx, cam.scrollY*sy, cam.width*sx, cam.height*sy);
    }
  }

  Object.assign(window, { newGame, startGame, showMenu });

})();
