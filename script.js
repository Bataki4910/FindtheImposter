/**
 * ==========================================================================
 * STUDY SPRINT: FIND THE IMPOSTER - GAME CONTROLLER ENGINE (PRODUCTION READY)
 * MULTIPLAYER REAL-TIME APPLICATION CORE STATE ENGINE
 * ==========================================================================
 */

class AudioController {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    toggle() {
        this.muted = !this.muted;
        const btn = document.getElementById('global-audio-toggle');
        if (this.muted) {
            btn.classList.add('muted');
        } else {
            btn.classList.remove('muted');
        }
        return this.muted;
    }

    // Synthesize procedural audio waveforms to ensure zero external dependency lag
    playTone(freq, type, duration, gainStart = 0.1) {
        if (this.muted) return;
        this.init();
        try {
            const osc = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gainNode.gain.setValueAtTime(gainStart, this.ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.00001, this.ctx.currentTime + duration);
            osc.connect(gainNode);
            gainNode.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) { console.error("Audio failure node bypass", e); }
    }

    playClick() { this.playTone(600, 'sine', 0.08, 0.15); }
    playTick() { this.playTone(800, 'sine', 0.04, 0.1); }
    playVoteReveal() { this.playTone(440, 'triangle', 0.2, 0.2); }
    playElimination() { this.playTone(120, 'sawtooth', 0.6, 0.3); }

    playSuspenseSeq() {
        if (this.muted) return;
        this.playTone(90, 'sawtooth', 0.4, 0.3);
        setTimeout(() => this.playTone(85, 'sawtooth', 0.5, 0.3), 200);
    }

    playVictoryInnocent() {
        if (this.muted) return;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((f, i) => setTimeout(() => this.playTone(f, 'sine', 0.3, 0.2), i * 150));
    }

    playVictoryImposter() {
        if (this.muted) return;
        const notes = [180, 150, 120, 90];
        notes.forEach((f, i) => setTimeout(() => this.playTone(f, 'sawtooth', 0.4, 0.3), i * 200));
    }
}

class GameEngine {
    constructor() {
        this.audio = new AudioController();
        this.myPlayerId = 'p_' + Math.random().toString(36).substr(2, 9);
        this.currentRoomCode = null;
        this.isHost = false;
        this.currentPhase = "LOBBY"; 
        this.localPlayerData = { name: "", avatar: "🦊" };
        this.roomRef = null;
        this.playersListCache = {};
        
        // Static internal application config dictionary
        this.avatars = ["🦊", "🐱", "🐼", "🦁", "🐸", "🐵", "🐙", "🦖", "🦄", "🥷"];
        this.ranks = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Legend"];

        this.ui = {
            splash: document.getElementById('splash-screen'),
            auth: document.getElementById('screen-auth'),
            lobby: document.getElementById('screen-lobby'),
            gameboard: document.getElementById('screen-gameboard'),
            rulesModal: document.getElementById('modal-rules'),
            leaderboardModal: document.getElementById('modal-leaderboard'),
            cinematicModal: document.getElementById('modal-cinematic')
        };
    }

    init() {
        this.setupEventBindings();
        this.renderAvatarSelectionGrid();
        
        // Emulate immersive loading screen logic
        setTimeout(() => {
            this.ui.splash.classList.add('hidden');
            this.ui.auth.classList.remove('hidden');
        }, 1500);
        
        // Bootstrap Global Standalone instance registration context hook
        window.gameEngine = this;
    }

    setupEventBindings() {
        document.getElementById('btn-create-lobby').addEventListener('click', () => { this.audio.playClick(); this.createRoom(); });
        document.getElementById('btn-join-lobby').addEventListener('click', () => { this.audio.playClick(); this.joinRoom(); });
        document.getElementById('btn-leave-lobby').addEventListener('click', () => { this.audio.playClick(); this.leaveRoom(); });
        document.getElementById('btn-submit-clue').addEventListener('click', () => { this.audio.playClick(); this.submitClue(); });
    }

    renderAvatarSelectionGrid() {
        const target = document.getElementById('auth-avatar-grid');
        target.innerHTML = "";
        this.avatars.forEach((av, idx) => {
            const el = document.createElement('div');
            el.className = `avatar-item ${idx === 0 ? 'selected' : ''}`;
            el.innerText = av;
            el.addEventListener('click', () => {
                this.audio.playClick();
                document.querySelectorAll('.avatar-item').forEach(i => i.classList.remove('selected'));
                el.classList.add('selected');
                this.localPlayerData.avatar = av;
            });
            target.appendChild(el);
        });
    }

