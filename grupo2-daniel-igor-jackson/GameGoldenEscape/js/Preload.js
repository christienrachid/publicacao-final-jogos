class Preload extends Phaser.Scene{
	constructor(){
		super('Preload')
	}
	
	preload(){
		this.load.audio('sndMusic',['snd/music.ogg'])
		this.load.audio('sndJump',['snd/jump.ogg'])
		this.load.audio('sndGetCoin',['snd/getcoin.ogg'])
	
		this.load.image('end','img/youWin.jpeg')
		this.load.image('start','img/start.jpeg')
		this.load.image('sky', 'img/sky.png')
		this.load.image('clouds', 'img/clouds.png')

		this.load.image('platform', 'img/platform.png')
		this.load.image('enemy', 'img/enemy.png')
		this.load.image('enemy2', 'img/enemy2.png')
		this.load.spritesheet('player', 'img/player.png', {frameWidth: 32, frameHeight: 49})
		this.load.spritesheet('coin', 'img/coin.png', {frameWidth: 32, frameHeight: 32})
		this.load.image('ground', 'img/ground.png')
	}
	
	create(){
		this.anims.create({
			key: 'walk',
			frames: this.anims.generateFrameNumbers('player', {
				start: 0,
				end: 3
			}),
			frameRate: 8,
			repeat: -1
		})
		
		this.anims.create({
			key: 'spin',
			frames: this.anims.generateFrameNumbers('coin',{
				start: 0,
				end: 4
			}),
			frameRate: 8,
			repeat: -1
		})
	
		this.scene.start('StartScene')
	}
}
