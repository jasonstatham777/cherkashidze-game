// --- СЦЕНА 1: PRELOADER (ЭКРАН ЗАГРУЗКИ) ---
const PreloaderScene = {
    key: 'PreloaderScene',
    preload: function() {
        // Создаем фон для загрузочного экрана
        this.add.rectangle(200, 300, 300, 100, 0x000000, 0.7);

        // Создаем прогресс-бар
        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(100, 285, 200, 30);

        // Текст "Загрузка..."
        const loadingText = this.make.text({
            x: 200,
            y: 260,
            text: 'Загрузка...',
            style: {
                font: '18px monospace',
                fill: '#ffffff'
            }
        }).setOrigin(0.5, 0.5);

        const percentText = this.make.text({
            x: 200,
            y: 300,
            text: '0%',
            style: {
                font: '16px monospace',
                fill: '#ffffff'
            }
        }).setOrigin(0.5, 0.5);

        // Слушаем событие 'progress' для обновления бара
        this.load.on('progress', function (value) {
            progressBar.clear();
            progressBar.fillStyle(0x00ff00, 1);
            progressBar.fillRect(105, 290, 190 * value, 20);
            percentText.setText(parseInt(value * 100) + '%');
        });

        // Слушаем событие 'complete', чтобы перейти к основной сцене
        this.load.on('complete', function () {
            progressBar.destroy();
            progressBox.destroy();
            loadingText.destroy();
            percentText.destroy();
            this.scene.start('GameScene'); // Запускаем основную игру
        }, this);

        // --- Загружаем все ассеты здесь ---
        this.load.image('background', 'assets/background.png');
        this.load.image('player', 'assets/player.png');
        this.load.image('banana', 'assets/banana.png');
        this.load.image('obstacle', 'assets/obstacle.png');
        this.load.image('powerup_shield', 'assets/powerup_shield.png');
        this.load.image('shield_effect', 'assets/shield_effect.png');
        this.load.image('powerup_magnet', 'assets/powerup_magnet.png');
        this.load.image('powerup_score_x2', 'assets/powerup_score_x2.png');
        this.load.audio('background_music', 'assets/sound.mp3');
        this.load.audio('hit_sound', 'assets/off.mp3');
        this.load.audio('no_money_sound', 'assets/nexvatka.mp3');
    }
};