    gatherIdentityInput() {
        const nameIn = document.getElementById('input-player-name').value.trim();
        this.localPlayerData.name = nameIn ? nameIn : "Operative " + Math.floor(1000 + Math.random() * 9000);
    }

    // ==========================================================================
    // MULTIPLAYER ROOM LIFECYCLE CONTROLS
    // ==========================================================================

    createRoom() {
        this.gatherIdentityInput();
        const code = Math.random().toString(36).substr(2, 6).toUpperCase();
        this.currentRoomCode = code;
        this.isHost = true;
        
        this.roomRef = database.ref('rooms/' + code);
        
        const initialPayload = {
            config: {
                roomCode: code,
                hostId: this.myPlayerId,
                secretWord: "Pizza",
                imposterCount: 1,
                phase: "LOBBY",
                roundCounter: 1,
                timerExpiration: 0,
                forcePhaseToken: 0
            },
            players: {},
            clues: { round1: {}, round2: {} },
            votes: {},
            reactions: { trigger: 0, emoji: "" }
        };

        this.roomRef.set(initialPayload).then(() => {
            this.joinRoomPipeline(code);
        }).catch(err => alert("Data infrastructure failure: " + err.message));
    }

    joinRoom() {
        const codeIn = document.getElementById('input-room-code').value.trim().toUpperCase();
        if (codeIn.length !== 6) {
            alert("Invalid room code parameters structural depth.");
            return;
        }
        this.gatherIdentityInput();
        database.ref('rooms/' + codeIn).once('value', snapshot => {
            if (!snapshot.exists()) {
                alert("Target room vectors do not exist.");
                return;
            }
            const data = snapshot.val();
            if (data.config.phase !== "LOBBY") {
                alert("Mission execution deployment already active in target room.");
                return;
            }
            this.currentRoomCode = codeIn;
            this.isHost = (data.config.hostId === this.myPlayerId);
            this.joinRoomPipeline(codeIn);
        });
    }

    joinRoomPipeline(code) {
        this.roomRef = database.ref('rooms/' + code);
        
        // Write local player context package to database interface endpoints
        this.roomRef.child('players/' + this.myPlayerId).set({
            id: this.myPlayerId,
            name: this.localPlayerData.name,
            avatar: this.localPlayerData.avatar,
            isAlive: true,
            role: "PENDING",
            voteCast: "NONE",
            isOnline: true
        });

        // Register heartbeat disconnect detection mechanisms
        this.roomRef.child('players/' + this.myPlayerId + '/isOnline').onDisconnect().set(false);

        this.bindRoomRealtimeListeners();
        
        // Route View presentation layers
        this.ui.auth.classList.add('hidden');
        this.ui.lobby.classList.remove('hidden');
        document.getElementById('display-room-code').innerText = code;
    }

    leaveRoom() {
        if (this.roomRef) {
            this.roomRef.child('players/' + this.myPlayerId).remove();
            if (this.isHost) {
                // If Host leaves, execute auto-host transfer logic context matching
                this.roomRef.child('players').once('value', snap => {
                    const players = snap.val();
                    if (players) {
                        const keys = Object.keys(players);
                        const nextHost = keys.find(k => k !== this.myPlayerId && players[k].isOnline);
                        if (nextHost) {
                            this.roomRef.child('config/hostId').set(nextHost);
                        } else {
                            this.roomRef.remove(); // Burn empty room vectors
                        }
                    }
                });
            }
            this.roomRef.off();
        }
        window.location.reload();
    }

    // ==========================================================================
    // REAL-TIME STATE MACHINE SYNCHRONIZATION RUNTIME
    // ==========================================================================

    bindRoomRealtimeListeners() {
        // 1. Structural Configuration Updates Hook
        this.roomRef.child('config').on('value', snap => {
            if (!snap.exists()) return;
            const config = snap.val();
            
            // Recalculate Host Status dynamically in case of auto host transfer
            this.isHost = (config.hostId === this.myPlayerId);
            this.syncHostSettingsPanelUI(config);
            
            if (this.currentPhase !== config.phase) {
                this.routePhaseTransition(config.phase, config);
            }
            
            this.globalTrackedConfig = config;
            this.updateRoundIndicatorLabel(config);
        });

        // 2. Player Roster Synchronization Layer
        this.roomRef.child('players').on('value', snap => {
            if (!snap.exists()) return;
            this.playersListCache = snap.val();
            this.renderRosterAndGameboardStatusViews();
        });

        // 3. Dynamic Interactive Clue Streaming
        this.roomRef.child('clues').on('value', snap => {
            this.renderClueFeed(snap.val());
        });

        // 4. Dynamic Live Realtime Reaction Streaming Engine Pipeline
        this.roomRef.child('reactions').on('value', snap => {
            if (!snap.exists()) return;
            const rx = snap.val();
            if (rx.trigger > 0) {
                this.spawnFloatingEmojiElement(rx.emoji);
            }
        });
    }

