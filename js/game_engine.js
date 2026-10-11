/**
 * =========================================================================
 * ⛩️ SENGOKU CONQUERORS 1.4 - MOTOR DE JUEGO OFICIAL (GAME ENGINE)
 * =========================================================================
 * 
 * Basado estrictamente en Ruleset.pdf v1.4:
 * - Clanes: Rojo, Amarillo, Azul, Verde.
 * - Mando aleatorio inicial, orden de turno y desempates.
 * - Pre-Ronda (Turno 0): Fortaleza inicial + escolta.
 * - Reclutamiento (+1 por Aldea).
 * - Refuerzos (hasta 3 tropas por celda).
 * - Campaña (gasta 2 de mano, no adyacente a otro Shiro, no en Aldea/Torii).
 * - Maniobra:
 *   * Guarnición fija (no puede salir del castillo).
 *   * Asedio estricto: requiere al menos 2 tropas aliadas adyacentes de flanqueo.
 * - Combate por Mayorías (Regla 1.4):
 *   * Cantidades iguales: bajas mutuas completas.
 *   * Mayoría: pierde 1 ficha menos que la minoría (B - 1).
 *   * Bendición del Torii: evita 1 baja por ronda.
 * - 4 Hazañas Oficiales: Sangre y Acero, Asolador, Señor de Castillos, Maestro Táctico.
 * - Ronda Final tras 3 Hazañas y desempate por Ficha de Mando.
 * - Telemetría completa para análisis de balance.
 * =========================================================================
 */

// =========================================================================
// ⚙️ 1. REGLAMENTO CONFIGURABLE
// =========================================================================
const CONFIGURABLE_RULES = {
    STARTING_RESERVE_TROOPS: 28,       // Tropas iniciales en reserva por jugador
    STARTING_RESERVE_SHIROS: 6,        // Castillos iniciales en reserva por jugador
    REINFORCE_DRAW_BASE: 3,            // Tropas tomadas de reserva a la mano por turno
    ALDEA_REINFORCE_BONUS: 1,          // Tropa extra de leva si controlas una Aldea
    CAMPAIGN_TROOP_COST: 2,            // Ashigaru de mano gastados para fundar un Castillo
    MAX_MOVES_PER_TURN: 3,             // Máximo de tropas a mover por turno (Movilidad)
    MAX_TROOPS_PER_HEX: 3,             // Límite de tropas de la misma casa por celda
    FEATS_TO_WIN: 3                    // Hazañas necesarias para ganar la carrera (detona Ronda Final)
};

// =========================================================================
// 🏯 2. DEFINICIÓN DE CLANES (RGBY: Red, Green, Blue, Yellow)
// =========================================================================
const CLANS = {
    rojo:     { id: 'rojo',     initial: 'R', name: 'Clan Rojo',     short: 'Rojo (R)',     color: '#c52828', accent: '#ffd700', text: '#ffffff' },
    verde:    { id: 'verde',    initial: 'G', name: 'Clan Verde',    short: 'Verde (G)',    color: '#237a3b', accent: '#a9dfbf', text: '#ffffff' },
    azul:     { id: 'azul',     initial: 'B', name: 'Clan Azul',     short: 'Azul (B)',     color: '#1d5ea8', accent: '#8ec5fc', text: '#ffffff' },
    amarillo: { id: 'amarillo', initial: 'Y', name: 'Clan Amarillo', short: 'Amarillo (Y)', color: '#e5b700', accent: '#222222', text: '#111111' }
};

// =========================================================================
// 🏆 3. LAS 4 HAZAÑAS OFICIALES DEL SHOGUN (Carrera Abierta a Todos los Clanes)
// =========================================================================
const FEATS = [
    {
        id: 'sangre_y_acero',
        name: 'Sangre y Acero',
        icon: '⚔️',
        desc: 'Obtén 6 Estandartes en combates ganados por mayoría.',
        check: (p, g) => p.banners >= 6
    },
    {
        id: 'dominio_feudal',
        name: 'Dominio Feudal',
        icon: '⛩️',
        desc: 'Controla simultáneamente el Torii (#67) y al menos 1 Aldea (#18 o #116) sin disputa enemiga al final de una ronda.',
        check: (p, g) => g.hasExclusivePoiControl(p.id, 'torii') >= 1 && g.hasExclusivePoiControl(p.id, 'aldea') >= 1
    },
    {
        id: 'senor_castillos',
        name: 'Señor de Castillos',
        icon: '🏯',
        desc: 'Controla tus 6 Castillos de tu Casa en el mapa sin asedio rival al final de una ronda.',
        check: (p, g) => g.countPlayerUnbesiegedShiros(p.id) >= 6
    },
    {
        id: 'asolador',
        name: 'Asolador',
        icon: '🔥',
        desc: 'Logra al menos 2 Asedios exitosos y mantén al menos 1 Asedio activo sobre un Castillo rival al final de una ronda.',
        check: (p, g) => p.siegesSuccess >= 2 && g.countPlayerActiveSieges(p.id) >= 1
    }
];

// =========================================================================
// 🎮 4. MOTOR PRINCIPAL (GAME ENGINE)
// =========================================================================
class GameEngine {
    constructor(hexGridData, customRules = {}) {
        this.rules = Object.assign({}, CONFIGURABLE_RULES, customRules);
        this.grid = JSON.parse(JSON.stringify(hexGridData));
        this.hexMap = new Map();
        this.grid.forEach(h => {
            h.troops = {};     // { rojo: 2, amarillo: 1 }
            h.shiro = null;    // Clan ID dueño del castillo
            h.garrison = null; // Clan ID de la tropa guarnecida (fija)
            h.siege = null;    // Clan ID de la tropa asediadora
            this.hexMap.set(h.id, h);
        });

        this.players = [];
        this.mandoPlayerIdx = 0;
        this.activePlayerIdx = 0;
        this.round = 0; // Turno 0 = Pre-Ronda
        this.turnPhase = 'SETUP_SHIRO'; // 'SETUP_SHIRO', 'SETUP_ASHIGARU', 'PREPARATION', 'MANEUVER', 'COMBAT'
        this.movesLeft = this.rules.MAX_MOVES_PER_TURN;
        this.campaignUsedThisTurn = false;
        this.lastSetupShiroHexId = null;

        this.autoPlayAi = true;
        this.isProcessing = false;
        this.log = [];
        this.gameOver = false;
        this.winner = null;
        this.claimedFeats = {}; // featId -> clanId
        this.finalRoundTriggered = false;

        // Telemetría profunda para análisis de balance
        this.telemetry = {
            combatsTotal: 0,
            combatsEqualCasualties: 0,
            combatsMajorityWins: 0,
            lossesSavedByTorii: 0,
            lossesSavedByGarrison: 0,
            siegesSuccess: 0,
            siegesRepelled: 0,
            siegesProtectedBySupport: 0,
            garrisonsFormed: 0,
            campaignsExecuted: 0,
            reinforcementsPlaced: 0,
            totalMovesMade: 0,
            bannersAwarded: 0,
            aldeaExtraTroopsAwarded: 0,
            tacticalRetreats: 0,
            bannersSpentWarCry: 0,
            flankingCombats: 0,
            leadersDefeated: 0,
            coronationsTriggered: 0,
            regicidesExecuted: 0,
            coronationsSurvived: 0,
            firstAldeaTurn: null,
            firstToriiTurn: null,
            finalRoundTriggeredAt: null,
            featsClaimed: {
                sangre_y_acero: 0,
                dominio_feudal: 0,
                senor_castillos: 0,
                asolador: 0
            },
            mandoTiebreaks: 0
        };

        // Callbacks de interfaz y audio
        this.onLog = null;
        this.onStateChange = null;
        this.onTurnStart = null;
        this.onCombatResolved = null;
    }

    notifyStateChange() {
        if (this.onStateChange) {
            this.onStateChange();
        }
    }

    addLog(msg, type = 'info') {
        const roundLabel = this.round === 0 ? 'Turno 0' : `R${this.round}`;
        const entry = { roundLabel, round: this.round, phase: this.turnPhase, msg, type, time: new Date().toLocaleTimeString() };
        this.log.unshift(entry);
        if (this.onLog) this.onLog(entry);
    }

    initGame(playerConfigs = [
        { id: 'rojo', name: 'Jugador 1 (Rojo)', isAi: false },
        { id: 'amarillo', name: 'Jugador 2 (Amarillo)', isAi: true },
        { id: 'azul', name: 'Jugador 3 (Azul)', isAi: true },
        { id: 'verde', name: 'Jugador 4 (Verde)', isAi: true }
    ]) {
        this.players = [];
        playerConfigs.forEach(cfg => {
            const baseClan = CLANS[cfg.id] || CLANS.rojo;
            this.players.push({
                id: baseClan.id,
                name: cfg.name || baseClan.name,
                short: baseClan.short,
                color: baseClan.color,
                accent: baseClan.accent,
                textColor: baseClan.text,
                reserveTroops: this.rules.STARTING_RESERVE_TROOPS,
                handTroops: 0,
                reserveShiros: this.rules.STARTING_RESERVE_SHIROS,
                banners: 0,
                siegesSuccess: 0,
                combatsThisTurn: 0,
                feats: [],
                hasMando: false,
                hasControlledToriiOnce: false,
                capitalShiroHexId: null,
                leaderHexId: null,
                leaderAlive: true,
                garrisonMitigationUsedThisRound: false,
                isAi: !!cfg.isAi
            });
        });

        // Limpiar celdas
        this.hexMap.forEach(h => {
            h.troops = {};
            h.shiro = null;
            h.garrison = null;
            h.siege = null;
            h.leader = null;
            delete h.attacker;
        });

        // Sorteo aleatorio de la Ficha de Mando (Ruleset.pdf v1.4)
        this.mandoPlayerIdx = Math.floor(Math.random() * this.players.length);
        this.players.forEach((p, idx) => {
            p.hasMando = (idx === this.mandoPlayerIdx);
        });
        this.activePlayerIdx = this.mandoPlayerIdx; // El jugador con Mando inicia

        this.round = 0;
        this.turnPhase = 'SETUP_SHIRO';
        this.gameOver = false;
        this.winner = null;
        this.claimedFeats = {};
        FEATS.forEach(f => this.claimedFeats[f.id] = []);
        this.finalRoundTriggered = false;
        this.coronationRoundActive = false;
        this.coronationCandidateId = null;
        this.regicideUsurperId = null;
        this.regicideEvent = null;
        this.victoryReason = null;
        this.isProcessing = false;

        this.addLog(`=== Comienza Sengoku Conquerors 1.4 (${this.players.length} Clanes) ===`, 'system');
        this.addLog(`👑 ${this.getActivePlayer().short} recibe la Ficha de Mando al azar (inicia la partida y desempata).`, 'feat');
        this.addLog(`⛩️ TURNO 0: ${this.getActivePlayer().short} debe elegir su Fortaleza inicial para colocar su primer Castillo.`, 'feat');

        this.notifyStateChange();

        if (this.getActivePlayer().isAi && this.autoPlayAi) {
            setTimeout(() => this.runAiSetup(), 350);
        }
    }

