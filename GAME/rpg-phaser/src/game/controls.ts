interface MovementInput {
    horizontal: number;
    vertical: number;
}

export class Controls {
    private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;

    private readonly movementKeys: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
    };

    constructor(scene: Phaser.Scene) {
        const keyboard = scene.input.keyboard;

        if (!keyboard) {
            throw new Error('O teclado não está disponível nesta cena.');
        }

        this.cursors = keyboard.createCursorKeys();

        this.movementKeys = keyboard.addKeys(
            'W,S,A,D'
        ) as {
            W: Phaser.Input.Keyboard.Key;
            A: Phaser.Input.Keyboard.Key;
            S: Phaser.Input.Keyboard.Key;
            D: Phaser.Input.Keyboard.Key;
        };
    }

    getMovement(): MovementInput {
        let horizontal = 0;
        let vertical = 0;

        if (
            this.cursors.left.isDown ||
            this.movementKeys.A.isDown
        ) {
            horizontal -= 1;
        }

        if (
            this.cursors.right.isDown ||
            this.movementKeys.D.isDown
        ) {
            horizontal += 1;
        }

        if (
            this.cursors.up.isDown ||
            this.movementKeys.W.isDown
        ) {
            vertical -= 1;
        }

        if (
            this.cursors.down.isDown ||
            this.movementKeys.S.isDown
        ) {
            vertical += 1;
        }

        return {
            horizontal,
            vertical,
        };
    }
}