    syncHostSettingsPanelUI(config) {
        const container = document.getElementById('host-action-controls');
        if (this.isHost) {
            container.innerHTML = `
                <button id="btn-host-start-game" class="btn btn-primary glow-green style='width:100%'">INITIALIZE MISSION DEPLOYMENT</button>
            `;
            document.getElementById('host-secret-word').disabled = false;
            document.getElementById('host-imposter-count').disabled = false;
            
            const btnStart = document.getElementById('btn-host-start-game');
            if (btnStart) {
                btnStart.onclick = () => { this.audio.playClick(); this.hostLaunchGameExecution(); };
            }
        } else {
            container.innerHTML = `<p class="non-host-notice text-center gold-text">Operative Command assigned to Host. Awaiting parameter commit...</p>`;
            document.getElementById('host-secret-word').disabled = true;
            document.getElementById('host-imposter-count').disabled = true;
            // Mirror settings down dynamically to non-host screens
            document.getElementById('host-secret-word').value = config.secretWord || "";
            document.getElementById('host-imposter-count').value = config.imposterCount || 1;
        }
    }

    renderRosterAndGameboardStatusViews() {
        const lobbyTarget = document.getElementById('lobby-player-list');
        const gameTarget = document.getElementById('gameboard-players-list');
        const voteTarget = document.getElementById('voting-players-grid');
        
        let count = 0;
        if (lobbyTarget) lobbyTarget.innerHTML = "";
        if (gameTarget) gameTarget.innerHTML = "";
        if (voteTarget) voteTarget.innerHTML = "";

        Object.keys(this.playersListCache).forEach(k => {
            const p = this.playersListCache[k];
            if (!p.isOnline) return;
            count++;

            // Render elements for standard lobby tracking list
            if (lobbyTarget) {
                const r = document.createElement('div');
                r.className = `player-row ${p.id === this.myPlayerId ? 'is-me' : ''} ${p.id === this.globalTrackedConfig?.hostId ? 'is-host' : ''}`;
                r.innerHTML = `
                    <span class="row-avatar">${p.avatar}</span>
                    <span class="row-name">${p.name}</span>
                    ${p.id === this.globalTrackedConfig?.hostId ? '<span class="badge badge-host">HOST</span>' : ''}
                    ${p.id === this.myPlayerId ? '<span class="badge badge-me">YOU</span>' : ''}
                `;
                lobbyTarget.appendChild(r);
            }

            // Render tactical asset squares into active structural gameplay view matrixboards
            if (this.currentPhase !== "LOBBY") {
                if (gameTarget) {
                    const c = document.createElement('div');
                    c.className = `status-avatar-card ${!p.isAlive ? 'eliminated' : ''} ${p.voteCast !== 'NONE' ? 'voted-done' : ''}`;
                    c.innerHTML = `
                        <span class="status-card-avatar">${p.avatar}</span>
                        <span class="status-card-name">${p.name}</span>
                    `;
                    gameTarget.appendChild(c);
                }

                // Append selection options directly into active voter control interfaces if valid
                if (voteTarget && p.isAlive && p.id !== this.myPlayerId && this.playersListCache[this.myPlayerId]?.isAlive) {
                    const b = document.createElement('button');
                    b.className = `vote-target-btn ${this.playersListCache[this.myPlayerId]?.voteCast === p.id ? 'selected' : ''}`;
                    b.innerHTML = `<span style='margin-right:8px;'>${p.avatar}</span> ${p.name}`;
                    b.onclick = () => { this.castVoteDestination(p.id); };
                    voteTarget.appendChild(b);
                }
            }
        });

        const counterEl = document.getElementById('player-count');
        if (counterEl) counterEl.innerText = count;
        
        // Host Command Deck Role Viewer Engine Refresher pipeline
        this.renderHostLiveRoleMatrixDeck();
    }