    getActivePlayer() {
        return this.players[this.activePlayerIdx];
    }

    getMandoPlayer() {
        return this.players[this.mandoPlayerIdx];
    }

    // =========================================================================
    // ⛩️ TURNO 0 (PRE-RONDA DE DESPLIEGUE INICIAL)
    // =========================================================================

    getValidSetupShiroHexes() {
        const valids = [];
        this.hexMap.forEach(h => {
            if (h.type === 'toride' && !h.shiro) {
                valids.push(h.id);
            }
        });
        if (valids.length === 0) {
            this.hexMap.forEach(h => {
                if (h.type === 'normal' && !h.shiro && Object.keys(h.troops).length === 0) {
                    valids.push(h.id);
                }
            });
        }
        return valids;
    }

    setupPlaceShiro(hexId) {
        if (this.turnPhase !== 'SETUP_SHIRO') return false;
        const p = this.getActivePlayer();
        const valid = this.getValidSetupShiroHexes();
        if (!valid.includes(hexId)) {
            this.addLog('Debes elegir una Fortaleza (Toride) libre en el mapa.', 'warning');
            return false;
        }

        const hex = this.hexMap.get(hexId);
        hex.shiro = p.id;
        p.reserveShiros -= 1;
        p.capitalShiroHexId = hexId;
        this.lastSetupShiroHexId = hexId;

        this.addLog(`${p.short} funda su Castillo Capital en Fortaleza #${hexId}.`, 'action');

        this.turnPhase = 'SETUP_ASHIGARU';
        this.addLog(`👑 TURNO 0: ${p.short} debe desplegar a su Daimyō (Líder) en una casilla adyacente a su nuevo Castillo.`, 'info');
        this.notifyStateChange();

        if (p.isAi && this.autoPlayAi) {
            setTimeout(() => this.runAiSetupAshigaru(), 300);
        }
        return true;
    }

    getValidSetupAshigaruHexes() {
        if (!this.lastSetupShiroHexId) return [];
        const shiroHex = this.hexMap.get(this.lastSetupShiroHexId);
        if (!shiroHex) return [];

        const valids = [];
        shiroHex.neighbors.forEach(nId => {
            const n = this.hexMap.get(nId);
            if (n && n.type !== 'montana' && n.type !== 'lago' && !n.shiro) {
                valids.push(n.id);
            }
        });
        return valids;
    }

    setupPlaceAshigaru(hexId) {
        if (this.turnPhase !== 'SETUP_ASHIGARU') return false;
        const p = this.getActivePlayer();
        const valid = this.getValidSetupAshigaruHexes();
        if (!valid.includes(hexId)) {
            this.addLog('Debes colocar a tu Daimyō inicial en una celda adyacente a tu Castillo.', 'warning');
            return false;
        }

        const hex = this.hexMap.get(hexId);
        hex.troops[p.id] = (hex.troops[p.id] || 0) + 1;
        hex.leader = p.id;
        p.leaderHexId = hexId;
        p.leaderAlive = true;
        p.reserveTroops -= 1;

        this.addLog(`👑 ${p.short} despliega a su Daimyō (Líder) en Hex #${hexId} (+2 Fuerza en combates; otorga +1 Estandarte si cae derrotado).`, 'action');

        // Siguiente jugador en sentido horario para Turno 0
        this.activePlayerIdx = (this.activePlayerIdx + 1) % this.players.length;
        if (this.activePlayerIdx !== this.mandoPlayerIdx) {
            this.turnPhase = 'SETUP_SHIRO';
            const nextP = this.getActivePlayer();
            this.addLog(`⛩️ TURNO 0: ${nextP.short} debe elegir su Fortaleza inicial.`, 'feat');
            this.notifyStateChange();

            if (nextP.isAi && this.autoPlayAi) {
                setTimeout(() => this.runAiSetup(), 300);
            }
        } else {
            // Fin del Turno 0 -> Comienza la Ronda 1 con el poseedor del Mando
            this.activePlayerIdx = this.mandoPlayerIdx;
            this.round = 1;
            this.addLog('==================================================', 'system');
            this.addLog('🎌 ¡Despliegue inicial completado! COMIENZA LA RONDA 1.', 'system');
            this.addLog('==================================================', 'system');
            this.startTurn();
        }
        return true;
    }

    runAiSetup() {
        const valids = this.getValidSetupShiroHexes();
        if (valids.length > 0) {
            const pick = valids[Math.floor(Math.random() * valids.length)];
            this.setupPlaceShiro(pick);
        }
    }

    runAiSetupAshigaru() {
        const valids = this.getValidSetupAshigaruHexes();
        if (valids.length > 0) {
            valids.sort((a, b) => this.getHexDistance(a, 67) - this.getHexDistance(b, 67));
            const pick = valids[0];
            this.setupPlaceAshigaru(pick);
        }
    }

    updateToriiControlRecord() {
        this.players.forEach(p => {
            if (this.hasExclusivePoiControl(p.id, 'torii') > 0 && !p.hasControlledToriiOnce) {
                p.hasControlledToriiOnce = true;
                if (this.telemetry.firstToriiTurn === null) this.telemetry.firstToriiTurn = this.round;
                this.addLog(`⛩️ ¡${p.short} ha controlado el Torii sagrado (#67)! Se consagra y desbloquea el derecho a recibir Leva adicional (+1 Tropa) en las Aldeas.`, 'feat');
            }
        });
    }

    startTurn() {
        const p = this.getActivePlayer();
        this.movesLeft = this.rules.MAX_MOVES_PER_TURN;
        this.campaignUsedThisTurn = false;
        p.combatsThisTurn = 0;

        this.updateToriiControlRecord();

        // Si el Daimyō cayó en combate la ronda previa, reaparece junto a su Capital o Castillo libre
        if (!p.leaderAlive) {
            let baseShiroId = p.capitalShiroHexId;
            let shiroHex = this.hexMap.get(baseShiroId);
            if (!shiroHex || shiroHex.shiro !== p.id || shiroHex.siege) {
                const alt = Array.from(this.hexMap.values()).find(h => h.shiro === p.id && !h.siege);
                if (alt) shiroHex = alt;
            }
            if (shiroHex && p.reserveTroops > 0) {
                let respawnHex = null;
                for (let nId of shiroHex.neighbors) {
                    const nh = this.hexMap.get(nId);
                    if (nh && !nh.shiro && nh.type !== 'montana' && nh.type !== 'lago') {
                        const enemies = Object.keys(nh.troops || {}).filter(c => c !== p.id && (nh.troops[c] || 0) > 0);
                        if (enemies.length === 0) {
                            respawnHex = nh;
                            break;
                        }
                    }
                }
                if (!respawnHex) {
                    for (let nId of shiroHex.neighbors) {
                        const nh = this.hexMap.get(nId);
                        if (nh && !nh.shiro && nh.type !== 'montana' && nh.type !== 'lago') {
                            respawnHex = nh;
                            break;
                        }
                    }
                }
                if (respawnHex) {
                    if (!respawnHex.troops) respawnHex.troops = {};
                    respawnHex.troops[p.id] = (respawnHex.troops[p.id] || 0) + 1;
                    p.reserveTroops -= 1;
                    respawnHex.leader = p.id;
                    p.leaderHexId = respawnHex.id;
                    p.leaderAlive = true;
                    this.addLog(`👑 El Daimyō de ${p.short} reaparece al mando en Hex #${respawnHex.id} junto a su Castillo #${shiroHex.id}.`, 'action');
                }
            }
        }

        // Reclutamiento de reserva a mano (Base 3 + 1 si controla Aldea Y ha controlado el Torii al menos una vez)
        let drawCount = this.rules.REINFORCE_DRAW_BASE;
        const ownedAldeas = this.countPlayerPoi(p.id, 'aldea');
        if (ownedAldeas > 0) {
            if (p.hasControlledToriiOnce) {
                drawCount += this.rules.ALDEA_REINFORCE_BONUS;
                this.telemetry.aldeaExtraTroopsAwarded = (this.telemetry.aldeaExtraTroopsAwarded || 0) + this.rules.ALDEA_REINFORCE_BONUS;
                if (this.telemetry.firstAldeaTurn === null) this.telemetry.firstAldeaTurn = this.round;
                this.addLog(`🌾 ${p.short} controla una Aldea y cuenta con la consagración del Torii: recibe +${this.rules.ALDEA_REINFORCE_BONUS} Tropa de leva.`, 'feat');
            } else {
                this.addLog(`🌾 ${p.short} controla una Aldea pero aún no ha controlado el Torii sagrado (#67) en la partida (Leva adicional bloqueada hasta visitar el Torii).`, 'info');
            }
        }

        const actualDraw = Math.min(drawCount, p.reserveTroops);
        p.reserveTroops -= actualDraw;
        p.handTroops += actualDraw;
        this.addLog(`${p.short} inicia su turno. Recluta ${actualDraw} Ashigaru a su mano (Mano: ${p.handTroops}, Reserva: ${p.reserveTroops}).`, 'action');

        this.turnPhase = 'PREPARATION';
        this.checkFeats(false);
        this.notifyStateChange();

        if (typeof this.onTurnStart === 'function') {
            this.onTurnStart(p);
        }

        if (p.isAi && this.autoPlayAi) {
            setTimeout(() => this.runAiTurn(), 450);
        }
    }

    // =========================================================================
    // ➕ FASE DE PREPARACIÓN: REFUERZOS Y CAMPAÑA
    // =========================================================================

    getValidReinforceHexes(clanId) {
        const p = this.players.find(x => x.id === clanId);
        if (!p || p.handTroops < 1) return [];

        const valid = new Set();
        this.hexMap.forEach(h => {
            if (h.shiro === clanId && !h.siege) {
                h.neighbors.forEach(nId => {
                    const n = this.hexMap.get(nId);
                    if (n && n.type !== 'montana' && n.type !== 'lago') {
                        const friendlyCount = (n.troops && n.troops[clanId]) || 0;
                        if (friendlyCount < this.rules.MAX_TROOPS_PER_HEX) {
                            valid.add(n.id);
                        }
                    }
                });
            }
        });
        return Array.from(valid);
    }

    reinforce(hexId) {
        const p = this.getActivePlayer();
        if (p.handTroops < 1) {
            this.addLog('No tienes tropas en mano para reforzar.', 'warning');
            return false;
        }
        const valid = this.getValidReinforceHexes(p.id);
        if (!valid.includes(hexId)) {
            this.addLog('Esa casilla no es válida para refuerzo (debe ser adyacente a tu Castillo y tener < 3 tropas).', 'warning');
            return false;
        }

        const hex = this.hexMap.get(hexId);
        if (!hex.troops) hex.troops = {};
        hex.troops[p.id] = (hex.troops[p.id] || 0) + 1;
        p.handTroops -= 1;
        this.telemetry.reinforcementsPlaced = (this.telemetry.reinforcementsPlaced || 0) + 1;
        this.addLog(`${p.short} despliega 1 Ashigaru en Hex #${hexId}. (Mano: ${p.handTroops})`, 'action');
        this.checkFeats();
        this.notifyStateChange();
        return true;
    }

