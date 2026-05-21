// Variables globales
let candidates = [];
let participantCount = 0;

const IGNORED_NAMES = new Set(['nom', 'profil']);

function isProfileUrl(value) {
    const s = String(value).trim().toLowerCase();
    return s.startsWith('http') || s.includes('facebook.com');
}

// Éléments du DOM
const participantCountElement = document.getElementById('participant-count');
const listButton = document.getElementById('list-button');
const drawButton = document.getElementById('draw-button');
const participantsCard = document.getElementById('participants-card');
const participantsList = document.getElementById('participants-list');
const closeListButton = document.getElementById('close-list-button');
const winnerCard = document.getElementById('winner-card');
const winnerName = document.getElementById('winner-name');
const winnerSubtitle = document.getElementById('winner-subtitle');
const suspenseOverlay = document.getElementById('suspense-overlay');
const countdownElement = document.getElementById('countdown');
const confettiCanvas = document.getElementById('confetti-canvas');

/**
 * Charge automatiquement le fichier Excel au chargement de la page
 */
async function loadExcelFile() {
    const params = new URLSearchParams(window.location.search);
    const excelFile = params.get('file') || 'Pronostic3.xlsx';

    try {
        const response = await fetch(excelFile);
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Prendre la première feuille du classeur
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convertir la feuille en tableau de tableaux
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            defval: '' // Valeur par défaut pour les cellules vides
        });
        
        // Extraire les candidats
        extractCandidates(jsonData);
        
    } catch (error) {
        console.error('Erreur lors du chargement du fichier Excel:', error);
        alert(`Erreur lors du chargement de ${excelFile}.\n\nAssurez-vous que:\n1. Le fichier Excel existe (exports/ ou Pronostic3.xlsx)\n2. Vous ouvrez la page via un serveur local\n\nExemple : http://localhost:8000/?file=exports/participants_XXX.xlsx\n\nServeur : python -m http.server 8000`);
    }
}

// Charger le fichier Excel au chargement de la page
window.addEventListener('DOMContentLoaded', () => {
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
 * Extrait les candidats valides du tableau Excel
 * @param {Array} data - Tableau de données Excel
 */
function extractCandidates(data) {
    candidates = [];
    
    // Parcourir toutes les lignes
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        
        // Parcourir toutes les colonnes de la ligne
        for (let j = 0; j < row.length; j++) {
            const cell = row[j];
            
            // Vérifier si la cellule contient une valeur valide
            if (cell && typeof cell === 'string' && cell.trim() !== '') {
                const trimmedName = cell.trim();
                if (IGNORED_NAMES.has(trimmedName.toLowerCase()) || isProfileUrl(trimmedName)) {
                    continue;
                }
                // Éviter les doublons
                if (!candidates.includes(trimmedName)) {
                    candidates.push(trimmedName);
                }
            } else if (cell && typeof cell === 'number') {
                // Gérer les nombres (convertir en string)
                const name = String(cell).trim();
                if (name !== '' && !IGNORED_NAMES.has(name.toLowerCase()) && !isProfileUrl(name) && !candidates.includes(name)) {
                    candidates.push(name);
                }
            }
        }
    }
    
    // Mettre à jour l'interface
    updateParticipantCount();
    
    // Activer les boutons si on a des candidats
    if (candidates.length > 0) {
        drawButton.disabled = false;
        listButton.disabled = false;
        winnerCard.classList.add('hidden');
    } else {
        drawButton.disabled = true;
        listButton.disabled = true;
        alert('Aucun candidat valide trouvé dans le fichier Excel.');
    }
}

/**
 * Met à jour l'affichage du nombre de participants
 */
function updateParticipantCount() {
    participantCount = candidates.length;
    participantCountElement.textContent = participantCount;
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

/**
 * Affiche la liste des participants
 */
function showParticipantsList() {
    if (candidates.length === 0) {
        alert('Aucun participant disponible.');
        return;
    }
    
    // Vider la liste actuelle
    participantsList.innerHTML = '';
    
    // Créer les éléments de la liste
    candidates.forEach((participant, index) => {
        const participantItem = document.createElement('div');
        participantItem.className = 'participant-item';
        participantItem.textContent = `${index + 1}. ${participant}`;
        participantsList.appendChild(participantItem);
    });
    
    // Afficher la carte
    participantsCard.classList.remove('hidden');
    
    // Scroll vers la liste
    participantsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Cache la liste des participants
 */
function hideParticipantsList() {
    participantsCard.classList.add('hidden');
}

// Écouter les clics sur les boutons
listButton.addEventListener('click', showParticipantsList);
closeListButton.addEventListener('click', hideParticipantsList);
drawButton.addEventListener('click', drawWinner);