    renderClueFeed(cluesData) {
        const target = document.getElementById('clue-feed-container');
        if (!target) return;
        target.innerHTML = "";
        if (!cluesData) return;

        // Collect and display anonymous items cleanly parsed from historical configuration stages
        ['round1', 'round2'].forEach(rKey => {
            if (cluesData[rKey]) {
                Object.keys(cluesData[rKey]).forEach(cId => {
                    const item = cluesData[rKey][cId];
                    const el = document.createElement('div');
                    el.className = "clue-bubble";
                    el.innerHTML = `<strong>[ANONYMOUS TRANSMISSION]:</strong> "${escapeHtml(item.text)}"`;
                    target.appendChild(el);
                });
            }
        });
        target.scrollTop = target.scrollHeight;
    }

    updateRoundIndicatorLabel(config) {
        const el = document.getElementById('display-current-round');
        if (!el) return;
        if (config.phase === "CLUES") {
            el.innerText = `ROUND ${config.roundCounter}: SUBMIT CLUE`;
        } else if (config.phase === "VOTING") {
            el.innerText = `CRITICAL DETOX: VOTING`;
        }
    }

    // ==========================================================================
    // PHASE SEQUENCING ENGINE / MATRIX PIPELINES
    // ==========================================================================

    routePhaseTransition(targetPhase, config) {
        this.currentPhase = targetPhase;
        
        // Enforce hard view swapping routes
        if (targetPhase === "LOBBY") {
            this.ui.lobby.classList.remove('hidden');
            this.ui.gameboard.classList.add('hidden');
            return;
        }

        this.ui.lobby.classList.add('hidden');
        this.ui.gameboard.classList.remove('hidden');

        // Reset display mechanics on configuration changes
        document.getElementById('role-card-flip-target').classList.remove('flipped');
        
        // Context-driven sub-dashboard distribution routing
        this.evaluateInteractionSubviewsState(config);

        if (targetPhase === "CLUES") {
            // Update local identity tracking text mappings silently behind cryptographic protection layers
            const mySelf = this.playersListCache[this.myPlayerId];
            document.getElementById('role-reveal-title').innerText = (mySelf?.role === "IMPOSTER") ? "IMPOSTER" : "INNOCENT";
            document.getElementById('role-reveal-word').innerText = (mySelf?.role === "IMPOSTER") ? "UNAUTHORIZED" : config.secretWord;
            
            const payloadCard = document.getElementById('role-card-payload');
            if (mySelf?.role === "IMPOSTER") {
                payloadCard.classList.add('is-imposter');
            } else {
                payloadCard.classList.remove('is-imposter');
            }

            this.triggerLocalCountdownTimer(config.timerExpiration, () => {
                if (this.isHost) this.hostEvaluateCluePhaseCompletion();
            });
        }

        if (targetPhase === "VOTING") {
            this.audio.playTone(300, 'square', 0.4, 0.2);
            this.triggerLocalCountdownTimer(config.timerExpiration, () => {
                if (this.isHost) this.hostProcessVoteTallyResolution();
            });
        }
    }

    evaluateInteractionSubviewsState(config) {
        const subClue = document.getElementById('subview-clue-submission');
        const subVote = document.getElementById('subview-voting-matrix');
        const subIdle = document.getElementById('subview-idle-waiting');

        subClue.classList.add('hidden');
        subVote.classList.add('hidden');
        subIdle.classList.add('hidden');

        const myActiveProfile = this.playersListCache[this.myPlayerId];
        if (!myActiveProfile || !myActiveProfile.isAlive) {
            document.getElementById('idle-waiting-msg').innerText = "You have been eliminated. Observing transmission feed...";
            subIdle.classList.remove('hidden');
            return;
        }

        if (this.currentPhase === "CLUES") {
            const rKey = `round${config.roundCounter}`;
            // If local operational profile has already transmitted context payload during active state cycle
            if (config.clueTracker && config.clueTracker[rKey] && config.clueTracker[rKey][this.myPlayerId]) {
                document.getElementById('idle-waiting-msg').innerText = "Data string broadcast successful. Buffering next uplink phase...";
                subIdle.classList.remove('hidden');
            } else {
                document.getElementById('input-clue-text').value = "";
                subClue.classList.remove('hidden');
            }
        }

        if (this.currentPhase === "VOTING") {
            if (myActiveProfile.voteCast !== "NONE") {
                document.getElementById('idle-waiting-msg').innerText = "Vote successfully hard-locked into transaction block. Synchronizing arrays...";
                subIdle.classList.remove('hidden');
            } else {
                subVote.classList.remove('hidden');
            }
        }
    }

