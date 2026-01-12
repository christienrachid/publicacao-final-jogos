class MainMenuScene extends Phaser.Scene{
	cursors = Phaser.Types.Input.Keyboard.CursorKeys

	constructor()
	{
		super('main-menu')
	}

	init()
	{
		this.cursors = this.input.keyboard.createCursorKeys()
	}

	//preload()
    //{
	//	this.load.image('glass-panel', 'assets/glassPanel.png')
	//	this.load.image('cursor-hand', 'assets/cursor_hand.png')
    //}

    create()
    {
		// TODO
	}

	selectButton(index)
	{
		// TODO
	}

	selectNextButton(change = 1)
	{
		// TODO
	}

	confirmSelection()
	{
		// TODO
	}
	
	update()
	{
		const upJustPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up.isdown)
		const downJustPressed = Phaser.Input.Keyboard.JustDown(this.cursors.down.isdown)
		const spaceJustPressed = Phaser.Input.Keyboard.JustDown(this.cursors.space.isdown)
		
		if (upJustPressed)
		{
			this.selectNextButton(-1)
		}
		else if (downJustPressed)
		{
			this.selectNextButton(1)
		}
		else if (spaceJustPressed)
		{
			this.confirmSelection()
		}
}
}
