// ==================== SCENE SETUP ====================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 1000, 5000);

const canvas = document.querySelector('canvas') || document.body.appendChild(document.createElement('canvas'));
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// ==================== PLAYER CONTROLLER ====================
class Player {
    constructor() {
        this.velocity = new THREE.Vector3();
        this.acceleration = 0.15;
        this.friction = 0.85;
        this.jumpForce = 20;
        this.isJumping = false;
        this.groundDrag = 0.1;
        this.airDrag = 0.02;
        this.health = 100;
        this.maxHealth = 100;
    }

    update(keys) {
        const moveDirection = new THREE.Vector3();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

        if (keys['w'] || keys['W']) moveDirection.add(forward);
        if (keys['s'] || keys['S']) moveDirection.sub(forward);
        if (keys['a'] || keys['A']) moveDirection.sub(right);
        if (keys['d'] || keys['D']) moveDirection.add(right);

        if (moveDirection.length() > 0) {
            moveDirection.normalize();
            this.velocity.x += moveDirection.x * this.acceleration;
            this.velocity.z += moveDirection.z * this.acceleration;
        }

        this.velocity.x *= this.friction;
        this.velocity.z *= this.friction;
        this.velocity.y -= 0.5; // Gravity

        camera.position.add(this.velocity);

        // Simple ground collision
        if (camera.position.y <= 2) {
            camera.position.y = 2;
            this.velocity.y = 0;
            this.isJumping = false;
        }

        if (keys[' '] && !this.isJumping) {
            this.velocity.y = this.jumpForce;
            this.isJumping = true;
        }
    }

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        document.getElementById('health').textContent = Math.floor(this.health);
    }
}

// ==================== WEAPON SYSTEM ====================
class Weapon {
    constructor(name, damage, fireRate, maxAmmo, spread) {
        this.name = name;
        this.damage = damage;
        this.fireRate = fireRate;
        this.maxAmmo = maxAmmo;
        this.ammo = maxAmmo;
        this.spread = spread; // In radians
        this.lastFireTime = 0;
    }

    canShoot() {
        return Date.now() - this.lastFireTime >= this.fireRate && this.ammo > 0;
    }

    shoot(origin, direction, scene, enemies) {
        if (!this.canShoot()) return [];

        this.lastFireTime = Date.now();
        this.ammo--;
        const hitObjects = [];

        // For shotgun, fire multiple rays
        const raysToFire = this.name === 'Shotgun' ? 8 : 1;

        for (let i = 0; i < raysToFire; i++) {
            const spreadX = (Math.random() - 0.5) * this.spread;
            const spreadY = (Math.random() - 0.5) * this.spread;

            const spreadDirection = direction.clone();
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

            spreadDirection.addScaledVector(right, spreadX);
            spreadDirection.addScaledVector(up, spreadY);
            spreadDirection.normalize();

            const raycaster = new THREE.Raycaster(origin, spreadDirection, 0, 500);
            const intersects = raycaster.intersectObjects(enemies);

            if (intersects.length > 0) {
                const hit = intersects[0];
                if (hit.object.userData.enemy) {
                    hit.object.userData.enemy.takeDamage(this.damage);
                    hitObjects.push(hit);
                }
            }
        }

        this.updateUI();
        return hitObjects;
    }

    reload() {
        this.ammo = this.maxAmmo;
        this.updateUI();
    }

    updateUI() {
        document.getElementById('weaponName').textContent = this.name;
        document.getElementById('ammo').textContent = this.ammo;
        document.getElementById('maxAmmo').textContent = this.maxAmmo;
        document.getElementById('damage').textContent = this.damage;
    }
}

// ==================== ENEMY SYSTEM ====================
class Enemy {
    constructor(position, scene) {
        const geometry = new THREE.BoxGeometry(1, 2, 1);
        const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.userData.enemy = this;

        this.health = 30;
        this.maxHealth = 30;
        this.speed = 0.08;
        this.damage = 5;
        this.lastAttackTime = 0;
        this.attackCooldown = 1000;

        scene.add(this.mesh);
    }