// --- СЦЕНА 2: GAMESCENE (ОСНОВНАЯ ИГРА) ---
const GameScene = {
    key: 'GameScene',
    // preload больше не нужен здесь, все загружено в PreloaderScene
    create: function() {
        isGameOver = false;
        isGameStarted = false;
        score = 0;
        gameSpeed = 120; // ИЗМЕНЕНО: Теперь это "пиксели в секунду"
        activePowerupTimers = {};

        loadProgress.call(this);
        this.add.image(config.width / 2, config.height / 2, 'background');

        // --- ГЛОБАЛЬНЫЙ MUTE ---
        this.sound.mute = isMuted;

        if (!music) {
            music = this.sound.add('background_music', { loop: true });
        }
        if (!music.isPlaying && !isMuted) {
            music.play();
        }

        const startText = this.add.text(config.width / 2, config.height / 2, 'Нажмите, чтобы начать', { fontSize: '28px', fill: '#ffffff', backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 20, y: 10 }, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(10);
        this.physics.pause();
        this.input.once('pointerdown', () => {
            isGameStarted = true;
            startText.destroy();
            this.physics.resume();
        });

        const MUTE_ICON_ON = '🔊';
        const MUTE_ICON_OFF = '🔇';
        muteBtn = this.add.text(config.width - 16, 16, isMuted ? MUTE_ICON_OFF : MUTE_ICON_ON, { fontSize: '24px' }).setOrigin(1, 0).setInteractive().setDepth(10);
        muteBtn.on('pointerdown', () => {
            isMuted = !isMuted;
            muteBtn.setText(isMuted ? MUTE_ICON_OFF : MUTE_ICON_ON);
            this.sound.mute = isMuted; // ИЗМЕНЕНО: Глобальный mute
            saveProgress();
        });

        player = this.physics.add.sprite(config.width / 2, config.height - 50, 'player');
        player.setCollideWorldBounds(true);
        player.isShielded = false;
        player.isMagnetActive = false;
        player.scoreMultiplier = 1;

        shieldEffect = this.add.sprite(player.x, player.y, 'shield_effect').setVisible(false).setDepth(1);

        cursors = this.input.keyboard.createCursorKeys();
        this.input.on('pointerdown', (p) => { if (isGameStarted && !isGameOver && p.target !== muteBtn) { p.x < config.width / 2 ? player.setVelocityX(-250) : player.setVelocityX(250); }});
        this.input.on('pointerup', () => { if (isGameStarted && !isGameOver) player.setVelocityX(0); });

        bananas = this.physics.add.group();
        obstacles = this.physics.add.group();
        powerups = this.physics.add.group();

        scoreText = this.add.text(16, 16, 'Очки: 0', { fontSize: '24px', fill: '#FFF', stroke: '#000', strokeThickness: 4 });
        timerText = this.add.text(16, 48, '', { fontSize: '18px', fill: '#87CEEB', stroke: '#000', strokeThickness: 4, lineSpacing: 4 });
        powerupText = this.add.text(config.width / 2, 50, '', { fontSize: '28px', fill: '#FFD700', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);

        buildGameOverMenu.call(this);
        buildShopMenu.call(this);

        this.physics.add.overlap(player, bananas, collectBanana, null, this);
        this.physics.add.collider(player, obstacles, hitObstacle, null, this);
        this.physics.add.overlap(player, powerups, collectPowerup, null, this);

        this.time.addEvent({ delay: 1500, callback: addBanana, callbackScope: this, loop: true });
        this.time.addEvent({ delay: 2000, callback: addObstacle, callbackScope: this, loop: true });
        this.time.addEvent({ delay: 12000, callback: () => addPowerup('powerup_shield'), callbackScope: this, loop: true });
        this.time.addEvent({ delay: 15000, callback: () => addPowerup('powerup_magnet'), callbackScope: this, loop: true });
        this.time.addEvent({ delay: 18000, callback: () => addPowerup('powerup_score_x2'), callbackScope: this, loop: true });
    },
    // --- ИЗМЕНЕНА ФУНКЦИЯ ОБНОВЛЕНИЯ для синхронизации скорости ---
    update: function(time, delta) {
        if (!isGameStarted || isGameOver) return;

        if (cursors.left.isDown) player.setVelocityX(-250);
        else if (cursors.right.isDown) player.setVelocityX(250);
        else if (!this.input.activePointer.isDown) player.setVelocityX(0);

        if (player.isShielded) shieldEffect.setPosition(player.x, player.y);
        if (player.isMagnetActive) {
            bananas.children.each((b) => { if (b && Phaser.Math.Distance.Between(player.x, player.y, b.x, b.y) < 150) this.physics.moveToObject(b, player, 300); }, this);
        }

        // Ускорение теперь не зависит от FPS, а зависит от времени (delta)
        // Скорость увеличивается на ~2 пикселя в секунду каждую секунду
        gameSpeed += 2 * (delta / 1000);

        // Движение объектов теперь также зависит от времени (delta), обеспечивая плавность
        [bananas, obstacles, powerups].forEach(group => {
            group.children.each(item => { if (item) { item.y += gameSpeed * (delta / 1000); if (item.y > config.height + 50) item.destroy(); }});
        });

        let timerDisplayStrings = [];
        for (const key in activePowerupTimers) {
            if (activePowerupTimers[key] && activePowerupTimers[key].getRemaining() > 0) {
                timerDisplayStrings.push(`${key}: ${(activePowerupTimers[key].getRemaining() / 1000).toFixed(1)}с`);
            }
        }
        timerText.setText(timerDisplayStrings.join('\n')).setVisible(timerDisplayStrings.length > 0);
    }
};

// Конфигурация игры теперь включает обе сцены
const config = {
    type: Phaser.AUTO,
    width: 400,
    height: 600,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 } }
    },
    scene: [PreloaderScene, GameScene] // Сначала загрузчик, потом игра
};

const game = new Phaser.Game(config);

// --- Глобальные переменные и функции (многие остались без изменений) ---
let player, cursors, bananas, obstacles, powerups, shieldEffect;
let scoreText, powerupText, timerText, muteBtn;
let gameOverContainer, shopContainer;
let music;
let score = 0;
let gameSpeed = 120; // Начальная скорость в пикселях в секунду
let isGameOver = false;
let isMuted = false;
let isGameStarted = false;
let activePowerupTimers = {};
let totalBananas = 0;
let shieldLevel = 0;
let magnetLevel = 0;
let scoreX2Level = 0;
let shieldDuration, magnetDuration, scoreX2Duration;
const BASE_SHIELD_DURATION = 4000;
const BASE_MAGNET_DURATION = 6000;
const BASE_SCOREX2_DURATION = 8000;

