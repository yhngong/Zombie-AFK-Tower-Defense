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
    { id: "income", name: "Supply Shed", icon: "✦", description: "Earn coins even while the game is idle.", baseCost: 30, costScale: 1.6 }
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
      dead: false
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
    const target = findTarget();
    if (target && shotTimer <= 0) {
      bullets.push({ x: center.x, y: center.y - 13, target, speed: 390, damage: damagePerShot(), life: 2 });
      shotTimer = fireInterval();
      playTone(430, 0.035);
    }

    for (const zombie of zombies) {
      const dx = center.x - zombie.x;
      const dy = center.y - zombie.y;
      const distance = Math.hypot(dx, dy);
      const houseRadius = 48 + (save.houseLevel - 1) * 2;
      if (distance > houseRadius + zombie.radius) {
        zombie.x += dx / distance * zombie.speed * dt;
        zombie.y += dy / distance * zombie.speed * dt;
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
      if (distance < bullet.speed * dt + bullet.target.radius) {
        bullet.target.hp -= bullet.damage;
        bullet.dead = true;
        effects.push({ x: bullet.target.x, y: bullet.target.y - 8, text: `-${Math.round(bullet.damage)}`, color: "#f2da9e", life: 0.55, maxLife: 0.55 });
        if (bullet.target.hp <= 0) killZombie(bullet.target);
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

  function updateEffects(dt) {
    for (const effect of effects) {
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
    ctx.shadowColor = "#ffe294";
    ctx.shadowBlur = 9;
    ctx.fillStyle = "#ffe5a1";
    ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawEffects() {
    for (const effect of effects) {
      const alpha = Math.max(0, effect.life / effect.maxLife);
      ctx.globalAlpha = alpha;
      if (effect.text) {
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
      const level = levelOf(upgrade.id);
      const cost = costOf(upgrade);
      const card = document.createElement("article");
      card.className = "upgrade-card";
      card.innerHTML = `
        <div class="upgrade-card-top">
          <span class="upgrade-icon">${upgrade.icon}</span>
          <div class="upgrade-copy"><h2>${upgrade.name}</h2><p>${upgradeDescription(upgrade.id)}</p></div>
          <span class="upgrade-level">LV ${level}</span>
        </div>
        <div class="upgrade-bottom"><span class="upgrade-cost">✦ ${cost.toLocaleString()} COINS</span>
          <button class="upgrade-button" ${save.coins < cost || gameState !== "playing" ? "disabled" : ""}>UPGRADE</button>
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