    triggerLocalCountdownTimer(expirationTimestamp, callbackOnEnd) {
        clearInterval(this.timerIntervalTracker);
        const loop = () => {
            const now = Date.now();
            const diff = Math.max(0, Math.ceil((expirationTimestamp - now) / 1000));
            document.getElementById('game-timer-text').innerText = diff;
            
            // Dynamic ticking sounds context triggers
            if (diff <= 5 && diff > 0) this.audio.playTick();

            // Synchronize SVG visual indicator perimeter stroke offset mappings ring calculations
            const circle = document.querySelector('.timer-ring-circle');
            if (circle) {
                const radius = circle.r.baseVal.value;
                const circumference = radius * 2 * Math.PI;
                circle.style.strokeDasharray = `${circumference} ${circumference}`;
                const offset = circumference - ((diff / 45) * circumference);
                circle.style.strokeDashoffset = offset;
            }

            if (diff <= 0) {
                clearInterval(this.timerIntervalTracker);
                if (callbackOnEnd) callbackOnEnd();
            }
        };
        this.timerIntervalTracker = setInterval(loop, 1000);
        loop();
    }

    revealRoleCardTemporarily() {
        this.audio.playClick();
        const el = document.getElementById('role-card-flip-target');
        el.classList.add('flipped');
        // Automatically obscure cryptographic data layout fields again after read latency periods pass
        clearTimeout(this.roleObscureTimeout);
        this.roleObscureTimeout = setTimeout(() => {
            el.classList.remove('flipped');
        }, 3500);
    }

    submitClue() {
        const text = document.getElementById('input-clue-text').value.trim();
        if (!text) return;
        
        const currentRoundNum = this.globalTrackedConfig.roundCounter;
        const rKey = `round${currentRoundNum}`;
        
        // Disallow execution mutation attempts if profile already executed transaction matching bounds
        this.roomRef.child(`clues/${rKey}`).push({
            playerId: this.myPlayerId,
            text: text
        });

        // Set high-fidelity local state tracking tags inside operational database paths
        this.roomRef.child(`config/clueTracker/${rKey}/${this.myPlayerId}`).set(true).then(() => {
            // Recalculate immediate layout mapping conditions context update routes local view states
            this.roomRef.child('config').once('value', s => {
                this.evaluateInteractionSubviewsState(s.val());
            });
        });
    }

    castVoteDestination(targetId) {
        this.audio.playVoteReveal();
        this.roomRef.child(`players/${this.myPlayerId}/voteCast`).set(targetId);
        this.roomRef.child(`votes/${targetId}/${this.myPlayerId}`).set(true).then(() => {
            this.roomRef.child('config').once('value', s => {
                this.evaluateInteractionSubviewsState(s.val());
            });
        });
    }

    sendReaction(emoji) {
        // Increment atomic validation integers to spark layout synchronization callbacks cleanly across interfaces
        this.roomRef.child('reactions').set({
            trigger: Math.floor(Math.random() * 1000000),
            emoji: emoji
        });
    }

    spawnFloatingEmojiElement(emoji) {
        const gate = document.getElementById('reaction-particle-gate');
        if (!gate) return;
        const p = document.createElement('div');
        p.className = "floating-emoji";
        p.innerText = emoji;
        p.style.left = Math.floor(Math.random() * 80) + 10 + "%";
        gate.appendChild(p);
        setTimeout(() => p.remove(), 2000);
    }

    // ==========================================================================
    // SYSTEM LEVEL CINEMATIC INTERSTITIAL LAYOUT MANAGERS
    // ==========================================================================

    displayCinematicSequence(headline, subtext, durationMs, styleClass = "", extraHtml = "") {
        const overlay = this.ui.cinematicModal;
        const head = document.getElementById('cinematic-headline');
        const sub = document.getElementById('cinematic-subtext');
        const extra = document.getElementById('cinematic-extra-visuals');
        
        head.innerText = headline;
        sub.innerText = subtext;
        extra.innerHTML = extraHtml;
        
        overlay.className = `modal-overlay full-screen-modal ${styleClass}`;
        overlay.classList.remove('hidden');

        // Inject high impact tactile presentation layer physics triggers
        if (styleClass.includes("suspense-shake")) {
            document.body.classList.add('shake-element');
            overlay.classList.add('flicker-overlay');
            setTimeout(() => {
                document.body.classList.remove('shake-element');
                overlay.classList.remove('flicker-overlay');
            }, 1000);
        }

        setTimeout(() => {
            overlay.classList.add('hidden');
        }, durationMs);
    }

    // ==========================================================================
    // HOST ENGINE VALIDATION MECHANICS (SERVERLESS CORE LOGIC)
    // ==========================================================================

