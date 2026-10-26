(() => {
  "use strict";

  const canvas = document.querySelector("#field");
  const ctx = canvas.getContext("2d");
  const $ = (selector) => document.querySelector(selector);
  const world = { width: 900, height: 560 };
  const center = { x: world.width / 2, y: world.height / 2 + 16 };
  const storageKey = "last-house-standing-save-v1";
  const upgrades = [
    { id: "house", name: "Expand the House", icon: "⌂", description: "A bigger home and a stronger main weapon.", baseCost: 35, costScale: 1.62 },
    { id: "weapon", name: "Better Weapons", icon: "✣", description: "Deal more damage with every shot.", baseCost: 24, costScale: 1.55 },
    { id: "fireRate", name: "Faster Firing", icon: "➶", description: "Shoot zombies more often.", baseCost: 32, costScale: 1.58 },
    { id: "walls", name: "Reinforced Walls", icon: "▤", description: "More home integrity and stronger repairs.", baseCost: 26, costScale: 1.5 },
    { id: "garden", name: "Garden Traps", icon: "✳", description: "Damage zombies that reach the house.", baseCost: 46, costScale: 1.7 },
    { id: "income", name: "Supply Shed", icon: "✦", description: "Earn coins even while the game is idle.", baseCost: 30, costScale: 1.6 },
    { id: "minigun", name: "Minigun Nest", icon: "⤠", description: "Unlock a rapid-fire turret; upgrades boost damage and speed.", baseCost: 90, costScale: 1.72 },
    { id: "laser", name: "Laser Array", icon: "⌁", description: "Unlock a piercing laser; upgrades boost damage and recharge speed.", baseCost: 160, costScale: 1.78 },
    { id: "rockets", name: "Rocket Silo", icon: "➤", description: "Unlock explosive rockets; upgrades boost blast damage.", baseCost: 240, costScale: 1.82 },
    { id: "lightning", name: "Storm Coil", icon: "ϟ", description: "Chain lightning jumps from its target to nearby zombies.", baseCost: 280, costScale: 1.82 },
    { id: "thorns", name: "Thorn Field", icon: "♧", description: "A thorny perimeter slows zombies near the house.", baseCost: 170, costScale: 1.72 },
    { id: "blackHole", name: "Black Hole", icon: "◉", description: "Pulls in and damages a group. Long recharge.", baseCost: 420, costScale: 1.9 },
    { id: "smoke", name: "Smoke Bomb", icon: "☁", description: "Stuns a group of zombies in a cloud of smoke.", baseCost: 330, costScale: 1.84 },
    { id: "sniper", name: "Deadeye Sniper", icon: "⌖", description: "A long-range rifle picks off a random zombie with a massive hit.", baseCost: 300, costScale: 1.82 },
    { id: "frost", name: "Cryo Projector", icon: "❄", description: "Freezes a random cluster, slowing and damaging the whole group.", baseCost: 390, costScale: 1.86 },
    { id: "flamethrower", name: "Flame Turret", icon: "♨", description: "Sets a random pack ablaze with damage-over-time flames.", baseCost: 440, costScale: 1.88 },
    { id: "drones", name: "Drone Swarm", icon: "✣", description: "Autonomous drones pepper random zombies with rapid shots.", baseCost: 520, costScale: 1.9 },
    { id: "mortar", name: "Mortar Battery", icon: "◌", description: "Lobs heavy shells into random groups for huge splash damage.", baseCost: 620, costScale: 1.94 },
    { id: "railgun", name: "Railgun", icon: "═", description: "Fires a piercing energy lance through a random target and its neighbors.", baseCost: 760, costScale: 1.98 },
    { id: "artillery", name: "Artillery Strike", icon: "✹", description: "Calls a devastating bombardment on a random patch of the field.", baseCost: 900, costScale: 2 }
  ];
  const freshSave = () => ({
    coins: 40,
    kills: 0,
    bestWave: 1,
    wave: 1,
    waveTime: 0,
    bossDefeatedWave: 0,
    houseLevel: 1,
    weapon: 0,
    fireRate: 0,
    walls: 0,
    garden: 0,
    income: 0,
    minigun: 0,
    laser: 0,
    rockets: 0,
    lightning: 0,
    thorns: 0,
    blackHole: 0,
    smoke: 0,
    sniper: 0,
    frost: 0,
    flamethrower: 0,
    drones: 0,
    mortar: 0,
    railgun: 0,
    artillery: 0,
    health: 250,
    savedAt: Date.now()
  });

  const save = loadSave();
  let zombies = [];
  let bullets = [];
  let effects = [];
  let grass = [];
  let trees = [];
  let spawnTimer = 1.5;
  let shotTimer = 0;
  let minigunTimer = 0;
  let laserTimer = 0;
  let rocketTimer = 0;
  let lightningTimer = 0;
  let blackHoleTimer = 0;
  let smokeTimer = 0;
  let sniperTimer = 0;
  let frostTimer = 0;
  let flameTimer = 0;
  let droneTimer = 0;
  let mortarTimer = 0;
  let railgunTimer = 0;
  let artilleryTimer = 0;
  let gameState = save.health > 0 ? "playing" : "defeated";
  let lastTime = 0;
  let saveTimer = 0;
  let audioContext = null;
  let masterGain = null;
  let sfxGain = null;
  let musicGain = null;
  let soundEnabled = false;
  let musicEnabled = false;
  let musicTimer = null;
  let musicStep = 0;
  let nextMusicTime = 0;
  const lastSfxTime = new Map();
  let bannerTimer;
  let upgradeRenderKey = "";
  let gameSpeed = 1;
  let bossSpawnedWave = 0;
  let killStreak = 0;
  let streakTimer = 0;
  let screenShake = 0;

  function loadSave() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return freshSave();
      const data = JSON.parse(raw);
      const initial = freshSave();
      const result = { ...initial };
      for (const key of Object.keys(initial)) {
        if (key === "savedAt") continue;
        if (Number.isFinite(Number(data[key]))) result[key] = Number(data[key]);
      }
      result.coins = Math.max(0, result.coins);
      result.houseLevel = Math.max(1, Math.floor(result.houseLevel));
      result.wave = Math.max(1, Math.floor(result.wave));
      result.bestWave = Math.max(result.wave, Math.floor(result.bestWave));
      result.health = Math.max(0, Math.min(maxHealthFor(result), result.health));
      result.savedAt = Number(data.savedAt) || Date.now();
      const offlineSeconds = Math.min(8 * 60 * 60, Math.max(0, (Date.now() - result.savedAt) / 1000));
      const offlineCoins = Math.floor(offlineSeconds * result.income * 0.12);
      if (offlineCoins > 0) {
        result.coins += offlineCoins;
        setTimeout(() => showBanner(`SUPPLY RUN RETURNED · +${offlineCoins} COINS`), 500);
      }
      result.savedAt = Date.now();
      return result;
    } catch (error) {
      console.error("Could not load the saved homestead.", error);
      return freshSave();
    }
  }

  function persist() {
    save.savedAt = Date.now();
    try {
      localStorage.setItem(storageKey, JSON.stringify(save));
    } catch (error) {
      console.error("Could not save the homestead.", error);
      showBanner("SAVE FAILED · CHECK BROWSER STORAGE");
    }
  }

  function maxHealthFor(source = save) {
    return 250 + (source.houseLevel - 1) * 45 + source.walls * 55;
  }

  function levelOf(id) {
    return id === "house" ? save.houseLevel - 1 : save[id];
  }

  function costOf(upgrade) {
    return Math.floor(upgrade.baseCost * Math.pow(upgrade.costScale, levelOf(upgrade.id)));
  }

  function damagePerShot() {
    return 9 + (save.houseLevel - 1) * 4 + save.weapon * 7;
  }

  function fireInterval() {
    return Math.max(0.22, 0.9 - save.fireRate * 0.1 - (save.houseLevel - 1) * 0.035);
  }

  function initializeField() {
    let seed = 41431;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    grass = Array.from({ length: 540 }, () => ({
      x: random() * world.width,
      y: random() * world.height,
      height: 3 + random() * 8,
      shade: Math.floor(random() * 4)
    }));
    trees = Array.from({ length: 17 }, (_, i) => {
      const angle = i / 17 * Math.PI * 2;
      const radius = 235 + random() * 75;
      return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius * 0.72, size: 0.75 + random() * 0.6 };
    });
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  function spawnZombie(forcedType) {
    const edge = Math.floor(Math.random() * 4);
    const inset = 16;
    let x;
    let y;
    if (edge === 0) { x = Math.random() * world.width; y = inset; }
    else if (edge === 1) { x = world.width - inset; y = Math.random() * world.height; }
    else if (edge === 2) { x = Math.random() * world.width; y = world.height - inset; }
    else { x = inset; y = Math.random() * world.height; }
    let type = forcedType || "walker";
    if (!forcedType && save.wave >= 3) {
      const roll = Math.random();
      if (roll < Math.min(0.13, save.wave * 0.008)) type = "runner";
      else if (roll > 0.92) type = "brute";
    }
    const baseHp = 19 + save.wave * 4 + Math.random() * save.wave * 1.4;
    const hp = type === "boss" ? baseHp * 16 : type === "brute" ? baseHp * 3.2 : type === "runner" ? baseHp * 0.7 : baseHp;
    zombies.push({
      x, y, hp, maxHp: hp,
      speed: type === "boss" ? 8 + Math.min(save.wave * 0.2, 5) : type === "brute" ? 7 + Math.min(save.wave * 0.2, 5) : type === "runner" ? 25 + Math.min(save.wave * 0.55, 12) : 12 + Math.min(save.wave * 0.35, 9) + Math.random() * 2,
      radius: type === "boss" ? 23 : type === "brute" ? 14 : type === "runner" ? 7 : 8 + Math.random() * 3,
      attackTimer: Math.random() * 0.5,
      type, tint: Math.floor(Math.random() * 3), wobble: Math.random() * Math.PI * 2,
      slowTimer: 0, stunTimer: 0, dead: false
    });
  }

  function housePosition() {
    return { x: center.x, y: center.y };
  }

  function update(dt) {
    if (gameState !== "playing") {
      screenShake = Math.max(0, screenShake - dt);
      updateEffects(dt);
      return;
    }
    save.waveTime += dt;
    if (save.waveTime >= 32) {
      save.waveTime -= 32;
      save.wave++;
      save.bestWave = Math.max(save.bestWave, save.wave);
      if (save.wave % 5 === 0) {
        showBanner(`☠ BLOOD MOON · BOSS WAVE ${save.wave}`);
        screenShake = 0.65;
      } else {
        showBanner(`WAVE ${save.wave} · THE HORDE GROWS`);
      }
      playSfx(save.wave % 5 === 0 ? "boss" : "wave");
    }
    if (save.wave % 5 === 0 && bossSpawnedWave !== save.wave && save.bossDefeatedWave !== save.wave) {
      spawnZombie("boss");
      bossSpawnedWave = save.wave;
    }
    streakTimer -= dt;
    if (streakTimer <= 0) killStreak = 0;
    screenShake = Math.max(0, screenShake - dt);

    spawnTimer -= dt;
    const spawnInterval = Math.max(0.48, 2.5 - save.wave * 0.1);
    if (spawnTimer <= 0) {
      spawnZombie();
      spawnTimer = spawnInterval * (0.72 + Math.random() * 0.56);
    }

    save.coins += save.income * 0.12 * dt;
    shotTimer -= dt;
    minigunTimer -= dt;
    laserTimer -= dt;
    rocketTimer -= dt;
    lightningTimer -= dt;
    blackHoleTimer -= dt;
    smokeTimer -= dt;
    sniperTimer -= dt;
    frostTimer -= dt;
    flameTimer -= dt;
    droneTimer -= dt;
    mortarTimer -= dt;
    railgunTimer -= dt;
    artilleryTimer -= dt;
    const target = findTarget();
    if (target && shotTimer <= 0) {
      bullets.push({ x: center.x, y: center.y - 13, target, speed: 390, damage: damagePerShot(), life: 2, weapon: "house" });
      shotTimer = fireInterval();
      playSfx("houseShot");
    }
    if (target && save.minigun > 0 && minigunTimer <= 0) {
      const minigunTarget = findRandomTarget();
      if (minigunTarget) {
        bullets.push({
          x: center.x + 22, y: center.y + 5, target: minigunTarget,
          speed: 540, damage: 3 + save.minigun * 2, life: 2, weapon: "minigun"
        });
        playSfx("minigun");
        minigunTimer = Math.max(0.075, 0.24 - save.minigun * 0.025);
      }
    }
    if (target && save.laser > 0 && laserTimer <= 0) {
      const laserTarget = findRandomTarget();
      if (laserTarget) {
        const laserDamage = 17 + save.laser * 12;
        const beamX = center.x - 20;
        const beamY = center.y - 10;
        const beamDx = laserTarget.x - beamX;
        const beamDy = laserTarget.y - beamY;
        const beamLength = beamDx * beamDx + beamDy * beamDy;
        for (const zombie of zombies) {
          if (zombie.dead) continue;
          const projection = Math.max(0, Math.min(1, ((zombie.x - beamX) * beamDx + (zombie.y - beamY) * beamDy) / beamLength));
          const closestX = beamX + projection * beamDx;
          const closestY = beamY + projection * beamDy;
          if (Math.hypot(zombie.x - closestX, zombie.y - closestY) <= zombie.radius + 7) {
            damageZombie(zombie, laserDamage);
          }
        }
        effects.push({
          type: "beam", x1: beamX, y1: beamY, x2: laserTarget.x, y2: laserTarget.y,
          color: "#71eaff", life: 0.16, maxLife: 0.16
        });
        laserTimer = Math.max(0.38, 1.35 - save.laser * 0.12);
        playSfx("laser");
      }
    }
    if (target && save.rockets > 0 && rocketTimer <= 0) {
      const rocketTarget = findRandomTarget();
      if (rocketTarget) {
        bullets.push({
          x: center.x, y: center.y - 24, target: rocketTarget,
          speed: 240, damage: 15 + save.rockets * 12, life: 3,
          weapon: "rocket", blastRadius: 52 + save.rockets * 3
        });
        rocketTimer = Math.max(0.65, 2.1 - save.rockets * 0.13);
        playSfx("rocket");
      }
    }
    if (target && save.lightning > 0 && lightningTimer <= 0) {
      const lightningTarget = findRandomTarget();
      if (lightningTarget) {
        bullets.push({
          x: center.x + 8, y: center.y - 12, target: lightningTarget,
          speed: 470, damage: 15 + save.lightning * 8,
          chainCount: 2 + save.lightning, chainRange: 92 + save.lightning * 12,
          life: 2, weapon: "lightning"
        });
        lightningTimer = Math.max(0.55, 1.8 - save.lightning * 0.13);
        playSfx("electric");
      }
    }
    if (save.blackHole > 0 && blackHoleTimer <= 0 && zombies.length >= 2) {
      const target = findRandomTarget();
      if (target) {
        const radius = 115 + save.blackHole * 8;
        effects.push({
          type: "blackHole", x: target.x, y: target.y, radius,
          level: save.blackHole, life: 2.3, maxLife: 2.3, pulse: 0
        });
        blackHoleTimer = Math.max(7, 15 - save.blackHole * 0.65);
        playSfx("blackHole");
      }
    }
    if (save.smoke > 0 && smokeTimer <= 0 && zombies.length > 0) {
      const target = findRandomTarget();
      if (target) {
        const radius = 105 + save.smoke * 8;
        let stunned = 0;
        for (const zombie of zombies) {
          if (zombie.dead || Math.hypot(zombie.x - target.x, zombie.y - target.y) > radius) continue;
          zombie.stunTimer = Math.max(zombie.stunTimer, 1.5 + save.smoke * 0.35);
          stunned++;
        }
        effects.push({ type: "smoke", x: target.x, y: target.y, radius, life: 1.8, maxLife: 1.8 });
        smokeTimer = Math.max(4.5, 9 - save.smoke * 0.35);
        if (stunned) playSfx("smoke");
      }
    }
    if (target && save.sniper > 0 && sniperTimer <= 0) {
      const shotTarget = findRandomTarget();
      if (shotTarget) {
        bullets.push({
          x: center.x, y: center.y - 22, target: shotTarget, speed: 780,
          damage: 42 + save.sniper * 26, life: 2, weapon: "sniper"
        });
        playSfx("sniper");
        sniperTimer = Math.max(0.65, 2.8 - save.sniper * 0.18);
      }
    }
    if (target && save.frost > 0 && frostTimer <= 0) {
      const frostTarget = findRandomTarget();
      if (frostTarget) {
        const radius = 82 + save.frost * 9;
        for (const zombie of zombies) {
          if (zombie.dead || Math.hypot(zombie.x - frostTarget.x, zombie.y - frostTarget.y) > radius) continue;
          zombie.hp -= 8 + save.frost * 5;
          zombie.slowTimer = Math.max(zombie.slowTimer, 2.2 + save.frost * 0.35);
          if (zombie.hp <= 0) killZombie(zombie);
        }
        effects.push({ type: "frost", x: frostTarget.x, y: frostTarget.y, radius, life: 0.55, maxLife: 0.55 });
        playSfx("frost");
        frostTimer = Math.max(1.1, 3.6 - save.frost * 0.2);
      }
    }
    if (target && save.flamethrower > 0 && flameTimer <= 0) {
      const flameTarget = findRandomTarget();
      if (flameTarget) {
        const radius = 73 + save.flamethrower * 7;
        for (const zombie of zombies) {
          if (zombie.dead || Math.hypot(zombie.x - flameTarget.x, zombie.y - flameTarget.y) > radius) continue;
          zombie.burnTimer = Math.max(zombie.burnTimer || 0, 2.5 + save.flamethrower * 0.35);
        }
        effects.push({ type: "flame", x: flameTarget.x, y: flameTarget.y, radius, life: 0.7, maxLife: 0.7 });
        playSfx("flame");
        flameTimer = Math.max(0.8, 2.5 - save.flamethrower * 0.14);
      }
    }
    if (target && save.drones > 0 && droneTimer <= 0) {
      const droneTarget = findRandomTarget();
      if (droneTarget) {
        bullets.push({
          x: center.x + (Math.random() - 0.5) * 70,
          y: center.y - 45 - Math.random() * 35, target: droneTarget,
          speed: 500, damage: 8 + save.drones * 5, life: 2, weapon: "drone"
        });
        playSfx("drone");
        droneTimer = Math.max(0.16, 0.62 - save.drones * 0.035);
      }
    }
    if (target && save.mortar > 0 && mortarTimer <= 0) {
      const mortarTarget = findRandomTarget();
      if (mortarTarget) {
        bullets.push({
          x: center.x - 25, y: center.y - 30, target: mortarTarget,
          speed: 145, damage: 45 + save.mortar * 28, life: 4,
          weapon: "mortar", blastRadius: 76 + save.mortar * 8
        });
        playSfx("mortar");
        mortarTimer = Math.max(1.8, 5.4 - save.mortar * 0.28);
      }
    }
    if (target && save.railgun > 0 && railgunTimer <= 0) {
      const railTarget = findRandomTarget();
      if (railTarget) {
        const start = { x: center.x + 12, y: center.y - 28 };
        const dx = railTarget.x - start.x;
        const dy = railTarget.y - start.y;
        const lengthSquared = dx * dx + dy * dy;
        for (const zombie of zombies) {
          if (zombie.dead) continue;
          const projection = Math.max(0, Math.min(1, ((zombie.x - start.x) * dx + (zombie.y - start.y) * dy) / lengthSquared));
          const nearestX = start.x + projection * dx;
          const nearestY = start.y + projection * dy;
          if (Math.hypot(zombie.x - nearestX, zombie.y - nearestY) < zombie.radius + 5) {
            damageZombie(zombie, 52 + save.railgun * 32);
          }
        }
        effects.push({ type: "beam", x1: start.x, y1: start.y, x2: railTarget.x, y2: railTarget.y, color: "#d6a4ff", life: 0.25, maxLife: 0.25 });
        playSfx("railgun");
        railgunTimer = Math.max(1.1, 3.8 - save.railgun * 0.2);
      }
    }
    if (target && save.artillery > 0 && artilleryTimer <= 0) {
      const strikeTarget = findRandomTarget();
      if (strikeTarget) {
        const radius = 105 + save.artillery * 10;
        for (const zombie of zombies) {
          if (zombie.dead) continue;
          const distance = Math.hypot(zombie.x - strikeTarget.x, zombie.y - strikeTarget.y);
          if (distance <= radius) {
            damageZombie(zombie, Math.max(20, (75 + save.artillery * 42) * (1 - distance / (radius * 1.25))));
          }
        }
        effects.push({ type: "blast", x: strikeTarget.x, y: strikeTarget.y, radius, color: "#ffe17b", life: 0.55, maxLife: 0.55 });
        screenShake = Math.max(screenShake, 0.28);
        playSfx("artillery");
        artilleryTimer = Math.max(3.2, 9 - save.artillery * 0.4);
      }
    }

    for (const zombie of zombies) {
      if (zombie.burnTimer > 0) {
        zombie.burnTimer = Math.max(0, zombie.burnTimer - dt);
        damageZombie(zombie, (5 + save.flamethrower * 2) * dt);
        if (zombie.dead) continue;
      }
      zombie.slowTimer = Math.max(0, zombie.slowTimer - dt);
      zombie.stunTimer = Math.max(0, zombie.stunTimer - dt);
      const dx = center.x - zombie.x;
      const dy = center.y - zombie.y;
      const distance = Math.hypot(dx, dy);
      const houseRadius = 48 + (save.houseLevel - 1) * 2;
      const thornRadius = 160 + save.thorns * 10;
      if (save.thorns > 0 && distance < thornRadius) zombie.slowTimer = Math.max(zombie.slowTimer, 0.15);
      if (zombie.stunTimer > 0) {
        zombie.wobble += dt * 2;
      } else if (distance > houseRadius + zombie.radius) {
        const speedFactor = zombie.slowTimer > 0 ? Math.max(0.35, 0.65 - save.thorns * 0.04) : 1;
        zombie.x += dx / distance * zombie.speed * speedFactor * dt;
        zombie.y += dy / distance * zombie.speed * speedFactor * dt;
      } else {
        zombie.attackTimer -= dt;
        if (zombie.attackTimer <= 0) {
          save.health -= Math.max(2, 4 + save.wave * 0.3 - save.walls * 0.45);
          zombie.attackTimer = 0.8;
          effects.push({ x: center.x + (Math.random() - 0.5) * 65, y: center.y + (Math.random() - 0.5) * 48, text: "-HP", color: "#f29a82", life: 0.75, maxLife: 0.75 });
        }
        if (save.garden > 0) {
          zombie.hp -= (save.garden * 2.2 + save.houseLevel) * dt;
          if (zombie.hp <= 0) killZombie(zombie);
        }
      }
      zombie.wobble += dt * 5;
    }

    for (const bullet of bullets) {
      if (bullet.dead) continue;
      bullet.life -= dt;
      if (!bullet.target || bullet.target.dead || bullet.life <= 0) {
        bullet.dead = true;
        continue;
      }
      const dx = bullet.target.x - bullet.x;
      const dy = bullet.target.y - bullet.y;
      const distance = Math.hypot(dx, dy);
      if (bullet.weapon === "rocket" || bullet.weapon === "mortar") {
        if (distance < bullet.speed * dt + bullet.target.radius) {
          bullet.dead = true;
          detonateRocket(bullet);
        } else {
          bullet.x += dx / distance * bullet.speed * dt;
          bullet.y += dy / distance * bullet.speed * dt;
        }
        continue;
      }
      if (bullet.weapon === "lightning") {
        if (distance < bullet.speed * dt + bullet.target.radius) {
          bullet.dead = true;
          chainLightning(bullet);
        } else {
          bullet.x += dx / distance * bullet.speed * dt;
          bullet.y += dy / distance * bullet.speed * dt;
        }
        continue;
      }
      if (distance < bullet.speed * dt + bullet.target.radius) {
        bullet.dead = true;
        damageZombie(bullet.target, bullet.damage);
        if (bullet.weapon === "house") playSfx("hit");
        effects.push({
          x: bullet.target.x, y: bullet.target.y - 8,
          text: `-${Math.round(bullet.damage)}`,
          color: bullet.weapon === "minigun" ? "#ffd278" : "#f2da9e",
          life: 0.55, maxLife: 0.55
        });
      } else {
        bullet.x += dx / distance * bullet.speed * dt;
        bullet.y += dy / distance * bullet.speed * dt;
      }
    }

    if (save.health <= 0) {
      save.health = 0;
      gameState = "defeated";
      screenShake = 0.8;
      zombies = [];
      bullets = [];
      $("#defeat-overlay").hidden = false;
      showBanner("THE HOUSE HAS FALLEN");
      playSfx("defeat");
    }

    zombies = zombies.filter((zombie) => !zombie.dead);
    bullets = bullets.filter((bullet) => !bullet.dead);
    updateEffects(dt);
    saveTimer += dt;
    if (saveTimer >= 5) {
      saveTimer = 0;
      persist();
    }
    refreshUI();
  }

  function findTarget() {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const zombie of zombies) {
      if (zombie.dead) continue;
      const distance = Math.hypot(zombie.x - center.x, zombie.y - center.y);
      if (distance < nearestDistance) {
        nearest = zombie;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function findRandomTarget() {
    const livingZombies = zombies.filter((zombie) => !zombie.dead);
    if (livingZombies.length === 0) return null;
    return livingZombies[Math.floor(Math.random() * livingZombies.length)];
  }

  function killZombie(zombie) {
    if (zombie.dead) return;
    zombie.dead = true;
    save.kills++;
    const reward = (3 + Math.floor(save.wave / 2)) * (zombie.type === "boss" ? 18 : zombie.type === "brute" ? 4 : zombie.type === "runner" ? 2 : 1);
    save.coins += reward;
    killStreak++;
    streakTimer = 3.2;
    if (killStreak > 0 && killStreak % 5 === 0) {
      const bonus = 10 + Math.floor(save.wave / 2) * 2;
      save.coins += bonus;
      showBanner(`✦ ${killStreak} KILL STREAK · +${bonus} BONUS`);
      playSfx("streak");
    }
    if (zombie.type === "boss") {
      save.bossDefeatedWave = save.wave;
      showBanner(`BOSS DOWN · +${reward} COINS`);
      screenShake = 0.5;
      playSfx("bossKill");
    }
    for (let i = 0; i < (zombie.type === "boss" ? 32 : 9); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 54;
      effects.push({ x: zombie.x, y: zombie.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color: ["#b5c771", "#dd9878", "#b58a76"][zombie.tint], life: 0.4 + Math.random() * 0.45, maxLife: 0.8, size: 1.5 + Math.random() * 2 });
    }
    if (zombie.type !== "boss") playSfx("kill");
  }

  function damageZombie(zombie, damage) {
    if (zombie.dead) return;
    zombie.hp -= damage;
    if (zombie.hp <= 0) killZombie(zombie);
  }

  function detonateRocket(rocket) {
    const x = rocket.target.x;
    const y = rocket.target.y;
    const radius = rocket.blastRadius;
    for (const zombie of zombies) {
      if (zombie.dead) continue;
      const distance = Math.hypot(zombie.x - x, zombie.y - y);
      if (distance <= radius) {
        const damageScale = 1 - distance / (radius * 1.5);
        damageZombie(zombie, Math.max(rocket.damage * 0.35, rocket.damage * damageScale));
      }
    }
    effects.push({
      type: "blast", x, y, radius,
      color: rocket.weapon === "mortar" ? "#f3d982" : "#ffad58",
      life: 0.3, maxLife: 0.3
    });
    playSfx(rocket.weapon === "mortar" ? "explosion" : "rocketImpact");
  }

  function chainLightning(projectile) {
    let current = projectile.target;
    const chained = new Set();
    const segments = [];
    for (let i = 0; i < projectile.chainCount && current; i++) {
      chained.add(current);
      segments.push({ x: current.x, y: current.y });
      damageZombie(current, projectile.damage);
      let nearest = null;
      let nearestDistance = projectile.chainRange;
      for (const candidate of zombies) {
        if (candidate.dead || chained.has(candidate)) continue;
        const distance = Math.hypot(candidate.x - current.x, candidate.y - current.y);
        if (distance < nearestDistance) {
          nearest = candidate;
          nearestDistance = distance;
        }
      }
      current = nearest;
    }
    effects.push({
      type: "lightning", x1: projectile.target.x, y1: projectile.target.y, segments,
      color: "#a9f6ff", life: 0.24, maxLife: 0.24
    });
    playSfx("electric");
  }

  function updateBlackHole(effect, dt) {
    effect.pulse += dt;
    if (effect.pulse < 0.25) return;
    effect.pulse = 0;
    for (const zombie of zombies) {
      if (zombie.dead) continue;
      const dx = effect.x - zombie.x;
      const dy = effect.y - zombie.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= effect.radius) continue;
      const pull = Math.min(26, 7 + (effect.radius - distance) * 0.12) * dt;
      if (distance > 2) {
        zombie.x += dx / distance * pull;
        zombie.y += dy / distance * pull;
      }
      damageZombie(zombie, 3 + effect.level * 2);
    }
  }

  function updateEffects(dt) {
    for (const effect of effects) {
      if (effect.type === "blackHole") updateBlackHole(effect, dt);
      effect.life -= dt;
      if (effect.vx !== undefined) {
        effect.x += effect.vx * dt;
        effect.y += effect.vy * dt;
      } else if (effect.text) {
        effect.y -= 19 * dt;
      }
    }
    effects = effects.filter((effect) => effect.life > 0);
  }

  function drawField() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#31462d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / world.width, canvas.height / world.height);
    const offsetX = (canvas.width - world.width * scale) / 2;
    const offsetY = (canvas.height - world.height * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    if (screenShake > 0) {
      const shake = screenShake * 7;
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    const grassGradient = ctx.createLinearGradient(0, 0, 0, world.height);
    grassGradient.addColorStop(0, "#4f7440");
    grassGradient.addColorStop(0.5, "#597f43");
    grassGradient.addColorStop(1, "#43653a");
    ctx.fillStyle = grassGradient;
    ctx.fillRect(0, 0, world.width, world.height);

    for (let i = 0; i < 38; i++) {
      const x = i * 27 + (i % 3) * 5;
      const y = (i * 89) % world.height;
      ctx.fillStyle = i % 2 ? "rgba(193, 212, 123, .055)" : "rgba(23, 48, 29, .055)";
      ctx.beginPath();
      ctx.ellipse(x, y, 34, 14, -0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const blade of grass) {
      ctx.strokeStyle = ["rgba(201,218,126,.26)", "rgba(39,67,34,.29)", "rgba(166,195,100,.2)", "rgba(28,57,34,.22)"][blade.shade];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(blade.x, blade.y);
      ctx.lineTo(blade.x + 2, blade.y - blade.height);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(220, 230, 167, .045)";
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, 155, 116, 0, 0, Math.PI * 2);
    ctx.fill();
    drawThornField();
    for (const tree of trees) drawTree(tree);
    drawAtmosphere();
    drawHouse();
    drawDefenseNodes();
    for (const zombie of zombies) drawZombie(zombie);
    for (const bullet of bullets) drawBullet(bullet);
    drawEffects();
  }

  function drawAtmosphere() {
    const elapsed = ((save.wave - 1) * 32 + save.waveTime) % 90;
    const bloodMoon = save.wave % 5 === 0;
    const dusk = !bloodMoon && elapsed >= 48 && elapsed < 66;
    const night = !bloodMoon && elapsed >= 66;
    const darkness = bloodMoon ? 0.3 : night ? 0.37 : dusk ? 0.14 : 0;
    if (darkness) {
      ctx.fillStyle = bloodMoon
        ? `rgba(63, 13, 24, ${darkness})`
        : `rgba(10, 16, 31, ${darkness})`;
      ctx.fillRect(0, 0, world.width, world.height);
    }
    if (night || bloodMoon) {
      const moonX = 93;
      const moonY = 74;
      ctx.save();
      ctx.shadowColor = bloodMoon ? "#ff4b53" : "#d9e4bc";
      ctx.shadowBlur = bloodMoon ? 26 : 18;
      ctx.fillStyle = bloodMoon ? "#d94a4e" : "#d5dfb2";
      ctx.beginPath();
      ctx.arc(moonX, moonY, bloodMoon ? 18 : 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      for (let i = 0; i < 24; i++) {
        const x = (i * 137 + 31) % world.width;
        const y = (i * 71 + 18) % 180;
        ctx.fillStyle = `rgba(238, 241, 210, ${0.25 + (i % 3) * 0.12})`;
        ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
      }
    } else if (dusk) {
      const sky = ctx.createRadialGradient(82, 75, 3, 82, 75, 88);
      sky.addColorStop(0, "rgba(255, 190, 110, .48)");
      sky.addColorStop(1, "rgba(255, 151, 74, 0)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, world.width, 220);
    }
    const lamp = ctx.createRadialGradient(center.x, center.y, 15, center.x, center.y, 205);
    lamp.addColorStop(0, bloodMoon ? "rgba(255, 86, 66, .17)" : "rgba(255, 221, 142, .13)");
    lamp.addColorStop(1, "rgba(255, 221, 142, 0)");
    ctx.fillStyle = lamp;
    ctx.fillRect(center.x - 205, center.y - 205, 410, 410);
  }

  function drawTree(tree) {
    ctx.save();
    ctx.translate(tree.x, tree.y);
    ctx.scale(tree.size, tree.size);
    ctx.fillStyle = "rgba(27, 39, 22, .26)";
    ctx.beginPath(); ctx.ellipse(4, 6, 21, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#574733";
    ctx.fillRect(-3, -19, 6, 21);
    ctx.fillStyle = "#35563a";
    ctx.beginPath(); ctx.arc(0, -25, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#527343";
    ctx.beginPath(); ctx.arc(-7, -30, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(173, 196, 112, .27)";
    ctx.beginPath(); ctx.arc(-9, -35, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawThornField() {
    if (save.thorns <= 0) return;
    const radius = 160 + save.thorns * 10;
    ctx.save();
    ctx.strokeStyle = "rgba(175, 217, 112, .55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 8]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = "#b8d779";
      ctx.beginPath();
      ctx.moveTo(-4, 0); ctx.lineTo(0, -8); ctx.lineTo(4, 0); ctx.lineTo(0, -2); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawHouse() {
    const x = center.x;
    const y = center.y;
    const level = save.houseLevel;
    const width = 74 + Math.min(level - 1, 7) * 3;
    const height = 50 + Math.min(level - 1, 7) * 2;
    ctx.save();
    ctx.fillStyle = "rgba(20, 32, 22, .36)";
    ctx.beginPath(); ctx.ellipse(x + 3, y + height * 0.46, width * 0.9, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4a3e30";
    ctx.fillRect(x - width * 0.48, y - height * 0.15, width * 0.96, height * 0.62);
    ctx.fillStyle = level > 3 ? "#d7c99e" : "#c6b58b";
    ctx.fillRect(x - width * 0.46, y - height * 0.17, width * 0.92, height * 0.56);
    ctx.fillStyle = level > 2 ? "#694640" : "#61463f";
    ctx.beginPath();
    ctx.moveTo(x - width * 0.6, y - height * 0.12);
    ctx.lineTo(x, y - height * 0.72);
    ctx.lineTo(x + width * 0.6, y - height * 0.12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = level > 4 ? "#827b5e" : "#746b51";
    ctx.beginPath();
    ctx.moveTo(x - width * 0.48, y - height * 0.17);
    ctx.lineTo(x, y - height * 0.64);
    ctx.lineTo(x + width * 0.48, y - height * 0.17);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#374f3a";
    ctx.fillRect(x - width * 0.36, y - height * 0.02, width * 0.21, height * 0.21);
    ctx.fillRect(x + width * 0.15, y - height * 0.02, width * 0.21, height * 0.21);
    ctx.fillStyle = "#71563a";
    ctx.fillRect(x - width * 0.09, y + height * 0.08, width * 0.18, height * 0.31);
    ctx.fillStyle = "#e6d89f";
    ctx.beginPath(); ctx.arc(x + width * 0.045, y + height * 0.24, 1.6, 0, Math.PI * 2); ctx.fill();
    if (level > 1) {
      ctx.fillStyle = "#777864";
      ctx.fillRect(x - width * 0.49, y + height * 0.3, width * 0.98, 4);
      for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * width * 0.18, y + height * 0.27, 2, height * 0.19);
    }
    if (level > 3) {
      ctx.fillStyle = "#5b5745";
      ctx.fillRect(x + width * 0.27, y - height * 0.52, 8, height * 0.3);
      ctx.fillStyle = "#555";
      ctx.fillRect(x + width * 0.29, y - height * 0.64, 5, height * 0.13);
    }
    ctx.strokeStyle = "rgba(238, 215, 151, .32)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y - 2, width * 0.68, height * 0.68, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.restore();
  }

  function drawDefenseNodes() {
    const systems = [
      { level: save.minigun, color: "#ffd278", icon: "✣" },
      { level: save.laser, color: "#75e6e4", icon: "⌁" },
      { level: save.rockets, color: "#ff9860", icon: "➤" },
      { level: save.lightning, color: "#a9d9ff", icon: "ϟ" },
      { level: save.blackHole, color: "#c59bff", icon: "◉" },
      { level: save.smoke, color: "#cbd6ce", icon: "☁" },
      { level: save.sniper, color: "#e8e6d3", icon: "⌖" },
      { level: save.frost, color: "#9beaff", icon: "❄" },
      { level: save.flamethrower, color: "#ff994e", icon: "♨" },
      { level: save.drones, color: "#d4e781", icon: "✣" },
      { level: save.mortar, color: "#e6c77c", icon: "◌" },
      { level: save.railgun, color: "#d6a4ff", icon: "═" },
      { level: save.artillery, color: "#ffe17b", icon: "✹" }
    ];
    const installed = systems.filter((system) => system.level > 0);
    installed.forEach((system, index) => {
      const angle = index / installed.length * Math.PI * 2 - Math.PI / 2;
      const x = center.x + Math.cos(angle) * 57;
      const y = center.y + Math.sin(angle) * 42 - 8;
      ctx.save();
      ctx.shadowColor = system.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#273126";
      ctx.strokeStyle = system.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = system.color;
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(system.icon, x, y + 0.5);
      ctx.restore();
    });
  }

  function drawZombie(zombie) {
    ctx.save();
    ctx.translate(zombie.x, zombie.y);
    ctx.rotate(Math.atan2(center.y - zombie.y, center.x - zombie.x) + Math.PI / 2);
    const bob = Math.sin(zombie.wobble) * 1.5;
    if (zombie.type === "boss") {
      ctx.shadowColor = "#fb4b55";
      ctx.shadowBlur = 20;
      ctx.strokeStyle = "rgba(255, 92, 87, .8)";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, zombie.radius + 6 + Math.sin(zombie.wobble * 0.5) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = "rgba(22, 30, 20, .28)";
    ctx.beginPath(); ctx.ellipse(1, zombie.radius * 0.75, zombie.radius * 0.9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = zombie.type === "boss" ? "#c4514e" : zombie.type === "brute" ? "#bf7d69" : zombie.type === "runner" ? "#b9d07b" : ["#899461", "#a88969", "#73875d"][zombie.tint];
    ctx.lineWidth = zombie.type === "boss" ? 6 : zombie.type === "brute" ? 4 : 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-4, 2 + bob); ctx.lineTo(-8, 8 + bob);
    ctx.moveTo(4, 2 + bob); ctx.lineTo(8, 8 + bob);
    ctx.moveTo(-4, -3 + bob); ctx.lineTo(-9, 0 + bob);
    ctx.moveTo(4, -3 + bob); ctx.lineTo(9, 0 + bob);
    ctx.stroke();
    ctx.fillStyle = zombie.type === "boss" ? "#75403e" : zombie.type === "brute" ? "#877052" : zombie.type === "runner" ? "#9aa85c" : ["#83915b", "#a28264", "#718461"][zombie.tint];
    ctx.beginPath(); ctx.ellipse(0, bob, zombie.radius * 0.72, zombie.radius, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = zombie.type === "boss" ? "#aa5550" : zombie.type === "brute" ? "#b59a6c" : zombie.tint === 1 ? "#d1b08a" : "#aab77b";
    ctx.beginPath(); ctx.arc(0, -zombie.radius * 0.68 + bob, zombie.radius * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#dcdeba";
    ctx.beginPath(); ctx.arc(-3, -zombie.radius * 0.76 + bob, 1.4, 0, Math.PI * 2); ctx.arc(3, -zombie.radius * 0.76 + bob, 1.4, 0, Math.PI * 2); ctx.fill();
    if (zombie.stunTimer > 0) {
      ctx.fillStyle = "#edf1b0";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("✦", 0, -zombie.radius * 1.5 + bob);
    }
    if (zombie.slowTimer > 0) {
      ctx.strokeStyle = "rgba(190, 225, 126, .8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, zombie.radius + 3, 0, Math.PI * 2); ctx.stroke();
    }
    if (zombie.burnTimer > 0) {
      ctx.fillStyle = "#ffb34d";
      ctx.shadowColor = "#ff5e2d";
      ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.arc(0, -zombie.radius * 1.4 + bob, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (zombie.type === "boss") {
      ctx.fillStyle = "#f1c66b";
      ctx.beginPath();
      ctx.moveTo(-zombie.radius * 0.65, -zombie.radius * 1.3);
      ctx.lineTo(-zombie.radius * 0.8, -zombie.radius * 1.9);
      ctx.lineTo(-zombie.radius * 0.25, -zombie.radius * 1.55);
      ctx.lineTo(0, -zombie.radius * 2);
      ctx.lineTo(zombie.radius * 0.27, -zombie.radius * 1.55);
      ctx.lineTo(zombie.radius * 0.8, -zombie.radius * 1.9);
      ctx.lineTo(zombie.radius * 0.65, -zombie.radius * 1.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    if (zombie.hp < zombie.maxHp) {
      const width = zombie.radius * 2;
      ctx.fillStyle = "rgba(28, 31, 25, .8)";
      ctx.fillRect(zombie.x - width / 2, zombie.y - zombie.radius - 7, width, 3);
      ctx.fillStyle = "#d7d77a";
      ctx.fillRect(zombie.x - width / 2, zombie.y - zombie.radius - 7, width * Math.max(0, zombie.hp / zombie.maxHp), 3);
    }
  }

  function drawBullet(bullet) {
    ctx.save();
    const rocket = bullet.weapon === "rocket" || bullet.weapon === "mortar";
    const color = bullet.weapon === "mortar" ? "#f3d982" : bullet.weapon === "rocket" ? "#ff9b54" :
      bullet.weapon === "minigun" ? "#ffd278" : bullet.weapon === "lightning" ? "#a9f6ff" :
        bullet.weapon === "sniper" ? "#f4edcf" : bullet.weapon === "drone" ? "#d4e781" : "#ffe294";
    ctx.shadowColor = color;
    ctx.shadowBlur = rocket ? 12 : 9;
    ctx.fillStyle = color;
    if (rocket) {
      ctx.translate(bullet.x, bullet.y);
      ctx.rotate(Math.atan2(bullet.target.y - bullet.y, bullet.target.x - bullet.x));
      if (bullet.weapon === "mortar") {
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff2c4";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-4, 0); ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.fillRect(-7, -3, 14, 6);
      ctx.beginPath(); ctx.moveTo(7, -4); ctx.lineTo(12, 0); ctx.lineTo(7, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffe2a0";
      ctx.fillRect(-9, -1.5, 3, 3);
      ctx.restore();
      return;
    }
    ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawEffects() {
    for (const effect of effects) {
      const alpha = Math.max(0, effect.life / effect.maxLife);
      ctx.globalAlpha = alpha;
      if (effect.type === "lightning") {
        ctx.save();
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = effect.color;
        ctx.shadowBlur = 12;
        let previous = { x: effect.x1, y: effect.y1 };
        for (const segment of effect.segments) {
          let x = previous.x;
          let y = previous.y;
          const steps = Math.max(2, Math.ceil(Math.hypot(segment.x - x, segment.y - y) / 25));
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let i = 1; i < steps; i++) {
            const t = i / steps;
            x = previous.x + (segment.x - previous.x) * t + (Math.random() - 0.5) * 14;
            y = previous.y + (segment.y - previous.y) * t + (Math.random() - 0.5) * 14;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(segment.x, segment.y);
          ctx.stroke();
          ctx.beginPath(); ctx.arc(segment.x, segment.y, 5, 0, Math.PI * 2); ctx.stroke();
          previous = segment;
        }
        ctx.restore();
      } else if (effect.type === "blackHole") {
        const pulse = 0.85 + Math.sin((effect.maxLife - effect.life) * 12) * 0.1;
        ctx.save();
        ctx.fillStyle = "rgba(21, 10, 38, .22)";
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#8c66d2";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#744ac5";
        ctx.shadowBlur = 19;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, 20 * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "rgba(193, 159, 255, .75)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(effect.x, effect.y, 30 * pulse, 11 * pulse, 0.5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      } else if (effect.type === "smoke") {
        ctx.save();
        ctx.fillStyle = `rgba(172, 182, 179, ${0.24 * alpha})`;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (1.15 - alpha * 0.15), 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 7; i++) {
          const angle = i / 7 * Math.PI * 2 + (effect.maxLife - effect.life) * 0.4;
          const radius = effect.radius * (0.3 + (i % 3) * 0.14);
          ctx.fillStyle = `rgba(207, 213, 199, ${0.12 * alpha})`;
          ctx.beginPath();
          ctx.arc(effect.x + Math.cos(angle) * radius, effect.y + Math.sin(angle) * radius, 17 + i % 4 * 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (effect.type === "beam") {
        ctx.save();
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 5 * alpha + 1;
        ctx.shadowColor = effect.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.moveTo(effect.x1, effect.y1);
        ctx.lineTo(effect.x2, effect.y2);
        ctx.stroke();
        ctx.restore();
      } else if (effect.type === "blast") {
        ctx.strokeStyle = effect.color || "#ffad58";
        ctx.lineWidth = 5 * alpha;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius * (1 - alpha + 0.2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (effect.type === "frost") {
        ctx.save();
        ctx.strokeStyle = `rgba(156, 233, 255, ${0.8 * alpha})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = "#86e4ff";
        ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (1.1 - alpha * 0.1), 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const angle = i / 6 * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(effect.x, effect.y);
          ctx.lineTo(effect.x + Math.cos(angle) * effect.radius * 0.8, effect.y + Math.sin(angle) * effect.radius * 0.8);
          ctx.stroke();
        }
        ctx.restore();
      } else if (effect.type === "flame") {
        ctx.save();
        ctx.fillStyle = `rgba(255, 83, 31, ${0.15 * alpha})`;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 11; i++) {
          const angle = i / 11 * Math.PI * 2 + (effect.maxLife - effect.life) * 2;
          const distance = effect.radius * (0.3 + (i % 3) * 0.17);
          const x = effect.x + Math.cos(angle) * distance;
          const y = effect.y + Math.sin(angle) * distance;
          ctx.fillStyle = i % 2 ? `rgba(255, 170, 57, ${0.7 * alpha})` : `rgba(255, 83, 31, ${0.8 * alpha})`;
          ctx.beginPath(); ctx.ellipse(x, y, 4, 9 + (i % 3) * 2, angle, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      } else if (effect.text) {
        ctx.fillStyle = effect.color;
        ctx.font = "10px 'DM Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(effect.text, effect.x, effect.y);
      } else {
        ctx.fillStyle = effect.color;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.size || 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function refreshUI() {
    $("#wave").textContent = save.wave;
    $("#kills").textContent = save.kills.toLocaleString();
    $("#coins").textContent = Math.floor(save.coins).toLocaleString();
    $("#health").textContent = Math.ceil(save.health).toLocaleString();
    $("#max-health").textContent = maxHealthFor().toLocaleString();
    $("#best-wave").textContent = `BEST WAVE ${save.bestWave}`;
    $("#house-level").textContent = save.houseLevel;
    $("#wave-progress").style.width = `${Math.min(100, save.waveTime / 32 * 100)}%`;
    $("#wave-countdown").textContent = `NEXT WAVE IN ${Math.ceil(32 - save.waveTime)}s`;
    const weather = $("#weather-status");
    const elapsed = ((save.wave - 1) * 32 + save.waveTime) % 90;
    const isBloodMoon = save.wave % 5 === 0;
    const phase = isBloodMoon ? "bloodmoon" : elapsed >= 66 ? "night" : elapsed >= 48 ? "dusk" : "day";
    const labels = { bloodmoon: "BLOOD MOON", night: "MOONLIT NIGHT", dusk: "DUSK FALLING", day: "CLEAR SKIES" };
    weather.className = `weather-status ${phase}`;
    weather.querySelector("span").textContent = labels[phase];
    const streak = $("#kill-streak");
    streak.hidden = killStreak < 2 || streakTimer <= 0;
    $("#streak-count").textContent = killStreak;
    $("#speed-toggle").textContent = `${gameSpeed}×`;
    $("#speed-toggle").setAttribute("aria-label", `Set game speed to ${gameSpeed === 1 ? "double" : "normal"}`);
    $("#speed-toggle").title = `Game speed: ${gameSpeed}× (click to toggle)`;
    $("#threat-status").lastChild.textContent = isBloodMoon
      ? ` BLOOD MOON · BOSS WAVE ${save.wave}`
      : " THREATS APPROACH FROM ALL SIDES";
    const bars = $("#level-bars");
    bars.replaceChildren();
    const visibleLevel = Math.min(8, save.houseLevel);
    for (let i = 0; i < 8; i++) {
      const bar = document.createElement("i");
      if (i < visibleLevel) bar.className = "active";
      bars.append(bar);
    }
    drawUpgradeCards();
  }

  function drawUpgradeCards() {
    const renderKey = `${gameState}|${upgrades.map((upgrade) => `${levelOf(upgrade.id)}:${costOf(upgrade)}:${save.coins >= costOf(upgrade)}`).join("|")}`;
    if (renderKey === upgradeRenderKey) return;
    upgradeRenderKey = renderKey;
    const list = $("#upgrade-list");
    list.replaceChildren();
    for (const upgrade of upgrades) {
      if (upgrade.id === "minigun" || upgrade.id === "lightning" || upgrade.id === "sniper") {
        const heading = document.createElement("div");
        heading.className = `upgrade-section-label${upgrade.id === "lightning" ? " control-label" : upgrade.id === "sniper" ? " elite-label" : ""}`;
        heading.textContent = upgrade.id === "minigun" ? "AUTOMATIC WEAPON SYSTEMS" :
          upgrade.id === "lightning" ? "FIELD CONTROL & CROWD CONTROL" : "ELITE ARMAMENTS";
        list.append(heading);
      }
      const level = levelOf(upgrade.id);
      const cost = costOf(upgrade);
      const directWeapons = ["minigun", "laser", "rockets", "sniper", "drones", "mortar", "railgun", "artillery"];
      const controlWeapons = ["lightning", "thorns", "blackHole", "smoke", "frost", "flamethrower"];
      const card = document.createElement("article");
      card.className = `upgrade-card${level > 0 && directWeapons.includes(upgrade.id) ? " weapon-unlocked" : ""}${level > 0 && controlWeapons.includes(upgrade.id) ? " control-unlocked" : ""}`;
      card.dataset.upgrade = upgrade.id;
      card.innerHTML = `
        <div class="upgrade-card-top">
          <span class="upgrade-icon">${upgrade.icon}</span>
          <div class="upgrade-copy"><h2>${upgrade.name}</h2><p>${upgradeDescription(upgrade.id)}</p></div>
          <span class="upgrade-level">LV ${level}</span>
        </div>
        <div class="upgrade-bottom"><span class="upgrade-cost">✦ ${cost.toLocaleString()} COINS</span>
          <button class="upgrade-button" ${save.coins < cost || gameState !== "playing" ? "disabled" : ""}>${["minigun", "laser", "rockets"].includes(upgrade.id) && level === 0 ? "UNLOCK" : "UPGRADE"}</button>
        </div>`;
      card.querySelector("button").addEventListener("click", () => buyUpgrade(upgrade));
      list.append(card);
    }
  }

  function upgradeDescription(id) {
    switch (id) {
      case "house": return `House weapon damage +4 · max integrity ${maxHealthFor() + 45}`;
      case "weapon": return `Damage per shot: ${damagePerShot()} → ${damagePerShot() + 7}`;
      case "fireRate": return `Firing every ${fireInterval().toFixed(2)}s → ${Math.max(0.22, fireInterval() - 0.1).toFixed(2)}s`;
      case "walls": return `Max integrity +55 · repairs the house`;
      case "garden": return save.garden === 0 ? "Unlocks damage to nearby zombies." : `Contact damage: ${save.garden * 2.2 + save.houseLevel} / sec`;
      case "income": return `Supply income: ${(save.income * 0.12).toFixed(2)} coins / sec`;
      case "minigun": return save.minigun === 0 ? "Buy to unlock an automatic rapid-fire turret." : `${3 + save.minigun * 2} damage · fires every ${Math.max(0.075, 0.24 - save.minigun * 0.025).toFixed(2)}s`;
      case "laser": return save.laser === 0 ? "Buy to unlock an automatic piercing laser." : `${17 + save.laser * 12} line damage · recharges in ${Math.max(0.38, 1.35 - save.laser * 0.12).toFixed(2)}s`;
      case "rockets": return save.rockets === 0 ? "Buy to unlock explosive area-damage rockets." : `${15 + save.rockets * 12} blast damage · ${52 + save.rockets * 3}px radius`;
      case "lightning": return save.lightning === 0 ? "Unlock electricity that chains across nearby zombies." : `${15 + save.lightning * 8} damage · jumps to ${2 + save.lightning} zombies`;
      case "thorns": return save.thorns === 0 ? "Buy to surround the home with a zombie-slowing field." : `Slows zombies in a ${160 + save.thorns * 10}px radius`;
      case "blackHole": return save.blackHole === 0 ? "Unlock a long-recharge gravity well that pulls and damages groups." : `${3 + save.blackHole * 2} pulse damage · ${Math.max(7, 15 - save.blackHole * 0.65).toFixed(1)}s recharge`;
      case "smoke": return save.smoke === 0 ? "Unlock a smoke bomb that stuns groups of zombies." : `Stuns for ${(1.5 + save.smoke * 0.35).toFixed(2)}s · ${Math.max(4.5, 9 - save.smoke * 0.35).toFixed(1)}s recharge`;
      case "sniper": return save.sniper === 0 ? "Unlock a long-range rifle that deals huge single-target damage." : `${42 + save.sniper * 26} damage · ${Math.max(0.65, 2.8 - save.sniper * 0.18).toFixed(1)}s reload`;
      case "frost": return save.frost === 0 ? "Unlock a chilling blast that slows and damages groups." : `${8 + save.frost * 5} damage · slows a ${82 + save.frost * 9}px area`;
      case "flamethrower": return save.flamethrower === 0 ? "Unlock a turret that burns a group over time." : `${5 + save.flamethrower * 2} burn damage / sec · ${Math.max(0.8, 2.5 - save.flamethrower * 0.14).toFixed(1)}s reload`;
      case "drones": return save.drones === 0 ? "Unlock a squadron of drones that fires at random targets." : `${8 + save.drones * 5} damage · every ${Math.max(0.16, 0.62 - save.drones * 0.035).toFixed(2)}s`;
      case "mortar": return save.mortar === 0 ? "Unlock heavy shells that devastate a random cluster." : `${45 + save.mortar * 28} blast damage · ${76 + save.mortar * 8}px radius`;
      case "railgun": return save.railgun === 0 ? "Unlock a piercing energy beam that hits targets in a line." : `${52 + save.railgun * 32} damage · ${Math.max(1.1, 3.8 - save.railgun * 0.2).toFixed(1)}s reload`;
      case "artillery": return save.artillery === 0 ? "Unlock a massive bombardment at a random position." : `${75 + save.artillery * 42} blast damage · ${Math.max(3.2, 9 - save.artillery * 0.4).toFixed(1)}s reload`;
      default: return "";
    }
  }

  function buyUpgrade(upgrade) {
    const cost = costOf(upgrade);
    if (gameState !== "playing" || save.coins < cost) return;
    save.coins -= cost;
    if (upgrade.id === "house") {
      save.houseLevel++;
      save.health = Math.min(maxHealthFor(), save.health + 55);
    } else {
      save[upgrade.id]++;
      if (upgrade.id === "walls") save.health = Math.min(maxHealthFor(), save.health + 55);
    }
    showBanner(`${upgrade.name.toUpperCase()} · UPGRADED`);
    persist();
    refreshUI();
    playSfx("upgrade");
  }

  function showBanner(message) {
    const banner = $("#banner-message");
    banner.textContent = message;
    banner.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove("show"), 1500);
  }

  function rebuild() {
    save.health = maxHealthFor();
    save.waveTime = 0;
    bossSpawnedWave = save.bossDefeatedWave === save.wave ? save.wave : save.wave - 5;
    gameState = "playing";
    spawnTimer = 1;
    shotTimer = 0;
    $("#defeat-overlay").hidden = true;
    showBanner("DEFENSES RESTORED · HOLD THE LINE");
    persist();
    refreshUI();
  }

  function setupAudio() {
    if (audioContext) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio is not supported in this browser.");
    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    sfxGain = audioContext.createGain();
    musicGain = audioContext.createGain();
    masterGain.gain.value = 0.8;
    sfxGain.gain.value = 0.75;
    musicGain.gain.value = 0.0001;
    sfxGain.connect(masterGain);
    musicGain.connect(masterGain);
    masterGain.connect(audioContext.destination);
  }

  function playTone(frequency, duration) {
    if (!soundEnabled || !audioContext || audioContext.state !== "running") return;
    const start = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.035, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(sfxGain);
    oscillator.start();
    oscillator.stop(start + duration + 0.02);
  }

  function playSfx(name) {
    if (!soundEnabled || !audioContext || audioContext.state !== "running") return;
    const now = audioContext.currentTime;
    const previous = lastSfxTime.get(name) || -Infinity;
    const minimumGap = name === "drone" ? 0.1 : name === "kill" ? 0.12 : name === "minigun" ? 0.1 : 0.035;
    if (now - previous < minimumGap) return;
    lastSfxTime.set(name, now);
    const sounds = {
      houseShot: [220, 105, 0.08, "square", 0.035],
      minigun: [170, 95, 0.055, "square", 0.018],
      hit: [540, 300, 0.055, "triangle", 0.018],
      laser: [980, 420, 0.19, "sawtooth", 0.045],
      rocket: [125, 58, 0.3, "sawtooth", 0.06],
      rocketImpact: [82, 38, 0.28, "triangle", 0.07],
      explosion: [68, 28, 0.48, "sawtooth", 0.085],
      electric: [720, 1200, 0.16, "sawtooth", 0.04],
      blackHole: [95, 32, 0.55, "sine", 0.06],
      smoke: [310, 145, 0.24, "triangle", 0.045],
      sniper: [820, 170, 0.14, "square", 0.055],
      frost: [560, 1180, 0.3, "sine", 0.045],
      flame: [115, 75, 0.22, "sawtooth", 0.035],
      drone: [390, 240, 0.075, "square", 0.018],
      mortar: [150, 75, 0.34, "triangle", 0.05],
      railgun: [240, 1450, 0.3, "sawtooth", 0.055],
      artillery: [75, 30, 0.65, "sawtooth", 0.09],
      kill: [620, 390, 0.09, "triangle", 0.025],
      streak: [660, 990, 0.28, "triangle", 0.045],
      boss: [145, 72, 0.65, "sawtooth", 0.08],
      bossKill: [190, 760, 0.5, "triangle", 0.065],
      defeat: [165, 42, 0.8, "sawtooth", 0.08],
      wave: [290, 520, 0.2, "triangle", 0.035],
      upgrade: [420, 880, 0.18, "triangle", 0.04]
    };
    const [from, to, duration, type, volume] = sounds[name] || [440, 0, 0.1, "triangle", 0.025];
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    if (to) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(sfxGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function playMusicNote(frequency, start, duration, volume, type) {
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(type === "sine" ? 620 : 1450, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(volume, start + 0.12);
    envelope.gain.setValueAtTime(volume, start + duration * 0.65);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(musicGain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function scheduleMusic() {
    if (!musicEnabled || !audioContext || audioContext.state !== "running") return;
    const beat = 60 / 78;
    const notes = [110, 0, 164.81, 0, 146.83, 0, 196, 0, 130.81, 0, 164.81, 0, 98, 0, 146.83, 0];
    while (nextMusicTime < audioContext.currentTime + 0.16) {
      const step = musicStep % notes.length;
      const bass = notes[step];
      if (step % 4 === 0) {
        playMusicNote(bass, nextMusicTime, beat * 3.8, 0.085, "sine");
        playMusicNote(bass * 2, nextMusicTime, beat * 2.8, 0.018, "triangle");
      }
      if (step % 2 === 0) {
        const melody = [220, 0, 246.94, 0, 196, 0, 164.81, 0, 220, 0, 293.66, 0, 246.94, 0, 196, 0][step];
        if (melody) playMusicNote(melody, nextMusicTime, beat * 1.75, 0.035, "triangle");
      }
      musicStep++;
      nextMusicTime += beat / 2;
    }
  }

  function startMusic() {
    if (!musicEnabled || musicTimer !== null) return;
    nextMusicTime = audioContext.currentTime + 0.04;
    musicTimer = window.setInterval(scheduleMusic, 100);
  }

  function stopMusic() {
    if (musicTimer !== null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function loop(now) {
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    for (let i = 0; i < gameSpeed; i++) update(dt);
    drawField();
    requestAnimationFrame(loop);
  }

  $("#rebuild-button").addEventListener("click", rebuild);
  $("#speed-toggle").addEventListener("click", () => {
    gameSpeed = gameSpeed === 1 ? 2 : 1;
    refreshUI();
  });
  $("#sound-button").addEventListener("click", async (event) => {
    try {
      setupAudio();
      await audioContext.resume();
      soundEnabled = !soundEnabled;
      event.currentTarget.classList.toggle("muted", !soundEnabled);
      event.currentTarget.textContent = soundEnabled ? "SFX ON" : "SFX OFF";
      event.currentTarget.setAttribute("aria-label", soundEnabled ? "Mute sound effects" : "Enable sound effects");
      event.currentTarget.title = soundEnabled ? "Mute sound effects" : "Enable sound effects";
      if (soundEnabled) playTone(520, 0.08);
    } catch (error) {
      console.error("Could not enable sound effects.", error);
      showBanner("AUDIO UNAVAILABLE IN THIS BROWSER");
    }
  });
  $("#music-button").addEventListener("click", async (event) => {
    try {
      setupAudio();
      await audioContext.resume();
      musicEnabled = !musicEnabled;
      event.currentTarget.classList.toggle("muted", !musicEnabled);
      event.currentTarget.textContent = musicEnabled ? "MUSIC ON" : "MUSIC OFF";
      event.currentTarget.setAttribute("aria-label", musicEnabled ? "Turn background music off" : "Enable background music");
      event.currentTarget.title = musicEnabled ? "Turn background music off" : "Enable background music";
      const now = audioContext.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setTargetAtTime(musicEnabled ? 0.24 : 0.0001, now, 0.12);
      if (musicEnabled) startMusic();
      else stopMusic();
    } catch (error) {
      console.error("Could not enable background music.", error);
      showBanner("AUDIO UNAVAILABLE IN THIS BROWSER");
    }
  });
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("beforeunload", persist);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      persist();
      stopMusic();
      if (musicGain && audioContext) musicGain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.08);
    } else if (musicEnabled && audioContext) {
      audioContext.resume().then(() => {
        musicGain.gain.setTargetAtTime(0.24, audioContext.currentTime, 0.15);
        startMusic();
      }).catch((error) => console.error("Could not resume background music.", error));
    }
  });

  initializeField();
  resizeCanvas();
  $("#defeat-overlay").hidden = gameState !== "defeated";
  refreshUI();
  requestAnimationFrame(loop);
})();
