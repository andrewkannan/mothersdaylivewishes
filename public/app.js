const socket = io();

const form = document.getElementById('wish-form');
const input = document.getElementById('wish-input');
const container = document.getElementById('wishes-container');

// Physics state
const wishesArray = [];
let baseRadius = 80;

let isAdmin = false;

// Listen for submission
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const wishText = input.value.trim();
    
    // Check for admin super secret code
    if (wishText.toLowerCase() === 'admin123') {
        isAdmin = !isAdmin;
        input.value = '';
        if (isAdmin) {
            container.classList.add('admin-mode');
            alert('Admin mode unlocked: You can now delete wishes by clicking their X button.');
        } else {
            container.classList.remove('admin-mode');
            alert('Admin mode disabled.');
        }
        return;
    }
    
    if (wishText) {
        socket.emit('new_wish', wishText);
        input.value = '';
    }
});

// Load existing wishes on connect
socket.on('load_wishes', (wishes) => {
    container.innerHTML = '';
    wishesArray.length = 0; // Reset
    
    // Always persist the logo whenever we refresh the screen from database state
    initLogo();
    
    wishes.forEach(wish => {
        createBubble(wish);
    });
});

// Listen for new incoming wishes
socket.on('receive_wish', (wish) => {
    createBubble(wish);
});

// Listen for deleted wishes
socket.on('wish_deleted', (wishId) => {
    const index = wishesArray.findIndex(b => b.id === wishId);
    if (index !== -1) {
        const b = wishesArray[index];
        if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
        wishesArray.splice(index, 1);
    }
});

function createBubble(wish) {
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.classList.add('wish-bubble');
    
    // SVG Heart with white fill and light red (#ff9a9e) outline
    bubbleWrapper.innerHTML = `
        <svg class="heart-svg" viewBox="0 0 24 24" preserveAspectRatio="none">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                  fill="#ffffff" stroke="#ff9a9e" stroke-width="0.4"/>
        </svg>
    `;
    
    const textSpan = document.createElement('span');
    textSpan.innerText = wish.text;
    bubbleWrapper.appendChild(textSpan);

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = 'X';
    deleteBtn.onclick = (e) => {
        e.stopPropagation(); // Avoid triggering parents
        socket.emit('delete_wish', wish.id);
    };
    bubbleWrapper.appendChild(deleteBtn);

    container.appendChild(bubbleWrapper);

    // Initial properties
    const radius = baseRadius;
    const x = radius + Math.random() * (window.innerWidth - radius * 2);
    const y = radius + Math.random() * (window.innerHeight - radius * 2);
    
    // Faster initial random velocity to spread them
    const vx = (Math.random() - 0.5) * 5;
    const vy = (Math.random() - 0.5) * 5;

    // Calculate initial target radius dynamically based on text length
    // We apply a gentle scale-down for mobile devices to prevent completely dominating the screen
    let viewportScale = window.innerWidth < 600 ? 0.75 : 1;
    let calculatedR = 45 + (wish.text.length * 1.2);
    
    let targetR = Math.max(60 * viewportScale, calculatedR * viewportScale);

    // Shrink all existing wishes so the screen doesn't fill up permanently
    wishesArray.forEach(b => {
        if (!b.isLogo) {
            b.targetRadius = Math.max(40 * viewportScale, b.targetRadius * 0.95);
        }
    });

    wishesArray.push({
        id: wish.id,
        el: bubbleWrapper,
        x, y, vx, vy,
        radius: 0, // Starts at 0, grows to targetRadius
        targetRadius: targetR,
        textSpan
    });
}

