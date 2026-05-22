// Variables globales
let candidates = [];
// Affichage hero : partages Facebook (le tirage utilise toujours la liste Excel)
const FACEBOOK_SHARES_DISPLAY = '+7k';

const POST_FILES = [
    'post/Post1.xls',
    'post/Post2.xls',
    'post/Post3.xls',
    'post/Post4.xls',
    'post/Post5.xls'
];
const IGNORED_NAMES = new Set(['nom', 'profil', 'id_utilisateur']);

function isProfileUrl(value) {
    const s = String(value).trim().toLowerCase();
    return s.startsWith('http') || s.includes('facebook.com');
}

// Éléments du DOM
const facebookSharesCountElement = document.getElementById('facebook-shares-count');
const drawButton = document.getElementById('draw-button');
const winnerCard = document.getElementById('winner-card');
const winnerName = document.getElementById('winner-name');
const winnerSubtitle = document.getElementById('winner-subtitle');
const suspenseOverlay = document.getElementById('suspense-overlay');
const countdownElement = document.getElementById('countdown');
const confettiCanvas = document.getElementById('confetti-canvas');

/**
 * Lit un fichier Excel et renvoie les lignes (objets avec en-têtes)
 */
async function fetchExcelRows(filePath) {
    const response = await fetch(filePath);
    if (!response.ok) {
        throw new Error(`${filePath} : HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
}

/**
 * Charge les 5 exports Facebook (post/Post1-5.xls) au chargement de la page
 */
async function loadExcelFile() {
    const params = new URLSearchParams(window.location.search);
    const singleFile = params.get('file');

    try {
        let rows = [];

        if (singleFile) {
            rows = await fetchExcelRows(singleFile);
        } else {
            const batches = await Promise.all(POST_FILES.map(fetchExcelRows));
            rows = batches.flat();
        }

        extractCandidatesFromRows(rows);
    } catch (error) {
        console.error('Erreur lors du chargement des fichiers Excel:', error);
        alert(
            'Erreur lors du chargement des participants.\n\n' +
            'Vérifiez que les fichiers post/Post1.xls … Post5.xls existent ' +
            'et ouvrez la page via un serveur local :\n\n' +
            'python -m http.server 8000\n\n' +
            'Puis : http://localhost:8000'
        );
    }
}

// Charger le fichier Excel au chargement de la page
window.addEventListener('DOMContentLoaded', () => {
    initFacebookSharesBadge();
    loadExcelFile();
    
    // Ajuster la taille du canvas des confettis lors du redimensionnement
    window.addEventListener('resize', () => {
        if (confettiCanvas) {
            confettiCanvas.width = window.innerWidth;
            confettiCanvas.height = window.innerHeight;
        }
    });
});

/**
 * Extrait les candidats depuis les colonnes Nom / ID_utilisateur
 * @param {Array<Object>} rows - Lignes Excel (feuille Partages)
 */
function extractCandidatesFromRows(rows) {
    const seen = new Set();
    candidates = [];

    for (const row of rows) {
        const name = String(row.Nom ?? row.nom ?? '').trim();
        const userId = String(row.ID_utilisateur ?? row.id_utilisateur ?? '').trim().toLowerCase();

        if (!name || IGNORED_NAMES.has(name.toLowerCase()) || isProfileUrl(name)) {
            continue;
        }

        const key = userId || name.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        candidates.push(name);
    }

    candidates.sort((a, b) => a.localeCompare(b, 'fr'));

    if (candidates.length > 0) {
        drawButton.disabled = false;
        winnerCard.classList.add('hidden');
    } else {
        drawButton.disabled = true;
        alert('Aucun candidat valide trouvé dans les fichiers Excel.');
    }
}

/**
 * Affiche le nombre de partages Facebook dans le bandeau hero
 */
function initFacebookSharesBadge() {
    if (facebookSharesCountElement) {
        facebookSharesCountElement.textContent = FACEBOOK_SHARES_DISPLAY;
    }
}

/**
 * Génère un nombre aléatoire entre min et max (inclus)
 * @param {number} min - Valeur minimale
 * @param {number} max - Valeur maximale
 * @returns {number} Nombre aléatoire
 */
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Crée un son de célébration
 */
function playCelebrationSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const duration = 2;
    const sampleRate = audioContext.sampleRate;
    const numSamples = duration * sampleRate;
    const buffer = audioContext.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);
    
    // Créer un son de célébration (accord majeur)
    const frequencies = [523.25, 659.25, 783.99]; // Do, Mi, Sol
    
    for (let i = 0; i < numSamples; i++) {
        let sample = 0;
        frequencies.forEach(freq => {
            sample += Math.sin(2 * Math.PI * freq * i / sampleRate);
        });
        data[i] = sample / frequencies.length * Math.exp(-i / numSamples * 3);
    }
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
}

/**
 * Vérifie si on est sur un appareil mobile
 */
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.innerWidth <= 768 && window.innerHeight <= 1024);
}


/**
 * Crée des confettis animés
 */
function createConfetti() {
    const ctx = confettiCanvas.getContext('2d');
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
    
    const colors = ['#1c7a42', '#145e33', '#FFD700', '#e8f5ee', '#FFFFFF'];
    const confetti = [];
    const confettiCount = 150;
    
    for (let i = 0; i < confettiCount; i++) {
        confetti.push({
            x: Math.random() * confettiCanvas.width,
            y: -Math.random() * confettiCanvas.height,
            r: Math.random() * 6 + 4,
            d: Math.random() * confettiCount,
            color: colors[Math.floor(Math.random() * colors.length)],
            tilt: Math.floor(Math.random() * 10) - 10,
            tiltAngleIncrement: Math.random() * 0.07 + 0.05,
            tiltAngle: 0
        });
    }
    
    function draw() {
        ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        
        confetti.forEach((c, i) => {
            ctx.beginPath();
            ctx.lineWidth = c.r / 2;
            ctx.strokeStyle = c.color;
            ctx.moveTo(c.x + c.tilt + c.r, c.y);
            ctx.lineTo(c.x + c.tilt, c.y + c.tilt + c.r);
            ctx.stroke();
            
            c.tiltAngle += c.tiltAngleIncrement;
            c.y += (Math.cos(c.d) + 3 + c.r / 2) / 2;
            c.tilt = Math.sin(c.tiltAngle - i / 3) * 15;
            
            if (c.y > confettiCanvas.height) {
                c.x = Math.random() * confettiCanvas.width;
                c.y = -20;
                c.tilt = Math.floor(Math.random() * 10) - 10;
            }
        });
        
        requestAnimationFrame(draw);
    }
    
    draw();
    
    // Arrêter les confettis après 10 secondes
    setTimeout(() => {
        ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }, 10000);
}

/**
 * Affiche l'animation de suspense
 */
function showSuspense() {
    suspenseOverlay.classList.remove('hidden');
    drawButton.disabled = true;
    
    let countdown = 5;
    countdownElement.textContent = countdown;
    
    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            countdownElement.textContent = countdown;
        } else {
            clearInterval(countdownInterval);
            countdownElement.textContent = '🎉';
        }
    }, 1000);
}

/**
 * Lance le tirage au sort avec suspense et effets
 */
function drawWinner() {
    if (candidates.length === 0) {
        alert('Aucun candidat disponible pour le tirage.');
        return;
    }
    
    // Cacher le gagnant précédent
    winnerCard.classList.add('hidden');
    
    // Sélectionner le gagnant immédiatement
    const randomIndex = getRandomInt(0, candidates.length - 1);
    const winner = candidates[randomIndex];
    
    // Afficher le suspense
    showSuspense();
    
    // Sélectionner le gagnant après 5 secondes
    setTimeout(() => {
        // Cacher l'overlay de suspense
        suspenseOverlay.classList.add('hidden');
        
        // Afficher le gagnant avec son numéro dans la liste
        winnerName.textContent = `#${randomIndex + 1} — ${winner}`;
        winnerCard.classList.remove('hidden');
        
        // Lancer les effets de célébration
        createConfetti();
        playCelebrationSound();
        
        // Réactiver le bouton
        drawButton.disabled = false;
        
        // Scroll vers le gagnant
        setTimeout(() => {
            winnerCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    }, 5000);
}

drawButton.addEventListener('click', drawWinner);