    getValidCampaignHexes(clanId) {
        const p = this.players.find(x => x.id === clanId);
        if (!p || p.handTroops < this.rules.CAMPAIGN_TROOP_COST || p.reserveShiros < 1 || this.campaignUsedThisTurn) return [];

        const valid = new Set();
        this.hexMap.forEach(h => {
            if (h.troops && (h.troops[clanId] || 0) > 0) {
                h.neighbors.forEach(nId => {
                    const n = this.hexMap.get(nId);
                    // No en montañas, lagos, ni aldeas/toriis, ni sobre otros castillos
                    if (n && n.type !== 'montana' && n.type !== 'lago' && n.type !== 'aldea' && n.type !== 'torii' && !n.shiro) {
                        const hasAdjShiro = n.neighbors.some(nnId => {
                            const nn = this.hexMap.get(nnId);
                            return nn && nn.shiro !== null;
                        });
                        const isEmpty = !n.troops || Object.keys(n.troops).length === 0;
                        if (!hasAdjShiro && isEmpty) {
                            valid.add(n.id);
                        }
                    }
                });
            }
        });
        return Array.from(valid);
    }

    campaign(hexId) {
        const p = this.getActivePlayer();
        if (p.handTroops < this.rules.CAMPAIGN_TROOP_COST) {
            this.addLog(`Necesitas ${this.rules.CAMPAIGN_TROOP_COST} Ashigaru en mano para Campaña.`, 'warning');
            return false;
        }
        if (p.reserveShiros < 1) {
            this.addLog('No te quedan Castillos en tu reserva.', 'warning');
            return false;
        }
        if (this.campaignUsedThisTurn) {
            this.addLog('Ya fundaste un Castillo este turno (máximo 1 vez por turno).', 'warning');
            return false;
        }

        const valid = this.getValidCampaignHexes(p.id);
        if (!valid.includes(hexId)) {
            this.addLog('Casilla no válida para Campaña (no puede estar adyacente a otro Castillo ni sobre Aldeas/Toriis).', 'warning');
            return false;
        }

        const hex = this.hexMap.get(hexId);
        hex.shiro = p.id;
        p.handTroops -= this.rules.CAMPAIGN_TROOP_COST;
        // Regla de Conservación: las 2 tropas gastadas de mano para fundar regresan a la Reserva (Total = 28)
        p.reserveTroops += this.rules.CAMPAIGN_TROOP_COST;
        p.reserveShiros -= 1;
        this.campaignUsedThisTurn = true;
        this.telemetry.campaignsExecuted = (this.telemetry.campaignsExecuted || 0) + 1;
        this.addLog(`${p.short} funda un Castillo en Hex #${hexId}. Gasta 2 Ashigaru de mano que regresan a su Reserva (Mano: ${p.handTroops}, Reserva: ${p.reserveTroops}, Castillos restantes: ${p.reserveShiros}).`, 'action');
        this.checkFeats();
        this.notifyStateChange();
        return true;
    }

    goToManeuverPhase() {
        this.turnPhase = 'MANEUVER';
        this.movesLeft = this.rules.MAX_MOVES_PER_TURN;
        this.addLog(`🏹 Fase de Maniobra: ${this.getActivePlayer().short} puede mover hasta ${this.movesLeft} tropas.`, 'info');
        this.notifyStateChange();
    }

    // =========================================================================
    // 🏹 FASE DE MANIOBRA: MOVILIDAD Y CASTILLOS (1 PIEZA MÁXIMA)
    // =========================================================================

    getValidMoveDestinations(fromHexId, clanId) {
        if (this.movesLeft <= 0) return [];
        const fromHex = this.hexMap.get(fromHexId);
        // Las tropas guarnecidas en castillos están fijas y NO pueden salir
        if (!fromHex || !fromHex.troops || (fromHex.troops[clanId] || 0) < 1) return [];

        const valid = [];
        fromHex.neighbors.forEach(nId => {
            const n = this.hexMap.get(nId);
            if (!n || n.type === 'montana' || n.type === 'lago') return;

            // --- CASO CASTILLOS (Shiro) ---
            // Regla oficial: dentro del castillo SOLAMENTE puede haber UNA pieza activa:
            // o la Guarnición o el Asedio, nunca ambas.
            if (n.shiro) {
                // Caso A: Castillo Propio
                if (n.shiro === clanId) {
                    // Si ya tiene Guarnición propia, nadie más puede entrar (capacidad 1)
                    if (n.garrison) return;

                    // Si está asediado por un rival:
                    // Regla de Asedio: Un asedio solamente se puede quitar si cumples las condiciones
                    // para otro asedio (al menos 2 otras tropas adyacentes de flanqueo)
                    if (n.siege) {
                        let friendlyAdj = 0;
                        n.neighbors.forEach(nnId => {
                            const nh = this.hexMap.get(nnId);
                            if (nh && nh.troops) {
                                const count = nh.troops[clanId] || 0;
                                friendlyAdj += (nnId === fromHexId ? Math.max(0, count - 1) : count);
                            }
                        });
                        if (friendlyAdj < 2) return; // Requiere apoyo de 2 tropas aliadas adyacentes
                    }
                    // Si está vacío (sin guarnición ni asedio), el dueño puede entrar libremente
                }
                // Caso B: Castillo Rival
                else {
                    // Si tiene Guarnición rival activa, está defendido y NO se puede penetrar ni asediar
                    if (n.garrison) return;

                    // Si ya está asediado por este mismo clan, no se puede añadir una segunda tropa
                    if (n.siege === clanId) return;

                    // Requisito de Asedio estricto: requiere al menos 2 OTRAS tropas adyacentes de flanqueo
                    let friendlyAdj = 0;
                    n.neighbors.forEach(nnId => {
                        const nh = this.hexMap.get(nnId);
                        if (nh && nh.troops) {
                            const count = nh.troops[clanId] || 0;
                            friendlyAdj += (nnId === fromHexId ? Math.max(0, count - 1) : count);
                        }
                    });
                    if (friendlyAdj < 2) return; // Requiere apoyo de 2 tropas aliadas adyacentes
                }

                valid.push(n.id);
                return;
            }

            // --- CASO HEXÁGONO REGULAR (No Castillo) ---
            const friendlyCount = (n.troops && n.troops[clanId]) || 0;
            if (friendlyCount >= this.rules.MAX_TROOPS_PER_HEX) return;

            valid.push(n.id);
        });
        return valid;
    }

    moveTroop(fromHexId, toHexId) {
        const p = this.getActivePlayer();
        if (this.movesLeft <= 0) {
            this.addLog('Ya usaste todos tus movimientos este turno.', 'warning');
            return false;
        }
        const valid = this.getValidMoveDestinations(fromHexId, p.id);
        if (!valid.includes(toHexId)) {
            this.addLog('Movimiento no válido.', 'warning');
            return false;
        }

        const fromHex = this.hexMap.get(fromHexId);
        const toHex = this.hexMap.get(toHexId);

        if (!fromHex.troops) fromHex.troops = {};
        if (!toHex.troops) toHex.troops = {};

        // Restar 1 tropa de la casilla de origen
        fromHex.troops[p.id] -= 1;
        if (fromHex.troops[p.id] <= 0) delete fromHex.troops[p.id];
        this.movesLeft -= 1;
        this.telemetry.totalMovesMade = (this.telemetry.totalMovesMade || 0) + 1;

        // --- DESTINO: CASTILLO (Shiro) ---
        // Solo 1 pieza activa permitida dentro del castillo
        if (toHex.shiro) {
            // Caso 1: Castillo Propio
            if (toHex.shiro === p.id) {
                // Si estaba asediado por un enemigo
                if (toHex.siege) {
                    const rivalClan = toHex.siege;
                    const rivalPlayer = this.players.find(x => x.id === rivalClan);

                    // Buscar tropas de soporte del asediador en casillas adyacentes al castillo
                    const supportHexes = toHex.neighbors.filter(nId => {
                        const nh = this.hexMap.get(nId);
                        return nh && nh.troops && (nh.troops[rivalClan] || 0) > 0;
                    });

                    // REGLA OFICIAL B2: Las tropas adyacentes que soportan el asedio defienden la unidad que asedia
                    // absorbiendo el contra-asedio del dueño.
                    if (supportHexes.length > 0) {
                        const supHexId = supportHexes[0];
                        const supHex = this.hexMap.get(supHexId);
                        supHex.troops[rivalClan] -= 1;
                        if (supHex.troops[rivalClan] <= 0) delete supHex.troops[rivalClan];
                        if (rivalPlayer) rivalPlayer.reserveTroops += 1;

                        this.telemetry.siegesProtectedBySupport = (this.telemetry.siegesProtectedBySupport || 0) + 1;

                        // La tropa del dueño no puede penetrar; se mantiene en su casilla de origen
                        fromHex.troops[p.id] = (fromHex.troops[p.id] || 0) + 1;

                        this.addLog(`🛡️ [SOPORTE DE ASEDIO] ¡Las tropas aliadas de ${rivalPlayer?.short || rivalClan} en Hex #${supHexId} defienden el cerco! 1 tropa de soporte regresa a su Reserva, pero el Asedio en Castillo #${toHexId} SE MANTIENE INTACTO. El intento de ${p.short} de guarecerse es repelido.`, 'feat');
                        this.updateToriiControlRecord();
                        this.notifyStateChange();
                        return true;
                    }

                    // Si no hay soporte adyacente, el contra-asedio tiene éxito y expulsa al asediador
                    if (rivalPlayer) {
                        rivalPlayer.reserveTroops += 1;
                        this.addLog(`🏯 ¡Asedio repelido! Sin tropas de soporte rivales alrededor, ${p.short} libera su Castillo en Hex #${toHexId}. La tropa asediadora de ${rivalPlayer.short} regresa a su Reserva (Reserva: ${rivalPlayer.reserveTroops}).`, 'feat');
                    }
                    toHex.siege = null;
                    this.telemetry.siegesRepelled = (this.telemetry.siegesRepelled || 0) + 1;
                }
                // Se establece como Guarnición fija del castillo
                toHex.garrison = p.id;
                this.telemetry.garrisonsFormed++;
                this.addLog(`🛡️ ${p.short} establece Guarnición fija en su Castillo de Hex #${toHexId}.`, 'action');
            }
            // Caso 2: Castillo Rival
            else {
                // Si había un asedio previo de otro clan, se expulsa a su reserva
                if (toHex.siege && toHex.siege !== p.id) {
                    const prevRivalClan = toHex.siege;
                    const prevRival = this.players.find(x => x.id === prevRivalClan);
                    if (prevRival) {
                        prevRival.reserveTroops += 1;
                        this.addLog(`🔥 ${p.short} desaloja el asedio previo de ${prevRival.short} en Hex #${toHexId}. Su ficha regresa a su Reserva (Reserva: ${prevRival.reserveTroops}).`, 'feat');
                    }
                }
                toHex.siege = p.id;
                p.siegesSuccess += 1;
                this.telemetry.siegesSuccess++;
                this.addLog(`🔥 ¡ASEDIO EXITOSO! ${p.short} ocupa el Castillo rival de Hex #${toHexId} (${CLANS[toHex.shiro]?.short}).`, 'feat');

                if (this.finalRoundTriggered && this.coronationCandidateId && toHex.shiro === this.coronationCandidateId) {
                    const pCand = this.players.find(x => x.id === this.coronationCandidateId);
                    if (toHexId === pCand?.capitalShiroHexId && this.regicideEvent !== 'daimyo_slain') {
                        this.regicideUsurperId = p.id;
                        this.regicideEvent = 'capital_besieged';
                        this.telemetry.regicidesExecuted = (this.telemetry.regicidesExecuted || 0) + 1;
                        this.addLog(`🏯🔥 ¡¡GOLPE DE ESTADO Y REGICIDIO!! ¡${p.short} ha penetrado y asediado la Capital de ${pCand.short}! La corona es usurpada por ${p.short}.`, 'system');
                        this.determineWinner();
                        return true;
                    }
                }
            }
        }
        // --- DESTINO: HEXÁGONO REGULAR (No Castillo) ---
        else {
            toHex.troops[p.id] = (toHex.troops[p.id] || 0) + 1;
            if (fromHex.leader === p.id) {
                fromHex.leader = null;
                toHex.leader = p.id;
                p.leaderHexId = toHexId;
            }
            const enemyClans = Object.keys(toHex.troops).filter(c => c !== p.id);
            if (enemyClans.length > 0) {
                p.combatsThisTurn += 1;
                toHex.attacker = p.id;
                this.addLog(`⚔️ ¡Disputa territorial en Hex #${toHexId}! ${p.short} desafía a ${enemyClans.map(c => CLANS[c]?.short || c).join(', ')}. Se resolverá en la Fase de Combates.`, 'combat');
            } else {
                this.addLog(`${p.short} mueve una tropa de Hex #${fromHexId} a Hex #${toHexId}. (Movimientos restantes: ${this.movesLeft})`, 'action');
            }
        }

        this.updateToriiControlRecord();
        this.checkFeats();
        this.notifyStateChange();
        return true;
    }

