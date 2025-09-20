// ===== Telegram helper (для отправки очков в бот) =====
const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

// простая функция для парсинга query-параметров из URL
function getQueryParams() {
    const params = {};
    const qs = (window.location.search || '').replace(/^\?/, '');
    if (!qs) return params;
    qs.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return params;
}

// Отправка очков на сервер
function submitScore(score) {
    const params = getQueryParams();
    const init = (tg && tg.initDataUnsafe) ? tg.initDataUnsafe : {};
    const user = init.user || (params.from_id ? { id: Number(params.from_id) } : null);

    if (!user || !user.id) {
        console.log('Telegram user not found — не отправляем очки');
        return;
    }

    const payload = {
        user_id: Number(user.id),
        score: Number(score) || 0,
        chat_id: params.chat_id ? Number(params.chat_id) : (init.chat ? init.chat.id : null),
        message_id: params.message_id ? Number(params.message_id) : null,
        chat_instance: init.chat_instance || params.chat_instance || null
    };

    fetch('https://YOUR-REPLIT-APP-URL/setscore', {   // 👉 замени на свой URL Replit
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(r => r.json().catch(()=>{}))
    .then(res => console.log('submitScore response', res))
    .catch(err => console.error('Error sending score to server:', err));
}
// ===== конец Telegram helper =====

class PreloaderScene extends Phaser.Scene {
    constructor() { super('PreloaderScene'); }

    preload() {
        this.add.rectangle(200, 300, 300, 100, 0x000000, 0.7);
        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(100, 285, 200, 30);
        const loadingText = this.make.text({ x: 200, y: 260, text: 'Загрузка...', style: { font: '18px monospace', fill: '#ffffff' } }).setOrigin(0.5, 0.5);
        const percentText = this.make.text({ x: 200, y: 300, text: '0%', style: { font: '16px monospace', fill: '#ffffff' } }).setOrigin(0.5, 0.5);
        this.load.on('progress', (value) => {
            progressBar.clear();
            progressBar.fillStyle(0x00ff00, 1);
            progressBar.fillRect(105, 290, 190 * value, 20);
            percentText.setText(parseInt(value * 100) + '%');
        });
        this.load.on('complete', () => { this.scene.start('GameScene'); });
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
}

class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    init() {
        this.score = 0;
        this.gameSpeed = 120;
        this.isGameOver = false;
        this.isGameStarted = false;
        this.activePowerupTimers = {};
        this.totalBananas = 0;
        this.shieldLevel = 0;
        this.magnetLevel = 0;
        this.scoreX2Level = 0;
        this.isMuted = false;
    }

    create() {
        this.loadProgress();
        this.add.image(200, 300, 'background');
        this.sound.mute = this.isMuted;
        
        if (!this.sound.get('background_music') || !this.music) {
            this.music = this.sound.add('background_music', { loop: true });
        }
        
        const startText = this.add.text(200, 300, 'Нажмите, чтобы начать', { fontSize: '28px', fill: '#ffffff', backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 20, y: 10 }, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(10);
        this.physics.pause();

        this.input.once('pointerdown', () => {
            this.isGameStarted = true;
            startText.destroy();
            this.physics.resume();
            if (!this.music.isPlaying && !this.isMuted) {
                this.music.play();
            }
        });

        const MUTE_ICON_ON = '🔊';
        const MUTE_ICON_OFF = '🔇';
        this.muteBtn = this.add.text(384, 16, this.isMuted ? MUTE_ICON_OFF : MUTE_ICON_ON, { fontSize: '24px' }).setOrigin(1, 0).setInteractive().setDepth(10);
        this.muteBtn.on('pointerdown', () => {
            this.isMuted = !this.isMuted;
            this.muteBtn.setText(this.isMuted ? MUTE_ICON_OFF : MUTE_ICON_ON);
            this.sound.mute = this.isMuted;
            this.saveProgress();
        });
        
        this.player = this.physics.add.sprite(200, 550, 'player');
        this.player.setCollideWorldBounds(true);
        this.player.isShielded = false;
        this.player.isMagnetActive = false;
        this.player.scoreMultiplier = 1;
        
        this.shieldEffect = this.add.sprite(this.player.x, this.player.y, 'shield_effect').setVisible(false).setDepth(1);
        
        this.cursors = this.input.keyboard.createCursorKeys();
        this.input.on('pointerdown', (p) => { if (this.isGameStarted && !this.isGameOver && p.target !== this.muteBtn) { p.x < 200 ? this.player.setVelocityX(-250) : this.player.setVelocityX(250); }});
        this.input.on('pointerup', () => { if (this.isGameStarted && !this.isGameOver) this.player.setVelocityX(0); });
        
        this.bananas = this.physics.add.group();
        this.obstacles = this.physics.add.group();
        this.powerups = this.physics.add.group();
        
        this.scoreText = this.add.text(16, 16, 'Очки: 0', { fontSize: '24px', fill: '#FFF', stroke: '#000', strokeThickness: 4 });
        this.timerText = this.add.text(16, 48, '', { fontSize: '18px', fill: '#87CEEB', stroke: '#000', strokeThickness: 4, lineSpacing: 4 });
        this.powerupText = this.add.text(200, 50, '', { fontSize: '28px', fill: '#FFD700', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
        
        this.buildGameOverMenu();
        this.buildShopMenu();
        
        this.physics.add.overlap(this.player, this.bananas, this.collectBanana, null, this);
        this.physics.add.collider(this.player, this.obstacles, this.hitObstacle, null, this);
        this.physics.add.overlap(this.player, this.powerups, this.collectPowerup, null, this);
        
        this.time.addEvent({ delay: 1500, callback: this.addBanana, callbackScope: this, loop: true });
        this.time.addEvent({ delay: 2000, callback: this.addObstacle, callbackScope: this, loop: true });
        this.time.addEvent({ delay: 12000, callback: () => this.addPowerup('powerup_shield'), callbackScope: this, loop: true });
        this.time.addEvent({ delay: 15000, callback: () => this.addPowerup('powerup_magnet'), callbackScope: this, loop: true });
        this.time.addEvent({ delay: 18000, callback: () => this.addPowerup('powerup_score_x2'), callbackScope: this, loop: true });
    }

    update(time, delta) {
        if (!this.isGameStarted || this.isGameOver) return;
        if (this.cursors.left.isDown) this.player.setVelocityX(-250);
        else if (this.cursors.right.isDown) this.player.setVelocityX(250);
        else if (!this.input.activePointer.isDown) this.player.setVelocityX(0);
        if (this.player.isShielded) this.shieldEffect.setPosition(this.player.x, this.player.y);
        if (this.player.isMagnetActive) {
            this.bananas.children.each((b) => { if (b && Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y) < 150) this.physics.moveToObject(b, this.player, 300); });
        }
        this.gameSpeed += 2 * (delta / 1000);
        [this.bananas, this.obstacles, this.powerups].forEach(group => {
            group.children.each(item => { if (item) { item.y += this.gameSpeed * (delta / 1000); if (item.y > 650) item.destroy(); }});
        });
        let timerDisplayStrings = [];
        for (const key in this.activePowerupTimers) {
            if (this.activePowerupTimers[key] && this.activePowerupTimers[key].getRemaining() > 0) {
                timerDisplayStrings.push(`${key}: ${(this.activePowerupTimers[key].getRemaining() / 1000).toFixed(1)}с`);
            }
        }
        this.timerText.setText(timerDisplayStrings.join('\n')).setVisible(timerDisplayStrings.length > 0);
    }
    
    addBanana() { if (!this.isGameStarted || this.isGameOver) return; this.bananas.create(Phaser.Math.Between(20, 380), -50, 'banana'); }
    addObstacle() { if (!this.isGameStarted || this.isGameOver) return; this.obstacles.create(Phaser.Math.Between(20, 380), -50, 'obstacle'); }
    addPowerup(type) { if (!this.isGameStarted || this.isGameOver) return; this.powerups.create(Phaser.Math.Between(20, 380), -50, type); }
    collectBanana(player, banana) { banana.destroy(); this.score += 10 * this.player.scoreMultiplier; this.scoreText.setText('Очки: ' + this.score); }
    collectPowerup(player, powerup) { const type = powerup.texture.key; powerup.destroy(); if (type === 'powerup_shield') this.activateShield(); if (type === 'powerup_magnet') this.activateMagnet(); if (type === 'powerup_score_x2') this.activateScoreDoubler(); }
    activateShield() { if (this.activePowerupTimers['Щит']) this.activePowerupTimers['Щит'].remove(); this.player.isShielded = true; this.shieldEffect.setVisible(true); this.displayPowerupText('ЩИТ АКТИВЕН!'); this.activePowerupTimers['Щит'] = this.time.addEvent({ delay: this.shieldDuration, callback: () => { this.player.isShielded = false; this.shieldEffect.setVisible(false); this.activePowerupTimers['Щит'] = null; } }); }
    activateMagnet() { if (this.activePowerupTimers['Магнит']) this.activePowerupTimers['Магнит'].remove(); this.player.isMagnetActive = true; this.displayPowerupText('МАГНИТ!'); this.activePowerupTimers['Магнит'] = this.time.addEvent({ delay: this.magnetDuration, callback: () => { this.player.isMagnetActive = false; this.activePowerupTimers['Магнит'] = null; } }); }
    activateScoreDoubler() { if (this.activePowerupTimers['Очки x2']) this.activePowerupTimers['Очки x2'].remove(); this.player.scoreMultiplier = 2; this.displayPowerupText('ОЧКИ x2!'); this.activePowerupTimers['Очки x2'] = this.time.addEvent({ delay: this.scoreX2Duration, callback: () => { this.player.scoreMultiplier = 1; this.activePowerupTimers['Очки x2'] = null; } }); }
    displayPowerupText(text) { this.powerupText.setText(text); this.time.addEvent({ delay: 2000, callback: () => this.powerupText.setText('') }); }
    
    // === обновлённый метод hitObstacle с вызовом submitScore ===
    hitObstacle(player, obstacle) {
        if (player.isShielded) {
            obstacle.destroy();
            player.isShielded = false;
            this.shieldEffect.setVisible(false);
            if (this.activePowerupTimers['Щит']) {
                this.activePowerupTimers['Щит'].remove();
                this.activePowerupTimers['Щит'] = null;
            }
            return;
        }
        if (this.isGameOver) {
            return;
        }

        this.isGameOver = true;
        this.physics.pause();

        try {
            if (this.score > 0) {
                submitScore(this.score);
            } else {
                console.log('Score is 0 — не отправляем');
            }
        } catch (e) {
            console.error("Ошибка при отправке счета:", e);
        }

        this.sound.play('hit_sound');
        if (this.music && this.music.isPlaying) {
            this.music.stop();
        }

        player.setTint(0xff0000);
        this.totalBananas += Math.floor(this.score / 10);
        this.saveProgress();

        this.time.delayedCall(100, () => {
            const scoreResultText = this.gameOverContainer.getByName('scoreResultText');
            scoreResultText.setText(`Собрано: ${Math.floor(this.score / 10)} черкашей\nВсего черкашей: ${this.totalBananas}`);
            this.gameOverContainer.setVisible(true);
        });
    }
    
    saveProgress() { const progress = { totalBananas: this.totalBananas, shieldLevel: this.shieldLevel, magnetLevel: this.magnetLevel, scoreX2Level: this.scoreX2Level, isMuted: this.isMuted }; localStorage.setItem('bananaDashProgress', JSON.stringify(progress)); }
    loadProgress() { const progress = JSON.parse(localStorage.getItem('bananaDashProgress')); this.totalBananas = progress?.totalBananas || 0; this.shieldLevel = progress?.shieldLevel || 0; this.magnetLevel = progress?.magnetLevel || 0; this.scoreX2Level = progress?.scoreX2Level || 0; this.isMuted = progress?.isMuted || false; this.shieldDuration = 4000 + (this.shieldLevel * 1500); this.magnetDuration = 6000 + (this.magnetLevel * 1500); this.scoreX2Duration = 8000 + (this.scoreX2Level * 1500); }
    
    buildGameOverMenu() { this.gameOverContainer = this.add.container(200, 300).setVisible(false).setDepth(5); const bg = this.add.graphics().fillStyle(0x000000, 0.7).fillRect(-150, -150, 300, 300).lineStyle(2, 0xffffff, 1).strokeRect(-150, -150, 300, 300); const title = this.add.text(0, -120, 'ИГРА ОКОНЧЕНА', { fontSize: '28px', fill: '#ff4444' }).setOrigin(0.5); const scoreResultText = this.add.text(0, -50, '', { fontSize: '18px', fill: '#ffffff', align: 'center' }).setOrigin(0.5).setName('scoreResultText'); const restartBtn = this.add.text(0, 30, 'Перезапуск', { fontSize: '24px', fill: '#00ff00' }).setOrigin(0.5).setInteractive(); const shopBtn = this.add.text(0, 90, 'Магазин', { fontSize: '24px', fill: '#ffff00' }).setOrigin(0.5).setInteractive(); restartBtn.on('pointerdown', () => this.scene.start('GameScene')); shopBtn.on('pointerdown', () => { this.gameOverContainer.setVisible(false); this.updateShopText(); this.shopContainer.setVisible(true); }); [restartBtn, shopBtn].forEach(btn => { btn.on('pointerover', () => btn.setScale(1.1)); btn.on('pointerout', () => btn.setScale(1)); }); this.gameOverContainer.add([bg, title, scoreResultText, restartBtn, shopBtn]); }
    buildShopMenu() { this.shopContainer = this.add.container(200, 300).setVisible(false).setDepth(5); const bg = this.add.graphics().fillStyle(0x000000, 0.85).fillRect(-180, -250, 360, 500).lineStyle(2, 0xffffff, 1).strokeRect(-180, -250, 360, 500); const title = this.add.text(0, -220, 'МАГАЗИН', { fontSize: '28px', fill: '#ffff00' }).setOrigin(0.5); const bananasText = this.add.text(0, -180, '', { fontSize: '20px', fill: '#ffffff' }).setOrigin(0.5).setName('bananasText'); const shieldInfo = this.add.text(-160, -120, '', { fontSize: '16px', fill: '#87CEEB', align: 'left' }).setOrigin(0, 0).setName('shieldInfo'); const shieldBtn = this.add.text(120, -110, 'Купить', { fontSize: '18px', fill: '#00ff00', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive(); const magnetInfo = this.add.text(-160, -40, '', { fontSize: '16px', fill: '#FFB6C1', align: 'left' }).setOrigin(0, 0).setName('magnetInfo'); const magnetBtn = this.add.text(120, -30, 'Купить', { fontSize: '18px', fill: '#00ff00', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive(); const scoreX2Info = this.add.text(-160, 40, '', { fontSize: '16px', fill: '#FFD700', align: 'left' }).setOrigin(0, 0).setName('scoreX2Info'); const scoreX2Btn = this.add.text(120, 50, 'Купить', { fontSize: '18px', fill: '#00ff00', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive(); const backBtn = this.add.text(0, 200, 'Назад', { fontSize: '24px', fill: '#ff4444' }).setOrigin(0.5).setInteractive(); shieldBtn.on('pointerdown', () => this.buyUpgrade('shield')); magnetBtn.on('pointerdown', () => this.buyUpgrade('magnet')); scoreX2Btn.on('pointerdown', () => this.buyUpgrade('scoreX2')); backBtn.on('pointerdown', () => { this.shopContainer.setVisible(false); this.gameOverContainer.setVisible(true); }); [shieldBtn, magnetBtn, scoreX2Btn, backBtn].forEach(btn => { btn.on('pointerover', () => btn.setScale(1.1)); btn.on('pointerout', () => btn.setScale(1)); }); this.shopContainer.add([bg, title, bananasText, shieldInfo, shieldBtn, magnetInfo, magnetBtn, scoreX2Info, scoreX2Btn, backBtn]); }
    buyUpgrade(type) { const costs = { shield: 100 + (this.shieldLevel * 150), magnet: 150 + (this.magnetLevel * 200), scoreX2: 200 + (this.scoreX2Level * 250) }; const cost = costs[type]; if (this.totalBananas >= cost) { this.totalBananas -= cost; if (type === 'shield') this.shieldLevel++; else if (type === 'magnet') this.magnetLevel++; else if (type === 'scoreX2') this.scoreX2Level++; this.loadProgress(); this.saveProgress(); this.updateShopText(); } else { this.sound.play('no_money_sound'); } }
    updateShopText() { this.shopContainer.getByName('bananasText').setText(`Ваши черкаши: ${this.totalBananas}`); const shieldCost = 100 + (this.shieldLevel * 150); this.shopContainer.getByName('shieldInfo').setText(`Щит (Ур. ${this.shieldLevel})\nДлительность: ${(this.shieldDuration / 1000).toFixed(1)} сек.\nСтоимость: ${shieldCost}`); const magnetCost = 150 + (this.magnetLevel * 200); this.shopContainer.getByName('magnetInfo').setText(`Магнит (Ур. ${this.magnetLevel})\nДлительность: ${(this.magnetDuration / 1000).toFixed(1)} сек.\nСтоимость: ${magnetCost}`); const scoreX2Cost = 200 + (this.scoreX2Level * 250); this.shopContainer.getByName('scoreX2Info').setText(`Очки x2 (Ур. ${this.scoreX2Level})\nДлительность: ${(this.scoreX2Duration / 1000).toFixed(1)} сек.\nСтоимость: ${scoreX2Cost}`); }
}

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
    scene: [PreloaderScene, GameScene]
};

const game = new Phaser.Game(config);
