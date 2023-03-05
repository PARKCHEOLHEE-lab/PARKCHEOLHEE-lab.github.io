class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}


class PointsInCanvas {
    constructor() {
        this.container = document.getElementById("pointsInCanvasjs")
        this.ctx = this.container.getContext("2d");
        this.stageWidth = this.container.clientWidth;
        
        this.setCanvasSize();
        this.animate();
    }

    drawRandomPoints() {
        this.pointList = []
        for (let i = 0; i < 10; i++) {
            let randomX = Math.random() * this.stageWidth;
            let randomY = Math.random() * window.innerHeight / 1.5;
            let randomPoint = new Point(
                randomX, randomY
            );
            this.pointList.push(randomPoint);
        }

        this.point = new Point(
            this.centerX, 
            this.centerY
        );
        
        this.pointList.forEach((point) => {
            let maxVal = 0xFFFFFF;
            let randomNumber = Math.floor(Math.random() * maxVal); 
            let randColor = "#" + randomNumber.toString(16);
    
            this.ctx.fillStyle = randColor;
            this.ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.beginPath();
            }
        )
    }

    animate() {
        this.drawRandomPoints();
        requestAnimationFrame(this.animate.bind(this));
    }

    setCanvasSize() {
        this.container.width = this.container.clientWidth;
        this.container.height = window.innerHeight / 1.5;
    }
}

new PointsInCanvas();