    // =========================================================================
    // ⚔️ 5. RESOLUCIÓN DE COMBATE POR MAYORÍAS (Ruleset.pdf v1.4)
    // =========================================================================

    getPendingCombatHexes() {
        const combative = [];
        this.hexMap.forEach(h => {
            if (h.troops) {
                const clans = Object.keys(h.troops).filter(c => (h.troops[c] || 0) > 0);
                if (clans.length > 1) {
                    combative.push(h);
                }
            }
        });
        return combative;
    }

    resolveCombats(onComplete = null) {
        if (this.isProcessing) return;
        this.isProcessing = true;

        const combatHexes = this.getPendingCombatHexes();
        if (combatHexes.length === 0) {
            this.addLog(`No hay combates pendientes. Finaliza el turno de ${this.getActivePlayer().short}.`, 'info');
            this.isProcessing = false;
            this.endTurn();
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        this.turnPhase = 'COMBAT';
        this.notifyStateChange();

        const processQueue = (idx) => {
            if (this.gameOver) {
                this.isProcessing = false;
                if (typeof onComplete === 'function') onComplete();
                return;
            }

            if (idx >= combatHexes.length) {
                this.checkFeats();
                this.isProcessing = false;
                if (!this.gameOver) this.endTurn();
                if (typeof onComplete === 'function') onComplete();
                return;
            }

            const hex = combatHexes[idx];
            const mitOptions = this.getCombatMitigationOptions(hex);

            if (mitOptions && mitOptions.needsHumanDecision && typeof this.onCombatPrompt === 'function') {
                this.onCombatPrompt(hex, mitOptions, (choices) => {
                    this.resolveSingleCombat(hex, choices);
                    if (this.gameOver) {
                        this.isProcessing = false;
                        if (typeof onComplete === 'function') onComplete();
                        return;
                    }
                    processQueue(idx + 1);
                });
            } else {
                this.resolveSingleCombat(hex, {});
                if (this.gameOver) {
                    this.isProcessing = false;
                    if (typeof onComplete === 'function') onComplete();
                    return;
                }
                processQueue(idx + 1);
            }
        };

        processQueue(0);
    }

    hasAdjacentGarrison(combatHexId, clanId) {
        const combatHex = this.hexMap.get(combatHexId);
        if (!combatHex) return null;
        for (let nId of combatHex.neighbors) {
            const nh = this.hexMap.get(nId);
            if (nh && nh.shiro === clanId && nh.garrison === clanId) {
                return nh;
            }
        }
        return null;
    }

    isCombatAdjacentToTorii(combatHexId) {
        const combatHex = this.hexMap.get(combatHexId);
        if (!combatHex) return false;
        if (combatHex.type === 'torii') return true;
        return combatHex.neighbors.some(nId => {
            const nh = this.hexMap.get(nId);
            return nh && nh.type === 'torii';
        });
    }

    getFlankingSupport(combatHexId, clanId) {
        const combatHex = this.hexMap.get(combatHexId);
        if (!combatHex) return 0;
        let adjacentSupportHexes = 0;
        for (let nId of combatHex.neighbors) {
            const nh = this.hexMap.get(nId);
            if (nh && nh.id !== combatHexId && (nh.troops && (nh.troops[clanId] || 0) > 0)) {
                adjacentSupportHexes++;
            }
        }
        return adjacentSupportHexes >= 2 ? 1 : 0;
    }

    getValidRetreatHex(combatHexId, clanId) {
        const combatHex = this.hexMap.get(combatHexId);
        if (!combatHex) return null;
        for (let nId of combatHex.neighbors) {
            const nh = this.hexMap.get(nId);
            if (!nh || nh.type === 'montana' || nh.type === 'lago' || nh.shiro) continue;
            const enemies = Object.keys(nh.troops || {}).filter(c => c !== clanId && (nh.troops[c] || 0) > 0);
            if (enemies.length > 0) continue;
            return nh.id;
        }
        return null;
    }

    getCombatMitigationOptions(hex) {
        if (!hex || !hex.troops) return null;
        const clans = Object.keys(hex.troops).filter(c => (hex.troops[c] || 0) > 0);
        if (clans.length <= 1) return null;

        clans.sort((a, b) => (hex.troops[b] || 0) - (hex.troops[a] || 0));
        const clanA = clans[0];
        const clanB = clans[1];
        const countA = hex.troops[clanA] || 0;
        const countB = hex.troops[clanB] || 0;

        const pA = this.players.find(p => p.id === clanA);
        const pB = this.players.find(p => p.id === clanB);

        const hasLeaderA = (hex.leader === clanA || pA?.leaderHexId === hex.id);
        const hasLeaderB = (hex.leader === clanB || pB?.leaderHexId === hex.id);

        const flankA = this.getFlankingSupport(hex.id, clanA);
        const flankB = this.getFlankingSupport(hex.id, clanB);

        // Fuerza efectiva: tropas físicas + (+1 si Daimyō al mando) + (+1 si Flanqueo posicional)
        const strA = countA + (hasLeaderA ? 1 : 0) + flankA;
        const strB = countB + (hasLeaderB ? 1 : 0) + flankB;

        const isTie = (strA === strB);
        let baseLossA = 0;
        let baseLossB = 0;

        if (isTie) {
            baseLossA = countA;
            baseLossB = countB;
        } else if (strA > strB) {
            baseLossA = Math.max(0, countB - 1);
            baseLossB = countB;
        } else {
            baseLossB = Math.max(0, countA - 1);
            baseLossA = countA;
        }

        const garrisonA = this.hasAdjacentGarrison(hex.id, clanA);
        const garrisonB = this.hasAdjacentGarrison(hex.id, clanB);

        const canGarrisonA = (!!garrisonA && !pA?.garrisonMitigationUsedThisRound && baseLossA > 0);
        const canGarrisonB = (!!garrisonB && !pB?.garrisonMitigationUsedThisRound && baseLossB > 0);

        const retreatHexA = this.getValidRetreatHex(hex.id, clanA);
        const canRetreatA = (retreatHexA !== null && (strA <= strB || isTie));

        const retreatHexB = this.getValidRetreatHex(hex.id, clanB);
        const canRetreatB = (retreatHexB !== null && (strB <= strA || isTie));

        const canSpendBannerA = (pA && pA.banners >= 1 && baseLossA > 0);
        const canSpendBannerB = (pB && pB.banners >= 1 && baseLossB > 0);

        const optA = {
            clan: clanA,
            name: pA?.short || clanA,
            initial: CLANS[clanA]?.initial || '?',
            color: pA?.color || '#333',
            isHuman: (pA && !pA.isAi),
            baseLoss: baseLossA,
            count: countA,
            hasLeader: hasLeaderA,
            hasFlanking: (flankA > 0),
            strength: strA,
            hasGarrison: canGarrisonA,
            garrisonHex: garrisonA ? garrisonA.id : null,
            canRetreat: canRetreatA,
            retreatHexId: retreatHexA,
            canSpendBanner: canSpendBannerA,
            banners: pA ? pA.banners : 0
        };

        const optB = {
            clan: clanB,
            name: pB?.short || clanB,
            initial: CLANS[clanB]?.initial || '?',
            color: pB?.color || '#333',
            isHuman: (pB && !pB.isAi),
            baseLoss: baseLossB,
            count: countB,
            hasLeader: hasLeaderB,
            hasFlanking: (flankB > 0),
            strength: strB,
            hasGarrison: canGarrisonB,
            garrisonHex: garrisonB ? garrisonB.id : null,
            canRetreat: canRetreatB,
            retreatHexId: retreatHexB,
            canSpendBanner: canSpendBannerB,
            banners: pB ? pB.banners : 0
        };

        const needsDecision = (optA.isHuman && (optA.hasGarrison || optA.canRetreat || optA.canSpendBanner)) ||
                              (optB.isHuman && (optB.hasGarrison || optB.canRetreat || optB.canSpendBanner));

        return {
            hexId: hex.id,
            clanA,
            clanB,
            pA,
            pB,
            strA,
            strB,
            isTie,
            optA,
            optB,
            needsHumanDecision: needsDecision
        };
    }

    resolveSingleCombat(hex, mitigationChoices = {}) {
        if (!hex.troops) return null;
        const clans = Object.keys(hex.troops).filter(c => (hex.troops[c] || 0) > 0);
        if (clans.length <= 1) return null;

        this.telemetry.combatsTotal++;

        clans.sort((a, b) => (hex.troops[b] || 0) - (hex.troops[a] || 0));
        const clanA = clans[0];
        const clanB = clans[1];
        const countA = hex.troops[clanA] || 0;
        const countB = hex.troops[clanB] || 0;

        const pA = this.players.find(p => p.id === clanA);
        const pB = this.players.find(p => p.id === clanB);

        const mitOptions = this.getCombatMitigationOptions(hex);
        const optA = mitOptions?.optA;
        const optB = mitOptions?.optB;

        // --- 1. MANEJO DE RETIRADA TÁCTICA VOLUNTARIA ---
        let doRetreatA = !!mitigationChoices.retreatA && optA?.canRetreat;
        let doRetreatB = !!mitigationChoices.retreatB && optB?.canRetreat;

        // IA táctica: si la IA está en clara desventaja (diferencia de 2+ de fuerza) o su líder corre peligro, salva sus tropas
        if (pA?.isAi && optA?.canRetreat) {
            if (optB?.strength >= optA?.strength + 2 || (optA?.hasLeader && optB?.strength > optA?.strength)) {
                doRetreatA = true;
            }
        }
        if (pB?.isAi && optB?.canRetreat) {
            if (optA?.strength >= optB?.strength + 2 || (optB?.hasLeader && optA?.strength > optB?.strength)) {
                doRetreatB = true;
            }
        }

        if (doRetreatA && !doRetreatB) {
            const retHex = this.hexMap.get(optA.retreatHexId);
            retHex.troops[clanA] = (retHex.troops[clanA] || 0) + countA;
            delete hex.troops[clanA];
            if (optA.hasLeader) {
                hex.leader = null;
                retHex.leader = clanA;
                pA.leaderHexId = retHex.id;
            }
            pB.banners += 1;
            this.telemetry.bannersAwarded = (this.telemetry.bannersAwarded || 0) + 1;
            this.telemetry.tacticalRetreats = (this.telemetry.tacticalRetreats || 0) + 1;
            this.addLog(`🏃 [RETIRADA TÁCTICA] ${pA.short} se repliega con honor a Hex #${retHex.id} para salvar a sus tropas (0 bajas). ${pB.short} toma el control de Hex #${hex.id} y recibe 1 Estandarte por forzar la retirada.`, 'feat');
            delete hex.attacker;
            const summary = {
                hexId: hex.id,
                clanA, clanB, countA, countB, pA, pB,
                isTie: false, winnerClan: clanB, bannerAwarded: true,
                finalLossA: 0, finalLossB: 0, retreatedClan: clanA
            };
            this.lastCombatResolution = summary;
            if (typeof this.onCombatResolved === 'function') this.onCombatResolved(summary);
            return summary;
        } else if (doRetreatB && !doRetreatA) {
            const retHex = this.hexMap.get(optB.retreatHexId);
            retHex.troops[clanB] = (retHex.troops[clanB] || 0) + countB;
            delete hex.troops[clanB];
            if (optB.hasLeader) {
                hex.leader = null;
                retHex.leader = clanB;
                pB.leaderHexId = retHex.id;
            }
            pA.banners += 1;
            this.telemetry.bannersAwarded = (this.telemetry.bannersAwarded || 0) + 1;
            this.telemetry.tacticalRetreats = (this.telemetry.tacticalRetreats || 0) + 1;
            this.addLog(`🏃 [RETIRADA TÁCTICA] ${pB.short} se repliega con honor a Hex #${retHex.id} para salvar a sus tropas (0 bajas). ${pA.short} toma el control de Hex #${hex.id} y recibe 1 Estandarte por forzar la retirada.`, 'feat');
            delete hex.attacker;
            const summary = {
                hexId: hex.id,
                clanA, clanB, countA, countB, pA, pB,
                isTie: false, winnerClan: clanA, bannerAwarded: true,
                finalLossA: 0, finalLossB: 0, retreatedClan: clanB
            };
            this.lastCombatResolution = summary;
            if (typeof this.onCombatResolved === 'function') this.onCombatResolved(summary);
            return summary;
        }

        // --- 2. RESOLUCIÓN DE CHOQUE CAMPAL (FUERZA EFECTIVA) ---
        const strA = optA?.strength || countA;
        const strB = optB?.strength || countB;
        const isTie = (strA === strB);
        const majClan = strA > strB ? clanA : (strB > strA ? clanB : null);
        const minClan = strA > strB ? clanB : (strB > strA ? clanA : null);

        if (optA?.hasFlanking || optB?.hasFlanking) {
            this.telemetry.flankingCombats = (this.telemetry.flankingCombats || 0) + 1;
        }

        const useGarrisonA = (mitigationChoices.useGarrisonA !== undefined) ? mitigationChoices.useGarrisonA : true;
        const useGarrisonB = (mitigationChoices.useGarrisonB !== undefined) ? mitigationChoices.useGarrisonB : true;
        let spendBannerA = (mitigationChoices.spendBannerA && pA && pA.banners >= 1);
        let spendBannerB = (mitigationChoices.spendBannerB && pB && pB.banners >= 1);

        if (pA?.isAi && !spendBannerA && pA.banners >= 1) {
            if (this.finalRoundTriggered && clanB === this.coronationCandidateId && optB?.hasLeader && (optA.baseLoss >= 0)) {
                spendBannerA = true;
            } else if (optB?.hasLeader && pA.banners >= 2) {
                spendBannerA = true;
            }
        }

        if (pB?.isAi && !spendBannerB && pB.banners >= 1) {
            if (this.finalRoundTriggered && clanA === this.coronationCandidateId && optA?.hasLeader && (optB.baseLoss >= 0)) {
                spendBannerB = true;
            } else if (optA?.hasLeader && pB.banners >= 2) {
                spendBannerB = true;
            }
        }

        const summary = {
            hexId: hex.id,
            clanA,
            clanB,
            countA,
            countB,
            strA,
            strB,
            pA,
            pB,
            isTie,
            majClan,
            minClan,
            baseLossA: optA?.baseLoss || 0,
            baseLossB: optB?.baseLoss || 0,
            garrisonSaveA: false,
            garrisonSaveB: false,
            finalLossA: 0,
            finalLossB: 0,
            savedToHandA: 0,
            savedToHandB: 0,
            winnerClan: null,
            bannerAwarded: false
        };

        let lossA = summary.baseLossA;
        let lossB = summary.baseLossB;

        // Empeño de Estandartes (Grito de Guerra / Último Aliento)
        if (spendBannerA) {
            pA.banners -= 1;
            lossB += 1;
            this.telemetry.bannersSpentWarCry = (this.telemetry.bannersSpentWarCry || 0) + 1;
            this.addLog(`🚩 [GRITO DE GUERRA] ${pA.short} gasta 1 Estandarte para infligir +1 baja adicional a las fuerzas de ${pB.short}.`, 'feat');
        }
        if (spendBannerB) {
            pB.banners -= 1;
            lossA += 1;
            this.telemetry.bannersSpentWarCry = (this.telemetry.bannersSpentWarCry || 0) + 1;
            this.addLog(`🚩 [GRITO DE GUERRA] ${pB.short} gasta 1 Estandarte para infligir +1 baja adicional a las fuerzas de ${pA.short}.`, 'feat');
        }

        // Mitigaciones por Guarnición
        const garrisonA = this.hasAdjacentGarrison(hex.id, clanA);
        if (useGarrisonA && garrisonA && pA && !pA.garrisonMitigationUsedThisRound && lossA > 0) {
            lossA -= 1;
            pA.garrisonMitigationUsedThisRound = true;
            garrisonA.garrison = null;
            pA.reserveTroops += 1;
            summary.garrisonSaveA = true;
            this.telemetry.lossesSavedByGarrison = (this.telemetry.lossesSavedByGarrison || 0) + 1;
            this.addLog(`🛡️ [GUARNICIÓN UTILIZADA] ${pA.short} gasta la Guarnición del Castillo #${garrisonA.id} para evitar 1 baja (límite: 1 vez por ronda). La tropa guarnecida se retira a su Reserva y el Castillo queda sin guarnición.`, 'feat');
        }

        const garrisonB = this.hasAdjacentGarrison(hex.id, clanB);
        if (useGarrisonB && garrisonB && pB && !pB.garrisonMitigationUsedThisRound && lossB > 0) {
            lossB -= 1;
            pB.garrisonMitigationUsedThisRound = true;
            garrisonB.garrison = null;
            pB.reserveTroops += 1;
            summary.garrisonSaveB = true;
            this.telemetry.lossesSavedByGarrison = (this.telemetry.lossesSavedByGarrison || 0) + 1;
            this.addLog(`🛡️ [GUARNICIÓN UTILIZADA] ${pB.short} gasta la Guarnición del Castillo #${garrisonB.id} para evitar 1 baja (límite: 1 vez por ronda). La tropa guarnecida se retira a su Reserva y el Castillo queda sin guarnición.`, 'feat');
        }

        lossA = Math.max(0, Math.min(countA, lossA));
        lossB = Math.max(0, Math.min(countB, lossB));

        summary.finalLossA = lossA;
        summary.finalLossB = lossB;

        // Comprobar caída del Daimyō (si las tropas de su clan son aniquiladas)
        if (optA?.hasLeader && lossA >= countA) {
            pA.leaderAlive = false;
            pA.leaderHexId = null;
            hex.leader = null;
            pB.banners += 1;
            this.telemetry.leadersDefeated = (this.telemetry.leadersDefeated || 0) + 1;
            this.addLog(`👑⚔️ ¡El Daimyō de ${pA.short} ha caído en combate! ${pB.short} obtiene +1 Estandarte adicional por el general enemigo. Reaparecerá en la Capital la próxima ronda.`, 'feat');

            if (this.finalRoundTriggered && this.coronationCandidateId === clanA) {
                this.regicideUsurperId = clanB;
                this.regicideEvent = 'daimyo_slain';
                this.telemetry.regicidesExecuted = (this.telemetry.regicidesExecuted || 0) + 1;
                this.addLog(`👑⚔️ ¡¡REGICIDIO Y USURPACIÓN!! ¡${pB.short} ha derrotado en combate al Daimyō del Aspirante (${pA.short})! Reclama el Shogunato por la ley de la espada (Gekokujō).`, 'system');
            }
        }
        if (optB?.hasLeader && lossB >= countB) {
            pB.leaderAlive = false;
            pB.leaderHexId = null;
            hex.leader = null;
            pA.banners += 1;
            this.telemetry.leadersDefeated = (this.telemetry.leadersDefeated || 0) + 1;
            this.addLog(`👑⚔️ ¡El Daimyō de ${pB.short} ha caído en combate! ${pA.short} obtiene +1 Estandarte adicional por el general enemigo. Reaparecerá en la Capital la próxima ronda.`, 'feat');

            if (this.finalRoundTriggered && this.coronationCandidateId === clanB) {
                this.regicideUsurperId = clanA;
                this.regicideEvent = 'daimyo_slain';
                this.telemetry.regicidesExecuted = (this.telemetry.regicidesExecuted || 0) + 1;
                this.addLog(`👑⚔️ ¡¡REGICIDIO Y USURPACIÓN!! ¡${pA.short} ha derrotado en combate al Daimyō del Aspirante (${pB.short})! Reclama el Shogunato por la ley de la espada (Gekokujō).`, 'system');
            }
        }

        // Bajas a la Reserva (Conservación estricta de 28)
        if (pA && lossA > 0) pA.reserveTroops += lossA;
        if (pB && lossB > 0) pB.reserveTroops += lossB;

        const survivorsA = countA - lossA;
        const survivorsB = countB - lossB;

        if (isTie) {
            this.telemetry.combatsEqualCasualties++;
            if (survivorsA > survivorsB) {
                summary.winnerClan = clanA;
                hex.troops = { [clanA]: survivorsA };
                if (survivorsB > 0 && pB) pB.handTroops += survivorsB;
            } else if (survivorsB > survivorsA) {
                summary.winnerClan = clanB;
                hex.troops = { [clanB]: survivorsB };
                if (survivorsA > 0 && pA) pA.handTroops += survivorsA;
            } else {
                if (survivorsA > 0 && pA) pA.handTroops += survivorsA;
                if (survivorsB > 0 && pB) pB.handTroops += survivorsB;
                hex.troops = {};
            }
        } else {
            this.telemetry.combatsMajorityWins++;
            summary.winnerClan = majClan;
            summary.bannerAwarded = true;
            const pWinner = majClan === clanA ? pA : pB;
            pWinner.banners += 1;
            this.telemetry.bannersAwarded = (this.telemetry.bannersAwarded || 0) + 1;

            const survivorsWinner = majClan === clanA ? survivorsA : survivorsB;
            const survivorsLoser = majClan === clanA ? survivorsB : survivorsA;
            const pLoser = majClan === clanA ? pB : pA;

            if (survivorsWinner > 0) {
                hex.troops = { [majClan]: survivorsWinner };
            } else {
                hex.troops = {};
            }
            if (survivorsLoser > 0 && pLoser) {
                pLoser.handTroops += survivorsLoser;
            }
        }

        // Si sobrevivió el Líder ganador, se queda en la casilla
        if (summary.winnerClan === clanA && optA?.hasLeader && pA.leaderAlive) {
            hex.leader = clanA;
            pA.leaderHexId = hex.id;
        } else if (summary.winnerClan === clanB && optB?.hasLeader && pB.leaderAlive) {
            hex.leader = clanB;
            pB.leaderHexId = hex.id;
        }

        delete hex.attacker;
        clans.forEach(c => {
            if ((hex.troops[c] || 0) <= 0) delete hex.troops[c];
        });

        this.lastCombatResolution = summary;
        this.logCombatSummary(summary);
        if (typeof this.onCombatResolved === 'function') {
            this.onCombatResolved(summary);
        }

        if (this.regicideUsurperId && !this.gameOver) {
            this.determineWinner();
        }

        return summary;
    }

    logCombatSummary(s) {
        const nameA = s.pA?.short || s.clanA;
        const nameB = s.pB?.short || s.clanB;
        this.addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'combat');
        this.addLog(`⚔️ COMBATE RESUELTO EN HEX #${s.hexId}: ${nameA} (${s.countA}) vs ${nameB} (${s.countB})`, 'combat');
        if (s.isTie) {
            this.addLog(`⚖️ Choque Igualado (${s.countA} vs ${s.countB}): Bajas mutuas completas (${s.baseLossA} vs ${s.baseLossB}).`, 'combat');
        } else {
            const majName = s.majClan === s.clanA ? nameA : nameB;
            const minName = s.minClan === s.clanA ? nameA : nameB;
            const majC = Math.max(s.countA, s.countB);
            const minC = Math.min(s.countA, s.countB);
            const baseMaj = Math.max(0, minC - 1);
            this.addLog(`👑 Mayoría: ${majName} (${majC}) vs ${minName} (${minC}). Regla oficial v1.4: Mayoría pierde ${baseMaj} baja(s) (${minC} - 1), Minoría pierde ${minC} baja(s).`, 'combat');
        }

        // Señalización de Mitigaciones
        if (s.garrisonSaveA) this.addLog(`🛡️ [MITIGACIÓN POR GUARNICIÓN] Castillo aliado con Guarnición previene 1 baja para ${nameA}.`, 'feat');
        if (s.garrisonSaveB) this.addLog(`🛡️ [MITIGACIÓN POR GUARNICIÓN] Castillo aliado con Guarnición previene 1 baja para ${nameB}.`, 'feat');

        // Retorno de Bajas a Reserva
        this.addLog(`♻️ Bajas retiradas a Reserva: ${nameA} (+${s.finalLossA} a Reserva), ${nameB} (+${s.finalLossB} a Reserva).`, 'action');
        if (s.savedToHandA > 0) this.addLog(`✨ ${nameA} salva ${s.savedToHandA} tropa(s) por mitigación (regresa a su Mano).`, 'action');
        if (s.savedToHandB > 0) this.addLog(`✨ ${nameB} salva ${s.savedToHandB} tropa(s) por mitigación (regresa a su Mano).`, 'action');

        if (s.winnerClan) {
            const winnerName = CLANS[s.winnerClan]?.short || s.winnerClan;
            const winnerTroops = this.hexMap.get(s.hexId)?.troops?.[s.winnerClan] || 0;
            this.addLog(`🏆 ¡${winnerName} controla Hex #${s.hexId} con ${winnerTroops} tropa(s)! ${s.bannerAwarded ? '🚩 Obtiene 1 Estandarte de victoria.' : ''}`, 'feat');
        } else {
            this.addLog(`Hex #${s.hexId} queda desierto tras el combate (0 tropas).`, 'info');
        }
        this.addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'combat');
    }

    passTurn() {
        if (this.round === 0 || this.isProcessing) return;
        this.addLog(`${this.getActivePlayer().short} finaliza voluntariamente su turno.`, 'info');
        this.resolveCombats();
    }

    // =========================================================================
    // 🏆 6. TABLERO DE HAZAÑAS Y CONDICIÓN DE VICTORIA (Ruleset.pdf v1.4)
    // =========================================================================

    checkFeats(isEndOfRound = false) {
        if (!this.claimedFeats) this.claimedFeats = {};
        FEATS.forEach(feat => {
            // Hazañas posicionales (Dominio Feudal, Señor de Castillos, Asolador) se evalúan ÚNICAMENTE al final de la ronda completa
            if (!isEndOfRound && (feat.id === 'dominio_feudal' || feat.id === 'senor_castillos' || feat.id === 'asolador')) {
                return;
            }
            if (!this.claimedFeats[feat.id]) this.claimedFeats[feat.id] = [];
            for (let p of this.players) {
                if (!p.feats.includes(feat.id)) {
                    if (feat.check(p, this)) {
                        p.feats.push(feat.id);
                        this.claimedFeats[feat.id].push(p.id);
                        this.telemetry.featsClaimed[feat.id] = (this.telemetry.featsClaimed[feat.id] || 0) + 1;
                        this.addLog(`🌟 ¡HAZAÑA CONSEGUIDA! ${p.short} logra: "${feat.name}" (${feat.desc})`, 'feat');

                        // Activar Ronda de Coronación si alguien alcanza las Hazañas objetivo
                        const reachedFeats = p.feats.length >= (this.rules.FEATS_TO_WIN || 3);
                        if (reachedFeats && !this.finalRoundTriggered) {
                            this.finalRoundTriggered = true;
                            this.coronationCandidateId = p.id;
                            this.telemetry.finalRoundTriggeredAt = this.round;
                            this.telemetry.coronationsTriggered = (this.telemetry.coronationsTriggered || 0) + 1;
                            this.addLog(`👑━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'system');
                            this.addLog(`👑 ¡MARCHA HACIA KIOTO! ${p.short} alcanza ${this.rules.FEATS_TO_WIN || 3} Hazañas y es proclamado ASPIRANTE A SHŌGUN.`, 'system');
                            this.addLog(`⚔️ Comienza la RONDA DE CORONACIÓN. ¡Los demás clanes deben aliarse para cometer REGICIDIO (derrotar a su Daimyō en combate campal o asediar su Capital)! Si un clan lo logra, ¡USURPA EL TRONO y gana la partida!`, 'system');
                            this.addLog(`👑━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'system');
                        }
                    }
                }
            }
        });
    }

    endTurn() {
        if (this.gameOver) return;

        // Comprobar si la ronda completa ha terminado (el siguiente sería el poseedor actual del Mando)
        const nextIdx = (this.activePlayerIdx + 1) % this.players.length;
        if (nextIdx === this.mandoPlayerIdx) {
            // Fin de la ronda completa: evaluar hazañas posicionales tras todos los movimientos y combates
            this.checkFeats(true);

            if (this.gameOver) return;

            // Si la Ronda de Coronación ya estaba activa y se ha completado la ronda de supervivencia:
            if (this.coronationRoundActive) {
                this.determineWinner();
                return;
            }

            // Si la coronación fue detonada en esta ronda (ya sea a mitad de ronda o al final por hazaña posicional),
            // la siguiente ronda será la Ronda de Coronación oficial donde todos los clanes juegan su turno de regicidio/defensa
            if (this.finalRoundTriggered && !this.coronationRoundActive) {
                this.coronationRoundActive = true;
                const cand = this.players.find(p => p.id === this.coronationCandidateId);
                this.addLog('==================================================', 'system');
                this.addLog(`👑🔔 ¡COMIENZA LA RONDA DE CORONACIÓN! Todos los clanes disponen de una última ronda para frenar a ${cand ? cand.short : 'el Aspirante'} cometiendo REGICIDIO (abatiendo a su Daimyō o asediando su Capital).`, 'system');
                this.addLog('==================================================', 'system');
            }

            this.round += 1;

            // En partidas de 2 Jugadores (1v1): EL MANDO NO ROTA para evitar el doble turno consecutivo.
            // En 3 o 4 jugadores: el mando pasa al jugador de la izquierda (sentido horario).
            if (this.players.length > 2) {
                this.mandoPlayerIdx = (this.mandoPlayerIdx + 1) % this.players.length;
                this.players.forEach((p, idx) => {
                    p.hasMando = (idx === this.mandoPlayerIdx);
                });
            }

            // Reset de mitigaciones de ronda (Guarnición: 1 uso por recurso por ronda)
            this.players.forEach(p => {
                p.garrisonMitigationUsedThisRound = false;
            });
            this.activePlayerIdx = this.mandoPlayerIdx;

            this.addLog('==================================================', 'system');
            this.addLog(`👑 Fin de la Ronda. ¡Comienza Ronda ${this.round}! ${this.players.length > 2 ? `La Ficha de Mando pasa a ${this.getActivePlayer().short}.` : ''}`, 'system');
            this.addLog('==================================================', 'system');
        } else {
            this.activePlayerIdx = nextIdx;
        }

        this.startTurn();
    }

    determineWinner() {
        this.gameOver = true;

        // 1. Caso Regicidio y Usurpación (Gekokujō)
        if (this.regicideUsurperId) {
            this.winner = this.players.find(p => p.id === this.regicideUsurperId);
            this.victoryReason = 'REGICIDE_USURPATION';
            const cand = this.players.find(p => p.id === this.coronationCandidateId);
            const candName = cand ? cand.name : 'Aspirante';
            this.addLog('==================================================', 'system');
            this.addLog(`👑🗡️ ¡¡GEKOKUJŌ - EL DE ABAJO DERROCA AL DE ARRIBA!! ¡${this.winner.name} (${this.winner.short}) comete Regicidio contra ${candName} y usurpa el Shogunato en la Ronda de Coronación!`, 'system');
            this.addLog(`🏆 ¡Victoria inmediata por Usurpación del Trono! Hazañas: ${this.winner.feats.length} | Estandartes: ${this.winner.banners}`, 'feat');
            this.addLog('==================================================', 'system');
            this.notifyStateChange();
            return;
        }

        // 2. Caso Coronación Exitosa o Capital Asediada al Cierre
        if (this.coronationCandidateId) {
            const cand = this.players.find(p => p.id === this.coronationCandidateId);
            const capHex = this.hexMap.get(cand?.capitalShiroHexId);
            const capBesiegedBy = (capHex && capHex.siege && capHex.siege !== cand.id) ? capHex.siege : null;

            if (capBesiegedBy) {
                this.regicideUsurperId = capBesiegedBy;
                this.winner = this.players.find(p => p.id === capBesiegedBy);
                this.victoryReason = 'REGICIDE_USURPATION';
                this.telemetry.regicidesExecuted = (this.telemetry.regicidesExecuted || 0) + 1;
                this.addLog('==================================================', 'system');
                this.addLog(`🏯🔥 ¡¡GOLPE DE ESTADO Y REGICIDIO!! La Capital de ${cand.short} terminó bajo asedio de ${this.winner.short}. ¡${this.winner.name} usurpa el Trono!`, 'system');
                this.addLog('==================================================', 'system');
                this.notifyStateChange();
                return;
            }

            if (cand && cand.leaderAlive) {
                this.winner = cand;
                this.victoryReason = 'CORONATION_SURVIVED';
                this.telemetry.coronationsSurvived = (this.telemetry.coronationsSurvived || 0) + 1;
                this.addLog('==================================================', 'system');
                this.addLog(`👑🎌 ¡¡CORONACIÓN TRIUNFAL!! ${cand.name} (${cand.short}) ha resistido la embestida de todos los clanes rivales en la Ronda de Coronación. Su Daimyō vive y su Capital permanece inexpugnable.`, 'system');
                this.addLog(`🏆 ¡El nuevo Shogun de Japón es ${cand.name}! Hazañas: ${cand.feats.length} | Estandartes: ${cand.banners}`, 'feat');
                this.addLog('==================================================', 'system');
                this.notifyStateChange();
                return;
            }
        }

        // 3. Fallback: Orden de resolución oficial por criterios estándar
        // 1. Mayor número de Hazañas
        // 2. Mayor número de Estandartes en combate
        // 3. Mayor número de Castillos controlados sin asedio
        // 4. Mayor número de Tropas totales en tablero
        // 5. En caso de 3+ jugadores únicamente, prioridad por turno respecto al Mando
        const sorted = [...this.players].sort((a, b) => {
            if (b.feats.length !== a.feats.length) return b.feats.length - a.feats.length;
            if (b.banners !== a.banners) return b.banners - a.banners;
            const shirosA = this.countPlayerUnbesiegedShiros(a.id);
            const shirosB = this.countPlayerUnbesiegedShiros(b.id);
            if (shirosB !== shirosA) return shirosB - shirosA;
            const boardA = this.countPlayerBoardTroops(a.id).total;
            const boardB = this.countPlayerBoardTroops(b.id).total;
            if (boardB !== boardA) return boardB - boardA;
            if (this.players.length > 2) {
                const distA = (this.players.indexOf(a) - this.mandoPlayerIdx + this.players.length) % this.players.length;
                const distB = (this.players.indexOf(b) - this.mandoPlayerIdx + this.players.length) % this.players.length;
                return distA - distB;
            }
            return 0;
        });

        this.winner = sorted[0];
        this.victoryReason = 'STANDARD_TIEBREAK';
        const isTiebreak = this.players.filter(p => p.feats.length === this.winner.feats.length).length > 1;
        if (isTiebreak) this.telemetry.mandoTiebreaks++;

        this.addLog('==================================================', 'system');
        this.addLog(`🎌 ¡FIN DE LA PARTIDA! El nuevo Shogun de Japón es: ${this.winner.name} (${this.winner.short}).`, 'system');
        this.addLog(`🏆 Hazañas: ${this.winner.feats.length} | 🚩 Estandartes: ${this.winner.banners} | 🏯 Castillos libres: ${this.countPlayerUnbesiegedShiros(this.winner.id)}`, 'system');
        this.addLog('==================================================', 'system');
        this.notifyStateChange();
    }

    // =========================================================================
    // 📊 CONTEOS Y DETECTORES AUXILIARES
    // =========================================================================

    countPlayerShiros(clanId) {
        let count = 0;
        this.hexMap.forEach(h => {
            if (h.shiro === clanId) count++;
        });
        return count;
    }

    countPlayerUnbesiegedShiros(clanId) {
        let count = 0;
        this.hexMap.forEach(h => {
            if (h.shiro === clanId && !h.siege) count++;
        });
        return count;
    }

    countPlayerGarrisons(clanId) {
        let count = 0;
        this.hexMap.forEach(h => {
            if (h.shiro === clanId && h.garrison === clanId) count++;
        });
        return count;
    }

    countPlayerTroops(clanId) {
        let count = 0;
        this.hexMap.forEach(h => {
            if (h.troops) {
                count += (h.troops[clanId] || 0);
            }
        });
        return count;
    }

    countPlayerBoardTroops(clanId) {
        let mobile = 0;
        let garrisons = 0;
        let sieges = 0;
        this.hexMap.forEach(h => {
            if (h.troops && h.troops[clanId]) mobile += h.troops[clanId];
            if (h.garrison === clanId) garrisons++;
            if (h.siege === clanId) sieges++;
        });
        return { mobile, garrisons, sieges, total: mobile + garrisons + sieges };
    }

    getPlayerTroopAudit(clanId) {
        const p = this.players.find(x => x.id === clanId);
        if (!p) return { hand: 0, reserve: 0, boardMobile: 0, garrisons: 0, sieges: 0, totalBoard: 0, total: 0 };
        const board = this.countPlayerBoardTroops(clanId);
        return {
            clanId,
            hand: p.handTroops,
            reserve: p.reserveTroops,
            boardMobile: board.mobile,
            garrisons: board.garrisons,
            sieges: board.sieges,
            totalBoard: board.total,
            total: p.handTroops + p.reserveTroops + board.total
        };
    }

    countPlayerPoi(clanId, poiType) {
        let count = 0;
        this.hexMap.forEach(h => {
            if (h.type === poiType && h.troops && (h.troops[clanId] || 0) > 0) count++;
        });
        return count;
    }

    hasExclusivePoiControl(clanId, poiType) {
        let count = 0;
        this.hexMap.forEach(h => {
            if (h.type === poiType && h.troops && (h.troops[clanId] || 0) > 0) {
                const hasEnemy = Object.keys(h.troops).some(c => c !== clanId && (h.troops[c] || 0) > 0);
                if (!hasEnemy) count++;
            }
        });
        return count;
    }

    countPlayerActiveSieges(clanId) {
        let count = 0;
        this.hexMap.forEach(h => {
            if (h.shiro && h.shiro !== clanId && h.siege === clanId) count++;
        });
        return count;
    }

    // Detector de Maestro Táctico: Rodea un Castillo enemigo por completo
    checkPlayerSurroundsEnemyShiro(clanId) {
        let isSurrounded = false;
        this.hexMap.forEach(h => {
            if (isSurrounded) return;
            if (h.shiro && h.shiro !== clanId) {
                const accessibleNeighbors = h.neighbors.filter(nId => {
                    const nh = this.hexMap.get(nId);
                    return nh && nh.type !== 'montana' && nh.type !== 'lago';
                });
                if (accessibleNeighbors.length >= 2) {
                    const allOccupied = accessibleNeighbors.every(nId => {
                        const nh = this.hexMap.get(nId);
                        return nh && nh.troops && (nh.troops[clanId] || 0) > 0;
                    });
                    if (allOccupied) {
                        isSurrounded = true;
                    }
                }
            }
        });
        return isSurrounded;
    }

    // =========================================================================
    // 🤖 IA TÁCTICA ORIENTADA A OBJETIVOS (HAZAÑAS DEL SHOGUN)
    // =========================================================================

    getHexDistance(fromId, toId) {
        if (fromId === toId) return 0;
        const queue = [[fromId, 0]];
        const visited = new Set([fromId]);
        while (queue.length > 0) {
            const [currId, dist] = queue.shift();
            const curr = this.hexMap.get(currId);
            if (!curr) continue;
            for (let nId of curr.neighbors) {
                if (nId === toId) return dist + 1;
                const n = this.hexMap.get(nId);
                if (n && n.type !== 'montana' && n.type !== 'lago' && !visited.has(nId)) {
                    visited.add(nId);
                    queue.push([nId, dist + 1]);
                }
            }
        }
        return 999;
    }

    scoreAiMove(fromId, toId, clanId) {
        let score = 0;
        const dest = this.hexMap.get(toId);
        if (!dest) return -9999;

        // 0. Prioridad en la Ronda de Coronación (Regicidio vs Defensa de la Corona)
        if (this.finalRoundTriggered && this.coronationCandidateId) {
            const cand = this.players.find(x => x.id === this.coronationCandidateId);
            const candCapitalHexId = cand?.capitalShiroHexId;
            const candLeaderHexId = cand?.leaderHexId;
            const fromHex = this.hexMap.get(fromId);

            if (clanId === this.coronationCandidateId) {
                // El Aspirante defiende su trono:
                if (candCapitalHexId) {
                    if (toId === candCapitalHexId && !dest.garrison && !dest.siege) {
                        score += 3500; // Guarnecer la capital
                    }
                    const dFromCap = this.getHexDistance(fromId, candCapitalHexId);
                    const dToCap = this.getHexDistance(toId, candCapitalHexId);
                    if (dToCap < dFromCap) {
                        score += 900; // Acercarse a la capital para defenderla
                    }
                }
                if (fromHex && fromHex.leader === clanId) {
                    const enemies = Object.keys(dest.troops || {}).filter(c => c !== clanId);
                    if (enemies.length > 0 && (dest.troops[enemies[0]] || 0) >= 2) {
                        score -= 6000; // Evitar que el Daimyō muera
                    }
                }
            } else {
                // Rivales: ¡Caza de Regicidio!
                // Objetivo 1: Capital del Aspirante
                if (candCapitalHexId) {
                    if (toId === candCapitalHexId && !dest.garrison) {
                        return 15000; // ¡¡ASEDIAR CAPITAL DEL ASPIRANTE = REGICIDIO INMEDIATO!!
                    }
                    const distBeforeCap = this.getHexDistance(fromId, candCapitalHexId);
                    const distAfterCap = this.getHexDistance(toId, candCapitalHexId);
                    if (distAfterCap < distBeforeCap) {
                        score += (distAfterCap <= 1) ? 3500 : 1800; // Marchar hacia la capital del aspirante
                    }
                }

                // Objetivo 2: Daimyō del Aspirante
                if (candLeaderHexId && cand?.leaderAlive) {
                    if (toId === candLeaderHexId) {
                        const myCount = (dest.troops?.[clanId] || 0) + 1;
                        const candTroops = dest.troops?.[this.coronationCandidateId] || 0;
                        if (myCount >= candTroops) {
                            return 14000; // ¡¡ATACAR Y ELIMINAR AL DAIMYŌ = REGICIDIO!!
                        } else {
                            score += 4000; // Desgastar escolta del Daimyō
                        }
                    }
                    const distBeforeLdr = this.getHexDistance(fromId, candLeaderHexId);
                    const distAfterLdr = this.getHexDistance(toId, candLeaderHexId);
                    if (distAfterLdr < distBeforeLdr) {
                        score += (distAfterLdr <= 1) ? 3000 : 1500; // Perseguir al Daimyō
                    }
                }
            }
        }

        // 1. Asedio directo a castillo rival (Hazaña: Asolador)
        if (dest.shiro && dest.shiro !== clanId) {
            if (!dest.garrison) {
                return 2600; // ¡Máxima prioridad ofensiva!
            }
        }

        // 2. Recuperar castillo propio asediado (Expulsa asedio rival y salva Señor de Castillos)
        if (dest.shiro === clanId && dest.siege) {
            const rivalSupportHexes = dest.neighbors.filter(nnId => {
                const nh = this.hexMap.get(nnId);
                return nh && nh.troops && (nh.troops[dest.siege] || 0) > 0;
            });
            // Si el rival tiene tropas de soporte, el asalto desgasta su soporte; si no, libera el castillo
            return rivalSupportHexes.length > 0 ? 1400 : 2800;
        }

        // 3. Preparar flanqueo para asediar rival, sostener asedios activos o liberar castillo propio
        let adjEnemyShiro = false;
        let adjOwnBesieged = false;
        let adjEnemyBesiegedByMe = false;
        dest.neighbors.forEach(nnId => {
            const n = this.hexMap.get(nnId);
            if (n && n.shiro && n.shiro !== clanId && !n.garrison) adjEnemyShiro = true;
            if (n && n.shiro === clanId && n.siege) adjOwnBesieged = true;
            if (n && n.shiro && n.shiro !== clanId && n.siege === clanId) adjEnemyBesiegedByMe = true;
        });
        if (adjOwnBesieged) score += 650;
        if (adjEnemyShiro) score += 450;
        if (adjEnemyBesiegedByMe) score += 600; // ¡Mantener soporte adyacente para proteger el asedio contra contra-asedios!

        // 4. Combates y Mayorías (Hazaña: Sangre y Acero - 6 Estandartes)
        const enemyClans = Object.keys(dest.troops || {}).filter(c => c !== clanId);
        if (enemyClans.length > 0) {
            const enemyCount = dest.troops[enemyClans[0]] || 0;
            const myCurrentInDest = (dest.troops[clanId] || 0);
            const myNewCount = myCurrentInDest + 1;

            if (myNewCount > enemyCount) {
                score += 750; // ¡Mayoría asegurada! Bajas mínimas y gana 1 Estandarte
            } else if (myNewCount === enemyCount) {
                score += 250; // Choque igualado
            } else {
                score -= 350; // Desventaja numérica
            }
        }

        // 5. Aldeas (#18, #116) y Torii (#67) (Hazaña Dominio Feudal: Torii + Aldea)
        const aldeas = [18, 116];
        const ownsAldea = this.hasExclusivePoiControl(clanId, 'aldea') > 0;
        const ownsTorii = this.hasExclusivePoiControl(clanId, 'torii') > 0;
        const pClan = this.players.find(x => x.id === clanId);
        const hasControlledTorii = pClan?.hasControlledToriiOnce;

        // A. Casilla de Aldea (#18, #116)
        if (dest.type === 'aldea') {
            const myTroopsThere = dest.troops?.[clanId] || 0;
            if (myTroopsThere === 0) {
                // Si ya tiene el Torii, ¡conquistar la Aldea completa Dominio Feudal!
                score += ownsTorii ? 2400 : (hasControlledTorii ? 1400 : 900);
            } else {
                score += 400; // Mantener presencia en la aldea
            }
        } else if (!ownsAldea) {
            let bestDistBefore = 999;
            let bestDistAfter = 999;
            for (let aId of aldeas) {
                const dBefore = this.getHexDistance(fromId, aId);
                const dAfter = this.getHexDistance(toId, aId);
                if (dBefore < bestDistBefore) {
                    bestDistBefore = dBefore;
                    bestDistAfter = dAfter;
                }
            }
            if (bestDistAfter < bestDistBefore) {
                score += ownsTorii ? 550 : 280; // Avanzar hacia la aldea
            }
        }

        // B. Torii Central (#67): Vital para consagrarse (desbloquea Leva de Aldea) y Dominio Feudal
        if (dest.type === 'torii') {
            const myTroopsThere = dest.troops?.[clanId] || 0;
            if (myTroopsThere === 0) {
                // Si aún no ha controlado el Torii en la partida, máxima prioridad para desbloquear Leva de Aldeas
                score += (!hasControlledTorii) ? 2800 : (ownsAldea ? 2500 : 1500);
            } else {
                score += 450; // Sostener el Torii sagrado
            }
        } else if (!hasControlledTorii) {
            const dBeforeTorii = this.getHexDistance(fromId, 67);
            const dAfterTorii = this.getHexDistance(toId, 67);
            if (dAfterTorii < dBeforeTorii) {
                score += 650; // Marcha urgente al centro para consagrarse en el Torii y desbloquear la Leva
            }
        } else if (!ownsTorii) {
            const dBeforeTorii = this.getHexDistance(fromId, 67);
            const dAfterTorii = this.getHexDistance(toId, 67);
            if (dAfterTorii < dBeforeTorii) {
                score += ownsAldea ? 600 : 320; // Rápida marcha al centro para disputar Dominio Feudal
            }
        }

        // 6. Guarnición en propio castillo (defensa si sobran tropas móviles)
        if (dest.shiro === clanId && !dest.garrison && !dest.siege) {
            const mobileTroops = this.countPlayerTroops(clanId);
            if (mobileTroops >= 5) {
                score += 200; // Proteger base si hay suficientes tropas móviles en el mapa
            } else {
                score -= 300; // Evitar inmovilizar tropas necesarias en el frente
            }
        }

        // 7. Apilarse con tropas aliadas (crear stacks de 2 o 3 para defensa y asalto)
        const myTroopsInDest = dest.troops?.[clanId] || 0;
        if (myTroopsInDest >= 1 && myTroopsInDest < this.rules.MAX_TROOPS_PER_HEX) {
            score += 150;
        }

        return score;
    }

    runAiTurn() {
        const p = this.getActivePlayer();
        if (this.gameOver || this.round === 0 || !p.isAi) return;

        const ownsAldea = this.hasExclusivePoiControl(p.id, 'aldea') > 0;
        const ownsTorii = this.hasExclusivePoiControl(p.id, 'torii') > 0;
        const targetAldeaId = (p.id === 'rojo' || p.id === 'verde') ? 18 : 116;
        // Si no ha controlado el Torii al menos una vez, ir al Torii (#67) es la prioridad número uno
        const targetPoiId = (!p.hasControlledToriiOnce) ? 67 :
                            (!ownsAldea && ownsTorii) ? targetAldeaId :
                            (ownsAldea && !ownsTorii) ? 67 :
                            (Math.random() < 0.5 ? targetAldeaId : 67);

        // 1. Campaña si es viable (Hazaña: Señor de Castillos)
        if (p.handTroops >= this.rules.CAMPAIGN_TROOP_COST && p.reserveShiros >= 1 && !this.campaignUsedThisTurn) {
            const campHexes = this.getValidCampaignHexes(p.id);
            if (campHexes.length > 0) {
                campHexes.sort((aId, bId) => {
                    return this.getHexDistance(aId, targetPoiId) - this.getHexDistance(bId, targetPoiId);
                });
                this.campaign(campHexes[0]);
            }
        }

        // 2. Refuerzos tácticos (avanzar hacia Torii central o Aldeas)
        let reinforceHexes = this.getValidReinforceHexes(p.id);
        while (p.handTroops >= 1 && reinforceHexes.length > 0) {
            reinforceHexes.sort((aId, bId) => {
                return this.getHexDistance(aId, targetPoiId) - this.getHexDistance(bId, targetPoiId);
            });
            const pick = reinforceHexes[0];
            this.reinforce(pick);
            reinforceHexes = this.getValidReinforceHexes(p.id);
        }

        // 3. Maniobra táctica orientada a Hazañas y Puntos de Interés
        this.goToManeuverPhase();
        while (this.movesLeft > 0) {
            let bestMove = null;
            let bestScore = -9999;

            const myHexes = [];
            this.hexMap.forEach(h => {
                if (h.troops && (h.troops[p.id] || 0) > 0) myHexes.push(h);
            });
            if (myHexes.length === 0) break;

            for (let source of myHexes) {
                const dests = this.getValidMoveDestinations(source.id, p.id);
                for (let destId of dests) {
                    const score = this.scoreAiMove(source.id, destId, p.id);
                    if (score > bestScore) {
                        bestScore = score;
                        bestMove = { from: source.id, to: destId };
                    }
                }
            }

            if (bestMove && bestScore > -200) {
                this.moveTroop(bestMove.from, bestMove.to);
            } else {
                break;
            }
        }

        // 4. Resolver combates y ceder turno
        this.resolveCombats();
    }

    simulateFullGame(maxRounds = 50) {
        while (this.round === 0 && !this.gameOver) {
            if (this.turnPhase === 'SETUP_SHIRO') this.runAiSetup();
            else if (this.turnPhase === 'SETUP_ASHIGARU') this.runAiSetupAshigaru();
        }
        while (!this.gameOver && this.round <= maxRounds) {
            this.runAiTurn();
        }
        return {
            winner: this.winner ? this.winner.name : 'Límite de rondas alcanzado',
            rounds: this.round,
            featsSummary: this.claimedFeats,
            telemetry: this.telemetry
        };
    }
}

window.GameEngine = GameEngine;
window.CONFIGURABLE_RULES = CONFIGURABLE_RULES;
window.CLANS = CLANS;
window.FEATS = FEATS;