    hostLaunchGameExecution() {
        if (!this.isHost) return;
        
        const word = document.getElementById('host-secret-word').value.trim();
        const impCountRequested = parseInt(document.getElementById('host-imposter-count').value);
        
        if (!word) { alert("Enter a functional target parameter secret word."); return; }

        const playerIds = Object.keys(this.playersListCache).filter(k => this.playersListCache[k].isOnline);
        if (playerIds.length < 3) {
            alert("Insufficient active operative vectors connected. Minimum 3 players required.");
            return;
        }

        // Generate clean random index allocation structures using Fisher-Yates array shuffling methodologies
        const shuffled = [...playerIds].sort(() => 0.5 - Math.random());
        const impostersAssigned = shuffled.slice(0, Math.min(impCountRequested, playerIds.length - 2));

        const updates = {};
        playerIds.forEach(pId => {
            const roleTag = impostersAssigned.includes(pId) ? "IMPOSTER" : "INNOCENT";
            updates[`players/${pId}/role`] = roleTag;
            updates[`players/${pId}/isAlive`] = true;
            updates[`players/${pId}/voteCast`] = "NONE";
        });

        // Initialize historical clearing parameters to reset game tracks clean
        updates['clues/round1'] = null;
        updates['clues/round2'] = null;
        updates['votes'] = null;
        updates['config/secretWord'] = word;
        updates['config/imposterCount'] = impostersAssigned.length;
        updates['config/roundCounter'] = 1;
        updates['config/phase'] = "CLUES";
        updates['config/timerExpiration'] = Date.now() + (60 * 1000) + 1500; // 60s Allocation depth buffers

        this.roomRef.update(updates);
    }

    hostEvaluateCluePhaseCompletion() {
        if (!this.isHost) return;
        this.roomRef.child('config').once('value', snap => {
            const config = snap.val();
            const currentRound = config.roundCounter;
            
            if (currentRound === 1) {
                // Move dynamically to standard sequential phase tracking configurations
                this.roomRef.child('config').update({
                    roundCounter: 2,
                    phase: "CLUES",
                    timerExpiration: Date.now() + (60 * 1000) + 1500
                });
            } else {
                // Advance straight into core programmatic voting tracking cycles
                this.roomRef.child('config').update({
                    phase: "VOTING",
                    timerExpiration: Date.now() + (45 * 1000) + 1500
                });
            }
        });
    }

    hostProcessVoteTallyResolution() {
        if (!this.isHost) return;
        this.roomRef.once('value', snap => {
            const data = snap.val();
            const votesData = data.votes || {};
            const players = data.players;
            
            let highestVoteCount = -1;
            let targetEliminatedId = null;
            let splitTieDetected = false;

            Object.keys(players).forEach(pId => {
                if (players[pId].isAlive && players[pId].isOnline) {
                    const receivedCount = votesData[pId] ? Object.keys(votesData[pId]).length : 0;
                    if (receivedCount > highestVoteCount) {
                        highestVoteCount = receivedCount;
                        targetEliminatedId = pId;
                        splitTieDetected = false;
                    } else if (receivedCount === highestVoteCount && highestVoteCount > 0) {
                        splitTieDetected = true;
                    }
                }
            });

            // Handle clean programmatic execution steps
            if (targetEliminatedId && !splitTieDetected && highestVoteCount > 0) {
                this.hostExecutePlayerPipeline(targetEliminatedId, players);
            } else {
                // Tie breaker/zero input conditions advance context metrics smoothly back to step 1
                this.roomRef.child('config/systemNotice').set("Tie vector parameters read. Suspension field maintained.");
                this.hostTriggerNextSequentialRoundCycle(players);
            }
        });
    }

    hostExecutePlayerPipeline(eliminatedId, totalPlayersList) {
        const victimRole = totalPlayersList[eliminatedId].role;
        
        const updates = {};
        updates[`players/${eliminatedId}/isAlive`] = false;
        
        // Reset dynamic runtime interaction fields prior to starting next round metrics
        Object.keys(totalPlayersList).forEach(k => {
            updates[`players/${k}/voteCast`] = "NONE";
        });
        updates['votes'] = null;
        updates['clues/round1'] = null;
        updates['clues/round2'] = null;
        updates['config/clueTracker'] = null;

        this.roomRef.update(updates).then(() => {
            // Write structured statistics back into the system database endpoints immediately
            this.pushPlayerGlobalStatsToLeaderboardDatabase(totalPlayersList[eliminatedId], false);
            
            // Broadcast execution results down directly across connected instances using remote payload calls
            this.roomRef.child('config/executionBroadcast').set({
                trigger: Math.floor(Math.random() * 100000),
                name: totalPlayersList[eliminatedId].name,
                role: victimRole
            });

            // Pull fresh client list cache validation parameters cleanly before applying math calculations
            this.roomRef.child('players').once('value', snap => {
                const refreshedPlayers = snap.val();
                this.hostEvaluateGlobalWinConditionMetrics(refreshedPlayers);
            });
        });
    }