    update(playerPos, scene) {
        const direction = playerPos.clone().sub(this.mesh.position);
        const distance = direction.length();

        if (distance > 0.1) {
            direction.normalize();
            this.mesh.position.addScaledVector(direction, this.speed);
        }

        // Attack player if close
        if (distance < 2 && Date.now() - this.lastAttackTime > this.attackCooldown) {
            player.takeDamage(this.damage);
            this.lastAttackTime = Date.now();
        }

        // Look at player
        this.mesh.lookAt(playerPos);
    }

    takeDamage(amount) {
        this.health -= amount;
    }

    isDead() {
        return this.health <= 0;
    }

    remove(scene) {
        scene.remove(this.mesh);
    }
}

// ==================== INPUT HANDLING ====================
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;

    if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
        const weaponIndex = parseInt(e.key) - 1;
        currentWeaponIndex = Math.min(weaponIndex, weapons.length - 1);
        weapons[currentWeaponIndex].updateUI();
    }

    if (e.key === 'r' || e.key === 'R') {
        weapons[currentWeaponIndex].reload();
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Mouse look
let yaw = 0;
let pitch = 0;
let firstMouse = true;

window.addEventListener('mousemove', (e) => {
    const sensitivity = 0.003;
    yaw += e.movementX * sensitivity;
    pitch -= e.movementY * sensitivity;
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));

    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
});

// Lock pointer on click
document.addEventListener('click', () => {
    canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
    canvas.requestPointerLock();
});

// Shooting
window.addEventListener('click', () => {
    const weapon = weapons[currentWeaponIndex];
    const origin = camera.position.clone();
    origin.y -= 0.5; // Adjust for hand position
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

    weapon.shoot(origin, direction, scene, enemies.map(e => e.mesh));

    // Visual feedback
    createMuzzleFlash(origin, direction);
});

// ==================== VISUAL EFFECTS ====================
function createMuzzleFlash(origin, direction) {
    const geometry = new THREE.SphereGeometry(0.3, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const flash = new THREE.Mesh(geometry, material);

    const offset = direction.clone().multiplyScalar(2);
    flash.position.copy(origin).add(offset);

    scene.add(flash);

    setTimeout(() => {
        scene.remove(flash);
    }, 50);
}

// ==================== INITIALIZATION ====================
const player = new Player();
camera.position.set(0, 2, 0);

// Create weapons
const weapons = [
    new Weapon('9MM', 10, 100, 30, 0.02),
    new Weapon('Shotgun', 25, 500, 8, 0.15),
    new Weapon('SMG', 5, 50, 60, 0.08),
    new Weapon('Snark', 15, 300, 10, 0.05)
];

let currentWeaponIndex = 0;
weapons[0].updateUI();

// Create ground
const groundGeometry = new THREE.PlaneGeometry(500, 500);
const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x2d5016 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Create some obstacles
for (let i = 0; i < 5; i++) {
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    const material = new THREE.MeshPhongMaterial({ color: Math.random() * 0xffffff });
    const box = new THREE.Mesh(geometry, material);
    box.position.set(Math.random() * 200 - 100, 5, Math.random() * 200 - 100);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
}

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(100, 100, 50);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.left = -200;
directionalLight.shadow.camera.right = 200;
directionalLight.shadow.camera.top = 200;
directionalLight.shadow.camera.bottom = -200;
scene.add(directionalLight);

// Enemy management
const enemies = [];

function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const distance = 50 + Math.random() * 50;
    const x = camera.position.x + Math.cos(angle) * distance;
    const z = camera.position.z + Math.sin(angle) * distance;
    const enemy = new Enemy(new THREE.Vector3(x, 2, z), scene);
    enemies.push(enemy);
}

// Spawn enemies periodically
setInterval(() => {
    if (enemies.length < 15) {
        spawnEnemy();
    }
}, 1000);

// ==================== GAME LOOP ====================
let frameCount = 0;
let lastTime = Date.now();

function animate() {
    requestAnimationFrame(animate);

    // Update player
    player.update(keys);

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].update(camera.position, scene);
        if (enemies[i].isDead()) {
            enemies[i].remove(scene);
            enemies.splice(i, 1);
        }
    }

    // Update UI
    document.getElementById('enemyCount').textContent = enemies.length;

    // FPS counter
    frameCount++;
    const currentTime = Date.now();
    if (currentTime - lastTime >= 1000) {
        document.getElementById('fps').textContent = frameCount;
        frameCount = 0;
        lastTime = currentTime;
    }

    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();