// Функции-помощники
function addBanana() { if (!isGameStarted || isGameOver) return; bananas.create(Phaser.Math.Between(20, config.width - 20), -50, 'banana'); }
function addObstacle() { if (!isGameStarted || isGameOver) return; obstacles.create(Phaser.Math.Between(20, config.width - 20), -50, 'obstacle'); }
function addPowerup(type) { if (!isGameStarted || isGameOver) return; powerups.create(Phaser.Math.Between(20, config.width - 20), -50, type); }
function collectBanana(player, banana) { banana.destroy(); score += 10 * player.scoreMultiplier; scoreText.setText('Очки: ' + score); }
function collectPowerup(player, powerup) { const type = powerup.texture.key; powerup.destroy(); if (type === 'powerup_shield') activateShield.call(this); if (type === 'powerup_magnet') activateMagnet.call(this); if (type === 'powerup_score_x2') activateScoreDoubler.call(this); }
function activateShield() { if (activePowerupTimers['Щит']) activePowerupTimers['Щит'].remove(); player.isShielded = true; shieldEffect.setVisible(true); displayPowerupText.call(this, 'ЩИТ АКТИВЕН!'); activePowerupTimers['Щит'] = this.time.addEvent({ delay: shieldDuration, callback: () => { player.isShielded = false; shieldEffect.setVisible(false); activePowerupTimers['Щит'] = null; } }); }
function activateMagnet() { if (activePowerupTimers['Магнит']) activePowerupTimers['Магнит'].remove(); player.isMagnetActive = true; displayPowerupText.call(this, 'МАГНИТ!'); activePowerupTimers['Магнит'] = this.time.addEvent({ delay: magnetDuration, callback: () => { player.isMagnetActive = false; activePowerupTimers['Магнит'] = null; } }); }
function activateScoreDoubler() { if (activePowerupTimers['Очки x2']) activePowerupTimers['Очки x2'].remove(); player.scoreMultiplier = 2; displayPowerupText.call(this, 'ОЧКИ x2!'); activePowerupTimers['Очки x2'] = this.time.addEvent({ delay: scoreX2Duration, callback: () => { player.scoreMultiplier = 1; activePowerupTimers['Очки x2'] = null; } }); }
function displayPowerupText(text) { powerupText.setText(text); this.time.addEvent({ delay: 2000, callback: () => powerupText.setText('') }); }
function hitObstacle(player, obstacle) { if (player.isShielded) { obstacle.destroy(); player.isShielded = false; shieldEffect.setVisible(false); if (activePowerupTimers['Щит']) activePowerupTimers['Щит'].remove(); activePowerupTimers['Щит'] = null; return; } if (isGameOver) return; if (score > 0 && window.Telegram && window.Telegram.WebApp) { window.Telegram.WebApp.setGameScore(score, (error, result) => { if (error) { console.error('Ошибка при отправке счета в Telegram:', error); } }); } this.sound.play('hit_sound'); if (music) music.stop(); isGameOver = true; this.physics.pause(); player.setTint(0xff0000); activePowerupTimers = {}; totalBananas += Math.floor(score / 10); saveProgress(); const scoreResultText = gameOverContainer.getByName('scoreResultText'); scoreResultText.setText(`Собрано: ${Math.floor(score / 10)} черкашей\nВсего черкашей: ${totalBananas}`); gameOverContainer.setVisible(true); } function saveProgress() { const progress = { totalBananas, shieldLevel, magnetLevel, scoreX2Level, isMuted }; localStorage.setItem('bananaDashProgress', JSON.stringify(progress)); }
function loadProgress() { const progress = JSON.parse(localStorage.getItem('bananaDashProgress')); if (progress) { totalBananas = progress.totalBananas || 0; shieldLevel = progress.shieldLevel || 0; magnetLevel = progress.magnetLevel || 0; scoreX2Level = progress.scoreX2Level || 0; isMuted = progress.isMuted || false; } shieldDuration = BASE_SHIELD_DURATION + (shieldLevel * 1500); magnetDuration = BASE_MAGNET_DURATION + (magnetLevel * 1500); scoreX2Duration = BASE_SCOREX2_DURATION + (scoreX2Level * 1500); }
function buildGameOverMenu() { gameOverContainer = this.add.container(config.width / 2, config.height / 2).setVisible(false).setDepth(5); const bg = this.add.graphics().fillStyle(0x000000, 0.7).fillRect(-150, -150, 300, 300).lineStyle(2, 0xffffff, 1).strokeRect(-150, -150, 300, 300); const title = this.add.text(0, -120, 'ИГРА ОКОНЧЕНА', { fontSize: '28px', fill: '#ff4444' }).setOrigin(0.5); const scoreResultText = this.add.text(0, -50, '', { fontSize: '18px', fill: '#ffffff', align: 'center' }).setOrigin(0.5).setName('scoreResultText'); const restartBtn = this.add.text(0, 30, 'Перезапуск', { fontSize: '24px', fill: '#00ff00' }).setOrigin(0.5).setInteractive(); const shopBtn = this.add.text(0, 90, 'Магазин', { fontSize: '24px', fill: '#ffff00' }).setOrigin(0.5).setInteractive(); restartBtn.on('pointerdown', () => this.scene.start('GameScene')); /* ИЗМЕНЕНО: перезапускаем сцену правильно */ shopBtn.on('pointerdown', () => { gameOverContainer.setVisible(false); updateShopText.call(this); shopContainer.setVisible(true); }); [restartBtn, shopBtn].forEach(btn => { btn.on('pointerover', () => btn.setScale(1.1)); btn.on('pointerout', () => btn.setScale(1)); }); gameOverContainer.add([bg, title, scoreResultText, restartBtn, shopBtn]); }
function buildShopMenu() { shopContainer = this.add.container(config.width / 2, config.height / 2).setVisible(false).setDepth(5); const bg = this.add.graphics().fillStyle(0x000000, 0.85).fillRect(-180, -250, 360, 500).lineStyle(2, 0xffffff, 1).strokeRect(-180, -250, 360, 500); const title = this.add.text(0, -220, 'МАГАЗИН', { fontSize: '28px', fill: '#ffff00' }).setOrigin(0.5); const bananasText = this.add.text(0, -180, '', { fontSize: '20px', fill: '#ffffff' }).setOrigin(0.5).setName('bananasText'); const shieldInfo = this.add.text(-160, -120, '', { fontSize: '16px', fill: '#87CEEB', align: 'left' }).setOrigin(0, 0).setName('shieldInfo'); const shieldBtn = this.add.text(120, -110, 'Купить', { fontSize: '18px', fill: '#00ff00', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive(); const magnetInfo = this.add.text(-160, -40, '', { fontSize: '16px', fill: '#FFB6C1', align: 'left' }).setOrigin(0, 0).setName('magnetInfo'); const magnetBtn = this.add.text(120, -30, 'Купить', { fontSize: '18px', fill: '#00ff00', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive(); const scoreX2Info = this.add.text(-160, 40, '', { fontSize: '16px', fill: '#FFD700', align: 'left' }).setOrigin(0, 0).setName('scoreX2Info'); const scoreX2Btn = this.add.text(120, 50, 'Купить', { fontSize: '18px', fill: '#00ff00', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive(); const backBtn = this.add.text(0, 200, 'Назад', { fontSize: '24px', fill: '#ff4444' }).setOrigin(0.5).setInteractive(); shieldBtn.on('pointerdown', () => buyUpgrade.call(this, 'shield')); magnetBtn.on('pointerdown', () => buyUpgrade.call(this, 'magnet')); scoreX2Btn.on('pointerdown', () => buyUpgrade.call(this, 'scoreX2')); backBtn.on('pointerdown', () => { shopContainer.setVisible(false); gameOverContainer.setVisible(true); }); [shieldBtn, magnetBtn, scoreX2Btn, backBtn].forEach(btn => { btn.on('pointerover', () => btn.setScale(1.1)); btn.on('pointerout', () => btn.setScale(1)); }); shopContainer.add([bg, title, bananasText, shieldInfo, shieldBtn, magnetInfo, magnetBtn, scoreX2Info, scoreX2Btn, backBtn]); }
function buyUpgrade(type) { const costs = { shield: 100 + (shieldLevel * 150), magnet: 150 + (magnetLevel * 200), scoreX2: 200 + (scoreX2Level * 250) }; const cost = costs[type]; if (totalBananas >= cost) { totalBananas -= cost; if (type === 'shield') shieldLevel++; else if (type === 'magnet') magnetLevel++; else if (type === 'scoreX2') scoreX2Level++; loadProgress(); saveProgress(); updateShopText.call(this); } else { this.sound.play('no_money_sound'); } }
function updateShopText() { shopContainer.getByName('bananasText').setText(`Ваши черкаши: ${totalBananas}`); const shieldCost = 100 + (shieldLevel * 150); shopContainer.getByName('shieldInfo').setText(`Щит (Ур. ${shieldLevel})\nДлительность: ${(shieldDuration / 1000).toFixed(1)} сек.\nСтоимость: ${shieldCost}`); const magnetCost = 150 + (magnetLevel * 200); shopContainer.getByName('magnetInfo').setText(`Магнит (Ур. ${magnetLevel})\nДлительность: ${(magnetDuration / 1000).toFixed(1)} сек.\nСтоимость: ${magnetCost}`); const scoreX2Cost = 200 + (scoreX2Level * 250); shopContainer.getByName('scoreX2Info').setText(`Очки x2 (Ур. ${scoreX2Level})\nДлительность: ${(scoreX2Duration / 1000).toFixed(1)} сек.\nСтоимость: ${scoreX2Cost}`); }