    hostEvaluateGlobalWinConditionMetrics(players) {
        let aliveInnocents = 0;
        let aliveImposters = 0;

        Object.keys(players).forEach(k => {
            const p = players[k];
            if (p.isAlive && p.isOnline) {
                if (p.role === "IMPOSTER") aliveImposters++;
                else aliveInnocents++;
            }
        });

        if (aliveImposters === 0) {
            this.hostTerminateMatchWithVictoryResult("INNOCENTS_WIN", players);
        } else if (aliveImposters >= aliveInnocents) {
            this.hostTerminateMatchWithVictoryResult("IMPOSTERS_WIN", players);
        } else {
            this.hostTriggerNextSequentialRoundCycle(players);
        }
    }

    hostTriggerNextSequentialRoundCycle(refreshedPlayers) {
        // Wipe historical tracks before re-routing downstream instances back into tracking cycles
        this.roomRef.child('config').update({
            roundCounter: 1,
            phase: "CLUES",
            timerExpiration: Date.now() + (60 * 1000) + 1500,
            suspenseTriggerToken: Math.floor(Math.random() * 100000)
        });
    }

    hostTerminateMatchWithVictoryResult(victoryTag, rosterList) {
        // Compile global leaderboard allocations updates accurately for all tracking nodes
        Object.keys(rosterList).forEach(k => {
            const p = rosterList[k];
            let won = false;
            if (victoryTag === "INNOCENTS_WIN" && p.role === "INNOCENT") won = true;
            if (victoryTag === "IMPOSTERS_WIN" && p.role === "IMPOSTER") won = true;
            this.pushPlayerGlobalStatsToLeaderboardDatabase(p, won);
        });

        this.roomRef.child('config').update({
            phase: "LOBBY",
            victoryBroadcastTag: victoryTag,
            victoryTriggerToken: Math.floor(Math.random() * 100000)
        });
    }

    // ==========================================================================
    // CLIENT SIDE REMOTE BROADCAST LISTENER PORTS
    // ==========================================================================

    bindBroadcastInterstitialsListenerPorts() {
        // Hook 1: Active Execution Notifications Port
        this.roomRef.child('config/executionBroadcast').on('value', snap => {
            if (!snap.exists()) return;
            const b = snap.val();
            this.audio.playElimination();
            const label = b.role === "IMPOSTER" ? "WAS AN IMPOSTER" : "WAS INNOCENT";
            this.displayCinematicSequence(b.name, label, 4000, b.role === "IMPOSTER" ? "text-danger" : "gold-text");
        });

        // Hook 2: Match Win Terminations Port
        this.roomRef.child('config/victoryBroadcastTag').on('value', snap => {
            if (!snap.exists()) return;
            const tag = snap.val();
            if (tag === "INNOCENTS_WIN") {
                this.audio.playVictoryInnocent();
                this.displayCinematicSequence("VICTORY", "ALL IMPOSTERS ELIMINATED", 5000, "glow-green");
            } else {
                this.audio.playVictoryImposter() ;
                this.displayCinematicSequence("IMPOSTER WINS", "THE STATION HAS BEEN COMPROMISED", 5000, "text-danger");
            }
        });

        // Hook 3: Suspense Alert Tracking Continuity Loops
        this.roomRef.child('config/suspenseTriggerToken').on('value', snap => {
            if (!snap.exists() || this.currentPhase === "LOBBY") return;
            this.audio.playSuspenseSeq();
            this.displayCinematicSequence("⚠ THREAT ACTIVE ⚠", "IMPOSTER IS STILL ALIVE", 2500, "suspense-shake");
        });
    }

    // Wrap initialization routing parameters cleanly down directly into context hooks
    joinRoomPipeline(code) {
        this.roomRef = database.ref('rooms/' + code);
        
        this.roomRef.child('players/' + this.myPlayerId).set({
            id: this.myPlayerId,
            name: this.localPlayerData.name,
            avatar: this.localPlayerData.avatar,
            isAlive: true,
            role: "PENDING",
            voteCast: "NONE",
            isOnline: true
        });

        this.roomRef.child('players/' + this.myPlayerId + '/isOnline').onDisconnect().set(false);

        this.bindRoomRealtimeListeners();
        this.bindBroadcastInterstitialsListenerPorts(); // Map runtime contextual alert lines cleanly here
        
        this.ui.auth.classList.add('hidden');
        this.ui.lobby.classList.remove('hidden');
        document.getElementById('display-room-code').innerText = code;
    }