function updatePhysics() {
    for (let i = 0; i < wishesArray.length; i++) {
        let b = wishesArray[i];

        // Smooth radius transition
        b.radius += (b.targetRadius - b.radius) * 0.05;
        b.el.style.width = `${b.radius * 2}px`;
        b.el.style.height = `${b.radius * 2}px`;
        
        // Font size relative to radius: strictly proportional mathematical scaling so text never spills outside the SVG borders
        if (b.textSpan) {
            b.textSpan.style.fontSize = `${b.radius * 0.16}px`;
        }

        // Update position
        b.x += b.vx;
        b.y += b.vy;

        // Apply drag (so they don't bounce too fast indefinitely)
        let speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        
        if (isAdmin) {
            // Apply heavy brakes in Admin Mode so they are easy to click
            if (speed > 0.2) {
                b.vx *= 0.85;
                b.vy *= 0.85;
            }
        } else {
            // Normal drifting speeds when not admin
            if (speed < 0.8) {
                b.vx *= 1.05;
                b.vy *= 1.05;
            } else if (speed > 3) {
                b.vx *= 0.99;
                b.vy *= 0.99;
            }
        }

        // Bounce off walls
        if (b.x - b.radius < 0) { b.x = b.radius; b.vx *= -1; }
        if (b.x + b.radius > window.innerWidth) { b.x = window.innerWidth - b.radius; b.vx *= -1; }
        if (b.y - b.radius < 0) { b.y = b.radius; b.vy *= -1; }
        if (b.y + b.radius > window.innerHeight) { b.y = window.innerHeight - b.radius; b.vy *= -1; }
    }

    // Collision detection
    for (let i = 0; i < wishesArray.length; i++) {
        for (let j = i + 1; j < wishesArray.length; j++) {
            let b1 = wishesArray[i];
            let b2 = wishesArray[j];
            
            let dx = b2.x - b1.x;
            let dy = b2.y - b1.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            // Multiply by 0.75 because the visual heart shape is smaller than the bounding circle
            // and has cutouts at the corners. This lets them collate closer.
            let minDistance = (b1.radius + b2.radius) * 0.75;

            if (distance < minDistance && distance > 0) {
                // Resolve overlap
                let overlap = minDistance - distance;
                let nx = dx / distance;
                let ny = dy / distance;
                
                b1.x -= nx * overlap * 0.5;
                b1.y -= ny * overlap * 0.5;
                b2.x += nx * overlap * 0.5;
                b2.y += ny * overlap * 0.5;

                // Bounce velocities softly
                let kx = (b1.vx - b2.vx);
                let ky = (b1.vy - b2.vy);
                let p = 2.0 * (nx * kx + ny * ky) / 2;
                // Add a small restitution coefficient
                b1.vx = b1.vx - p * nx * 0.8;
                b1.vy = b1.vy - p * ny * 0.8;
                b2.vx = b2.vx + p * nx * 0.8;
                b2.vy = b2.vy + p * ny * 0.8;
            }
        }
    }

    // Render positioning
    for (let i = 0; i < wishesArray.length; i++) {
        let b = wishesArray[i];
        b.el.style.transform = `translate(${b.x - b.radius}px, ${b.y - b.radius}px)`;
    }

    requestAnimationFrame(updatePhysics);
}

// Initialize persistent floating logo
function initLogo() {
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.classList.add('wish-bubble', 'logo-bubble');
    
    const img = document.createElement('img');
    img.src = '/logo.png'; 
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.zIndex = '10';
    img.style.pointerEvents = 'none'; // so you can't accidentally click it out of frustration
    
    // Fallback if logo.png doesn't exist yet
    img.onerror = () => {
        bubbleWrapper.innerHTML = `
            <div style="background: rgba(255,255,255,0.9); border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.1); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #ff9a9e; font-size: 14px; text-align: center; padding: 10px;">
                Your Logo<br/>(logo.png)
            </div>`;
    };
    
    bubbleWrapper.appendChild(img);
    container.appendChild(bubbleWrapper);

    // Size of the logo
    let viewportScale = window.innerWidth < 600 ? 0.75 : 1;
    let targetR = 70 * viewportScale; 

    // Random initial placement
    const x = targetR + Math.random() * (window.innerWidth - targetR * 2);
    const y = targetR + Math.random() * (window.innerHeight - targetR * 2);
    
    const vx = (Math.random() - 0.5) * 4;
    const vy = (Math.random() - 0.5) * 4;

    wishesArray.push({
        id: 'persistent_logo',
        el: bubbleWrapper,
        x, y, vx, vy,
        radius: targetR,
        targetRadius: targetR,
        isLogo: true
    });
}

// Start visualizations
requestAnimationFrame(updatePhysics);
