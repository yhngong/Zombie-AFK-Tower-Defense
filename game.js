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
    { id: "smoke", name: "Smoke Bomb", icon: "☁", description: "Stuns a group of zombies in a cloud of smoke.", baseCost: 330, costScale: 1.84 }
  ];
  const freshSave = () => ({
    coins: 40,
    kills: 0,
    bestWave: 1,
    wave: 1,
    waveTime: 0,
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
  let gameState = save.health > 0 ? "playing" : "defeated";
  let lastTime = 0;
  let saveTimer = 0;
  let audioContext = null;
  let soundEnabled = false;
  let bannerTimer;
  let upgradeRenderKey = "";

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

  function spawnZombie() {
    const edge = Math.floor(Math.random() * 4);
    const inset = 16;
    let x;
    let y;
    if (edge === 0) { x = Math.random() * world.width; y = inset; }
    else if (edge === 1) { x = world.width - inset; y = Math.random() * world.height; }
    else if (edge === 2) { x = Math.random() * world.width; y = world.height - inset; }
    else { x = inset; y = Math.random() * world.height; }
    const hp = 19 + save.wave * 4 + Math.random() * save.wave * 1.4;
    zombies.push({
      x, y, hp, maxHp: hp, speed: 12 + Math.min(save.wave * 0.35, 9) + Math.random() * 2,
      radius: 8 + Math.random() * 3, attackTimer: Math.random() * 0.5,
      tint: Math.floor(Math.random() * 3), wobble: Math.random() * Math.PI * 2,
      slowTimer: 0, stunTimer: 0, dead: false
    });
  }

  function housePosition() {
    return { x: center.x, y: center.y };
  }

  function update(dt) {
    if (gameState !== "playing") {
      updateEffects(dt);
      return;
    }
    save.waveTime += dt;
    if (save.waveTime >= 32) {
      save.waveTime -= 32;
      save.wave++;
      save.bestWave = Math.max(save.bestWave, save.wave);
      showBanner(`WAVE ${save.wave} · THE HORDE GROWS`);
      playTone(260, 0.14);
    }

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
    const target = findTarget();
    if (target && shotTimer <= 0) {
      bullets.push({ x: center.x, y: center.y - 13, target, speed: 390, damage: damagePerShot(), life: 2, weapon: "house" });
      shotTimer = fireInterval();
      playTone(430, 0.035);
    }
    if (target && save.minigun > 0 && minigunTimer <= 0) {
      const minigunTarget = findRandomTarget();
      if (minigunTarget) {
        bullets.push({
          x: center.x + 22, y: center.y + 5, target: minigunTarget,
          speed: 540, damage: 3 + save.minigun * 2, life: 2, weapon: "minigun"
        });
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
        playTone(780, 0.055);
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
        playTone(190, 0.09);
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
        playTone(740, 0.05);
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
        playTone(135, 0.25);
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
        if (stunned) playTone(250, 0.16);
      }
    }

    for (const zombie of zombies) {
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
      if (bullet.weapon === "rocket") {
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
      zombies = [];
      bullets = [];
      $("#defeat-overlay").hidden = false;
      showBanner("THE HOUSE HAS FALLEN");
      playTone(110, 0.35);
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
    save.coins += 3 + Math.floor(save.wave / 2);
    for (let i = 0; i < 9; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 54;
      effects.push({ x: zombie.x, y: zombie.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color: ["#b5c771", "#dd9878", "#b58a76"][zombie.tint], life: 0.4 + Math.random() * 0.45, maxLife: 0.8, size: 1.5 + Math.random() * 2 });
    }
    playTone(680, 0.045);
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
    effects.push({ type: "blast", x, y, radius, color: "#ffad58", life: 0.3, maxLife: 0.3 });
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
    playTone(900, 0.08);
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
    const sx = canvas.width / world.width;
    const sy = canvas.height / world.height;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
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
    drawHouse();
    for (const zombie of zombies) drawZombie(zombie);
    for (const bullet of bullets) drawBullet(bullet);
    drawEffects();
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

  function drawZombie(zombie) {
    ctx.save();
    ctx.translate(zombie.x, zombie.y);
    ctx.rotate(Math.atan2(center.y - zombie.y, center.x - zombie.x) + Math.PI / 2);
    const bob = Math.sin(zombie.wobble) * 1.5;
    ctx.fillStyle = "rgba(22, 30, 20, .28)";
    ctx.beginPath(); ctx.ellipse(1, zombie.radius * 0.75, zombie.radius * 0.9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ["#899461", "#a88969", "#73875d"][zombie.tint];
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-4, 2 + bob); ctx.lineTo(-8, 8 + bob);
    ctx.moveTo(4, 2 + bob); ctx.lineTo(8, 8 + bob);
    ctx.moveTo(-4, -3 + bob); ctx.lineTo(-9, 0 + bob);
    ctx.moveTo(4, -3 + bob); ctx.lineTo(9, 0 + bob);
    ctx.stroke();
    ctx.fillStyle = ["#83915b", "#a28264", "#718461"][zombie.tint];
    ctx.beginPath(); ctx.ellipse(0, bob, zombie.radius * 0.72, zombie.radius, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = zombie.tint === 1 ? "#d1b08a" : "#aab77b";
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
    const rocket = bullet.weapon === "rocket";
    const color = rocket ? "#ff9b54" : bullet.weapon === "minigun" ? "#ffd278" : bullet.weapon === "lightning" ? "#a9f6ff" : "#ffe294";
    ctx.shadowColor = color;
    ctx.shadowBlur = rocket ? 12 : 9;
    ctx.fillStyle = color;
    if (rocket) {
      ctx.translate(bullet.x, bullet.y);
      ctx.rotate(Math.atan2(bullet.target.y - bullet.y, bullet.target.x - bullet.x));
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
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 5 * alpha;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius * (1 - alpha + 0.2), 0, Math.PI * 2);
        ctx.stroke();
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
      if (upgrade.id === "minigun" || upgrade.id === "lightning") {
        const heading = document.createElement("div");
        heading.className = `upgrade-section-label${upgrade.id === "lightning" ? " control-label" : ""}`;
        heading.textContent = upgrade.id === "minigun" ? "AUTOMATIC WEAPON SYSTEMS" : "FIELD CONTROL & CROWD CONTROL";
        list.append(heading);
      }
      const level = levelOf(upgrade.id);
      const cost = costOf(upgrade);
      const card = document.createElement("article");
      card.className = `upgrade-card${level > 0 && ["minigun", "laser", "rockets"].includes(upgrade.id) ? " weapon-unlocked" : ""}${level > 0 && ["lightning", "thorns", "blackHole", "smoke"].includes(upgrade.id) ? " control-unlocked" : ""}`;
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
    playTone(600, 0.11);
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
    gameState = "playing";
    spawnTimer = 1;
    shotTimer = 0;
    $("#defeat-overlay").hidden = true;
    showBanner("DEFENSES RESTORED · HOLD THE LINE");
    persist();
    refreshUI();
  }

  function playTone(frequency, duration) {
    if (!soundEnabled) return;
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.025, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  }

  function loop(now) {
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    update(dt);
    drawField();
    requestAnimationFrame(loop);
  }

  $("#rebuild-button").addEventListener("click", rebuild);
  $("#sound-button").addEventListener("click", async (event) => {
    soundEnabled = !soundEnabled;
    event.currentTarget.classList.toggle("muted", !soundEnabled);
    event.currentTarget.setAttribute("aria-label", soundEnabled ? "Mute sound" : "Enable sound");
    if (soundEnabled) {
      audioContext ||= new AudioContext();
      await audioContext.resume();
      playTone(520, 0.08);
    }
  });
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("beforeunload", persist);
  document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); });

  initializeField();
  resizeCanvas();
  $("#defeat-overlay").hidden = gameState !== "defeated";
  refreshUI();
  requestAnimationFrame(loop);
})();