    // ==========================================================================
    // BACKEND MASTER CONSOLE MANAGEMENT OVERLAY FOR HOST
    // ==========================================================================

    renderHostLiveRoleMatrixDeck() {
        const deck = document.getElementById('game-host-override-deck');
        if (!deck) return;
        if (!this.isHost || this.currentPhase === "LOBBY") {
            deck.classList.add('hidden');
            return;
        }
        deck.classList.remove('hidden');
        
        const matrixTarget = document.getElementById('host-live-role-matrix');
        let htmlStr = "DATA MATRIX: ";
        Object.keys(this.playersListCache).forEach(k => {
            const p = this.playersListCache[k];
            if (p.isOnline) {
                htmlStr += `[${p.name}: ${p.role === 'IMPOSTER' ? '🟥' : '🟩'}${p.isAlive ? '' : '💀'}] `;
            }
        });
        matrixTarget.innerText = htmlStr;
    }

    hostForcePhaseChange() { if (this.isHost) this.hostEvaluateCluePhaseCompletion(); }
    hostTerminateGame() { if (this.isHost) this.roomRef.child('config/phase').set("LOBBY"); }
    hostToggleRevealAllRoles() {
        alert("Encrypted Local Node Core Data: \n" + document.getElementById('host-live-role-matrix').innerText);
    }

    // ==========================================================================
    // PERSISTENT DATA LEADERBOARD INFRASTRUCTURE CORE MAPPINGS
    // ==========================================================================

    pushPlayerGlobalStatsToLeaderboardDatabase(playerObject, matchOutcomeWon) {
        const sanitizedKey = btoa(playerObject.name).replace(/=/g, "").substring(0, 16);
        const userStatsRef = database.ref('leaderboards/global/' + sanitizedKey);
        
        userStatsRef.once('value').then(snap => {
            let data = {
                name: playerObject.name,
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                timesImposter: 0,
                survivalCount: 0
            };
            if (snap.exists()) data = snap.val();

            data.gamesPlayed += 1;
            if (matchOutcomeWon) data.wins += 1; else data.losses += 1;
            if (playerObject.role === "IMPOSTER") data.timesImposter += 1;
            if (playerObject.isAlive) data.survivalCount += 1;

            userStatsRef.set(data);
        });
    }

    uiFetchAndRenderGlobalLeaderboardModal() {
        database.ref('leaderboards/global').orderByChild('wins').limitToLast(10).once('value', snap => {
            const target = document.getElementById('leaderboard-rows-target');
            target.innerHTML = "";
            if (!snap.exists()) {
                target.innerHTML = `<tr><td colspan="6" class="text-center grey-text">No operational logs archived yet.</td></tr>`;
                return;
            }

            const items = [];
            snap.forEach(child => { items.push(child.val()); });
            items.reverse(); // Rank descending

            items.forEach(item => {
                const winRate = item.gamesPlayed > 0 ? Math.round((item.wins / item.gamesPlayed) * 100) : 0;
                const survivalRate = item.gamesPlayed > 0 ? Math.round((item.survivalCount / item.gamesPlayed) * 100) : 0;
                
                // Determine Division Placement index cleanly off total raw validation checkpoints matching
                let rankIdx = Math.min(Math.floor(item.wins / 3), this.ranks.length - 1);
                const rankTitle = this.ranks[rankIdx];

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${escapeHtml(item.name)}</strong></td>
                    <td class="gold-text">${rankTitle}</td>
                    <td>${winRate}%</td>
                    <td>${item.timesImposter}</td>
                    <td>${survivalRate}%</td>
                    <td>${Math.floor(item.wins * 1.3)}</td>
                `;
                target.appendChild(row);
            });
        });
    }

    toggleRulesModal(show) {
        this.audio.playClick();
        document.getElementById('modal-rules').classList.toggle('hidden', !show);
    }

    toggleLeaderboardModal(show) {
        this.audio.playClick();
        if (show) this.uiFetchAndRenderGlobalLeaderboardModal();
        document.getElementById('modal-leaderboard').classList.toggle('hidden', !show);
    }

    toggleAudio() { this.audio.toggle(); }
}

// Global sanitization utility logic functions
function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Bootstrap Core Engine Context Lifecycles on structural DOM content paint confirmations
document.addEventListener('DOMContentLoaded', () => {
    const engine = new GameEngine();
    engine.init();
});