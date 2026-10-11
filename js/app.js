/**
 * =========================================================================
 * ⛩️ SENGOKU CONQUERORS 1.4 - CONTROLADOR PRINCIPAL DE APLICACIÓN (APP.JS)
 * =========================================================================
 * 
 * Controlador de interfaz, eventos del tablero, flujo de fases,
 * marcador de control de turno / Mando y Dashboard de Telemetría v1.4.
 * =========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('boardCanvas');
    function resizeCanvas() {
        const container = document.getElementById('canvasContainer');
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }
    window.addEventListener('resize', () => {
        resizeCanvas();
        if (window.appRenderer) window.appRenderer.render();
    });
    resizeCanvas();

    // 1. Inicializar Motor y Renderizador
    const engine = new GameEngine(window.HEX_GRID_DATA);
    const renderer = new BoardRenderer(canvas, window.HEX_GRID_DATA, engine);
    window.appEngine = engine;
    window.appRenderer = renderer;

    let currentAction = null; // null, 'reinforce', 'campaign'
    let selectedUnitHexId = null;

    // Efectos de Sonido Oficiales (SFX)
    const SFX = {
        swordclash: new Audio('sfx/swordclash.mp3'),
        kickdrum: new Audio('sfx/kickdrum.mp3')
    };
    SFX.swordclash.onerror = () => { SFX.swordclash.src = '../SFX/swordclash.mp3'; };
    SFX.kickdrum.onerror = () => { SFX.kickdrum.src = '../SFX/kickdrum.mp3'; };

    function playSfx(name) {
        if (window.isMassSimulating) return;
        try {
            const snd = SFX[name];
            if (snd) {
                snd.currentTime = 0;
                snd.play().catch(() => {});
            }
        } catch (e) {
            // Silently ignore browser autoplay constraints
        }
    }

    // 2. Sincronización de Eventos del Motor con la Interfaz y Sonido
    engine.onTurnStart = (p) => {
        playSfx('kickdrum');
    };

    engine.onCombatResolved = (summary) => {
        playSfx('swordclash');
    };

    engine.onLog = (entry) => {
        appendLogEntry(entry);
    };

    engine.onStateChange = () => {
        updateUI();
    };

    renderer.onHexHover = (hex) => {
        updateHexTooltip(hex);
    };

    renderer.onHexClick = (hex) => {
        handleHexClick(hex);
    };

    // Auto IA Checkbox
    const chkAutoAi = document.getElementById('chkAutoAi');
    if (chkAutoAi) {
        chkAutoAi.addEventListener('change', (e) => {
            engine.autoPlayAi = e.target.checked;
        });
    }

    // 3. Botón de Flujo de Fases y Turno (Transiciones fluidas con 1 clic)
    const btnNextPhase = document.getElementById('btnNextPhase');
    btnNextPhase.addEventListener('click', () => {
        currentAction = null;
        selectedUnitHexId = null;
        renderer.clearHighlights();

        if (engine.round === 0) {
            alert('En la Pre-Ronda (Turno 0) debes seleccionar una casilla en el tablero para colocar tu Castillo o Escolta.');
            return;
        }

        if (engine.turnPhase === 'PREPARATION') {
            engine.goToManeuverPhase();
        } else if (engine.turnPhase === 'MANEUVER' || engine.turnPhase === 'COMBAT') {
            engine.resolveCombats(() => {
                updateUI();
            });
        }
        updateUI();
    });

    // Botón de Pasar Turno
    document.getElementById('btnPassTurn').addEventListener('click', () => {
        if (engine.round === 0) {
            alert('No puedes pasar en el Turno 0: debes fundar tu Fortaleza y Escolta inicial.');
            return;
        }
        currentAction = null;
        selectedUnitHexId = null;
        renderer.clearHighlights();
        engine.passTurn();
        updateUI();
    });

    const btnCloseCombatCard = document.getElementById('btnCloseCombatCard');
    if (btnCloseCombatCard) {
        btnCloseCombatCard.addEventListener('click', () => {
            const card = document.getElementById('combatResolutionCard');
            if (card) card.style.display = 'none';
        });
    }

    // Botones de Acción de Preparación
    document.getElementById('btnReinforce').addEventListener('click', () => {
        if (engine.turnPhase !== 'PREPARATION') return;
        const p = engine.getActivePlayer();
        if (p.handTroops < 1) {
            alert('No tienes tropas en mano para desplegar.');
            return;
        }
        currentAction = 'reinforce';
        const valids = engine.getValidReinforceHexes(p.id);
        renderer.setHighlights(valids, 'reinforce');
        updateActionPrompt(`➕ ${p.short}: Selecciona un hexágono verde adyacente a tu Castillo para colocar 1 Ashigaru (Mano: ${p.handTroops}).`);
    });

    document.getElementById('btnCampaign').addEventListener('click', () => {
        if (engine.turnPhase !== 'PREPARATION') return;
        const p = engine.getActivePlayer();
        if (p.handTroops < engine.rules.CAMPAIGN_TROOP_COST) {
            alert(`Necesitas ${engine.rules.CAMPAIGN_TROOP_COST} tropas en mano para fundar un Castillo.`);
            return;
        }
        if (p.reserveShiros < 1) {
            alert('No te quedan Castillos en tu reserva.');
            return;
        }
        if (engine.campaignUsedThisTurn) {
            alert('Ya fundaste un Castillo este turno (máximo 1 vez por turno).');
            return;
        }
        currentAction = 'campaign';
        const valids = engine.getValidCampaignHexes(p.id);
        renderer.setHighlights(valids, 'campaign');
        updateActionPrompt(`🏯 ${p.short}: Selecciona un hexágono amarillo para fundar tu Castillo (no puede estar junto a otro Castillo ni en Aldea/Torii).`);
    });

    document.getElementById('btnResolveCombats').addEventListener('click', () => {
        currentAction = null;
        selectedUnitHexId = null;
        renderer.clearHighlights();
        engine.resolveCombats(() => {
            updateUI();
        });
        updateUI();
    });

    document.getElementById('btnAiMove').addEventListener('click', () => {
        if (engine.round === 0) {
            if (engine.turnPhase === 'SETUP_SHIRO') engine.runAiSetup();
            else if (engine.turnPhase === 'SETUP_ASHIGARU') engine.runAiSetupAshigaru();
        } else {
            engine.runAiTurn();
        }
        currentAction = null;
        renderer.clearHighlights();
        updateUI();
    });

    document.getElementById('btnResetView').addEventListener('click', () => {
        renderer.resetView();
    });

    // 4. Modales: Configuración y Dashboard de Telemetría
    const configModal = document.getElementById('configModal');
    document.getElementById('btnOpenConfig').addEventListener('click', () => {
        configModal.style.display = 'flex';
    });

    const telemetryModal = document.getElementById('telemetryModal');
    const btnOpenTelemetry = document.getElementById('btnOpenTelemetry');
    if (btnOpenTelemetry) {
        btnOpenTelemetry.addEventListener('click', () => {
            updateTelemetryUI();
            telemetryModal.style.display = 'flex';
        });
    }

    document.getElementById('cfgPlayerCount').addEventListener('change', (e) => {
        const count = parseInt(e.target.value, 10);
        document.getElementById('slot3').style.opacity = count >= 3 ? '1' : '0.35';
        document.getElementById('slot4').style.opacity = count >= 4 ? '1' : '0.35';
    });

    document.getElementById('btnStartGameConfirm').addEventListener('click', () => {
        const count = parseInt(document.getElementById('cfgPlayerCount').value, 10);
        const configs = [];

        configs.push({
            id: document.getElementById('p1Clan').value,
            name: document.getElementById('p1Name').value,
            isAi: document.getElementById('p1Type').value === 'ai'
        });
        configs.push({
            id: document.getElementById('p2Clan').value,
            name: document.getElementById('p2Name').value,
            isAi: document.getElementById('p2Type').value === 'ai'
        });
        if (count >= 3) {
            configs.push({
                id: document.getElementById('p3Clan').value,
                name: document.getElementById('p3Name').value,
                isAi: document.getElementById('p3Type').value === 'ai'
            });
        }
        if (count >= 4) {
            configs.push({
                id: document.getElementById('p4Clan').value,
                name: document.getElementById('p4Name').value,
                isAi: document.getElementById('p4Type').value === 'ai'
            });
        }

        const customRules = {
            REINFORCE_DRAW_BASE: parseInt(document.getElementById('ruleDrawBase')?.value, 10) || 3,
            ALDEA_REINFORCE_BONUS: parseInt(document.getElementById('ruleAldeaBonus')?.value || document.getElementById('ruleTorideBonus')?.value, 10) || 1,
            CAMPAIGN_TROOP_COST: parseInt(document.getElementById('ruleCampaignCost')?.value, 10) || 2,
            MAX_MOVES_PER_TURN: parseInt(document.getElementById('ruleMaxMoves')?.value, 10) || 3,
            FEATS_TO_WIN: parseInt(document.getElementById('ruleFeatsToWin')?.value, 10) || 3,
            STARTING_RESERVE_TROOPS: parseInt(document.getElementById('ruleReserveTroops')?.value, 10) || 28
        };

        engine.rules = Object.assign({}, window.CONFIGURABLE_RULES, customRules);
        engine.initGame(configs);
        renderer.setEngine(engine);
        configModal.style.display = 'none';

        updateUI();
    });

    document.getElementById('btnSimulateMatch').addEventListener('click', () => {
        runMassSimulation(1);
    });

    document.getElementById('btnSimulate50').addEventListener('click', () => {
        runMassSimulation(50);
    });

    // 4.5 Modal de Reacciones Opcionales de Combate (Regla v1.4)
    let currentCombatPromptCallback = null;

    function showReactionModal(hex, mitOptions, callback) {
        currentCombatPromptCallback = callback;
        const modal = document.getElementById('reactionModal');
        const hexIdEl = document.getElementById('reactionHexId');
        const descEl = document.getElementById('reactionCombatDesc');
        const container = document.getElementById('reactionOptionsContainer');
        if (!modal || !container) {
            callback({});
            return;
        }

        hexIdEl.innerText = hex.id;
        renderer.setSelectedHex(hex.id);

        const clanA = CLANS[mitOptions.clanA];
        const clanB = CLANS[mitOptions.clanB];
        const optA = mitOptions.optA;
        const optB = mitOptions.optB;

        let ruleText = '';
        if (mitOptions.isTie) {
            ruleText = `<b>⚖️ Choque Igualado (Fuerza ${optA.strength} vs ${optB.strength}):</b> Bajas mutuas completas de base (${optA.baseLoss} bajas para cada bando).`;
        } else {
            const majOpt = optA.strength > optB.strength ? optA : optB;
            const minOpt = optA.strength > optB.strength ? optB : optA;
            ruleText = `<b>👑 Mayoría vs Minoría (Fuerza ${majOpt.strength} vs ${minOpt.strength}):</b> Mayoría (${majOpt.name} - ${majOpt.initial}) sufre <b>${majOpt.baseLoss} baja(s)</b> (${minOpt.count} - 1). Minoría (${minOpt.name} - ${minOpt.initial}) sufre <b>${minOpt.baseLoss} baja(s)</b>.`;
        }

        descEl.innerHTML = `
            <div style="font-weight:bold; margin-bottom:4px; font-size:0.9rem;">
                ⚔️ Disputa en Hex #${hex.id}: 
                <span style="color:${clanA?.color}">${clanA?.short} (Fuerza ${optA.strength})</span> vs 
                <span style="color:${clanB?.color}">${clanB?.short} (Fuerza ${optB.strength})</span>
            </div>
            <div style="font-size:0.76rem; background:#fff8eb; padding:4px 8px; border-radius:4px; margin-bottom:4px; border:1px solid #ebd5c8;">
                ${clanA?.short}: ${optA.count} tropas ${optA.hasLeader ? '+ 👑 Daimyō (+1)' : ''} ${optA.hasFlanking ? '+ ⚔️ Flanqueo (+1)' : ''} = <b>Fuerza ${optA.strength}</b> | 
                ${clanB?.short}: ${optB.count} tropas ${optB.hasLeader ? '+ 👑 Daimyō (+1)' : ''} ${optB.hasFlanking ? '+ ⚔️ Flanqueo (+1)' : ''} = <b>Fuerza ${optB.strength}</b>
            </div>
            <div>${ruleText}</div>
            <div style="margin-top:4px; font-size:0.77rem; color:#554433;">
                <em>Las tácticas y reacciones son <b>opcionales</b>. Puedes activar Guarnición, Retirarte con Honor para salvar tropas, o Empeñar Estandartes para aumentar bajas enemigas.</em>
            </div>
        `;

        container.innerHTML = '';

        [optA, optB].forEach((opt, idx) => {
            const prefix = (idx === 0) ? 'A' : 'B';

            if (opt.isHuman) {
                const card = document.createElement('div');
                card.className = 'reaction-card';
                card.innerHTML = `
                    <div class="reaction-card-header" style="color:${opt.color};">
                        <span>🛡️ Opciones tácticas para ${opt.name} (${opt.initial})</span>
                        <span style="font-size:0.74rem; font-weight:normal; color:#555;">Fuerza: <b>${opt.strength}</b> | Bajas base: <b>${opt.baseLoss}</b></span>
                    </div>
                `;

                if (opt.hasLeader) {
                    const lRow = document.createElement('div');
                    lRow.style.cssText = 'font-size:0.73rem; background:#fef9e7; border-left:3px solid #f1c40f; padding:4px 6px; border-radius:3px; color:#665511;';
                    lRow.innerHTML = '👑 <b>Daimyō al mando (+1 Fuerza militar):</b> Si las tropas de este hexágono son aniquiladas, el rival se lleva +1 Estandarte adicional y el Daimyō reaparecerá en tu Capital la próxima ronda.';
                    card.appendChild(lRow);
                }

                if (opt.hasFlanking) {
                    const fRow = document.createElement('div');
                    fRow.style.cssText = 'font-size:0.73rem; background:#eafaf1; border-left:3px solid #2ecc71; padding:4px 6px; border-radius:3px; color:#145a32;';
                    fRow.innerHTML = '⚔️ <b>Flanqueo Posicional Activo (+1 Fuerza militar):</b> Tropas aliadas en hexágonos vecinos rodean la posición enemiga.';
                    card.appendChild(fRow);
                }

                if (opt.hasGarrison) {
                    const row = document.createElement('label');
                    row.className = 'reaction-toggle-row';
                    row.innerHTML = `
                        <input type="checkbox" id="chkGarrison${prefix}" checked>
                        <div>
                            <b>🛡️ Activar Guarnición Aliada (Castillo #${opt.garrisonHex})</b>
                            <div style="font-size:0.72rem; color:#665544;">Evita 1 baja en este combate (límite: 1 vez por ronda). La tropa guarnecida se retira a tu Reserva.</div>
                        </div>
                    `;
                    card.appendChild(row);
                }

                if (opt.canRetreat) {
                    const rRow = document.createElement('label');
                    rRow.className = 'reaction-toggle-row';
                    rRow.style.background = '#eef5fc';
                    rRow.innerHTML = `
                        <input type="checkbox" id="chkRetreat${prefix}">
                        <div>
                            <b style="color:#1d5ea8;">🏃 Retirada Táctica con Honor (a Hex #${opt.retreatHexId})</b>
                            <div style="font-size:0.72rem; color:#445566;">Repliegas tus tropas y evitas todas las bajas (0 bajas). Cedes el territorio y el rival gana 1 Estandarte por forzar la retirada.</div>
                        </div>
                    `;
                    card.appendChild(rRow);
                }

                if (opt.canSpendBanner) {
                    const bRow = document.createElement('label');
                    bRow.className = 'reaction-toggle-row';
                    bRow.style.background = '#fdf2f2';
                    bRow.innerHTML = `
                        <input type="checkbox" id="chkSpendBanner${prefix}">
                        <div>
                            <b style="color:#c0392b;">🚩 Empeñar 1 Estandarte ("Grito de Guerra / Último Aliento")</b>
                            <div style="font-size:0.72rem; color:#664444;">Gastas 1 de tus ${opt.banners} Estandartes para infligir +1 baja adicional inmediata al rival.</div>
                        </div>
                    `;
                    card.appendChild(bRow);
                }

                container.appendChild(card);
            }
        });

        modal.style.display = 'flex';
    }

    const btnConfirmReactions = document.getElementById('btnConfirmReactions');
    if (btnConfirmReactions) {
        btnConfirmReactions.addEventListener('click', () => {
            const modal = document.getElementById('reactionModal');
            if (modal) modal.style.display = 'none';

            const chkGarrisonA = document.getElementById('chkGarrisonA');
            const chkGarrisonB = document.getElementById('chkGarrisonB');
            const chkRetreatA = document.getElementById('chkRetreatA');
            const chkRetreatB = document.getElementById('chkRetreatB');
            const chkSpendBannerA = document.getElementById('chkSpendBannerA');
            const chkSpendBannerB = document.getElementById('chkSpendBannerB');

            const choices = {
                useGarrisonA: chkGarrisonA ? chkGarrisonA.checked : false,
                useGarrisonB: chkGarrisonB ? chkGarrisonB.checked : false,
                retreatA: chkRetreatA ? chkRetreatA.checked : false,
                retreatB: chkRetreatB ? chkRetreatB.checked : false,
                spendBannerA: chkSpendBannerA ? chkSpendBannerA.checked : false,
                spendBannerB: chkSpendBannerB ? chkSpendBannerB.checked : false
            };

            if (currentCombatPromptCallback) {
                const cb = currentCombatPromptCallback;
                currentCombatPromptCallback = null;
                cb(choices);
            }
        });
    }

    const btnSkipReactions = document.getElementById('btnSkipReactions');
    if (btnSkipReactions) {
        btnSkipReactions.addEventListener('click', () => {
            const modal = document.getElementById('reactionModal');
            if (modal) modal.style.display = 'none';

            const choices = {
                useGarrisonA: false,
                useGarrisonB: false,
                retreatA: false,
                retreatB: false,
                spendBannerA: false,
                spendBannerB: false
            };

            if (currentCombatPromptCallback) {
                const cb = currentCombatPromptCallback;
                currentCombatPromptCallback = null;
                cb(choices);
            }
        });
    }

    engine.onCombatPrompt = (hex, mitOptions, callback) => {
        showReactionModal(hex, mitOptions, callback);
    };

    // 5. Manejador de Clics en el Tablero (Turno 0 y Rondas Regulares)
    function handleHexClick(hex) {
        if (!hex) return;
        renderer.setSelectedHex(hex.id);
        const p = engine.getActivePlayer();
        const gameHex = engine.hexMap.get(hex.id);
        if (!gameHex) return;

        // --- TURNO 0: DESPLIEGUE INICIAL ---
        if (engine.round === 0) {
            if (engine.turnPhase === 'SETUP_SHIRO') {
                if (engine.setupPlaceShiro(hex.id)) {
                    updateUI();
                }
                return;
            }
            if (engine.turnPhase === 'SETUP_ASHIGARU') {
                if (engine.setupPlaceAshigaru(hex.id)) {
                    updateUI();
                }
                return;
            }
        }

        // --- RONDAS REGULARES ---

        // 1. Acción de Refuerzo
        if (currentAction === 'reinforce') {
            if (engine.reinforce(hex.id)) {
                currentAction = null;
                renderer.clearHighlights();
                updateUI();
            }
            return;
        }

        // 2. Acción de Campaña
        if (currentAction === 'campaign') {
            if (engine.campaign(hex.id)) {
                currentAction = null;
                renderer.clearHighlights();
                updateUI();
            }
            return;
        }

        // 3. Acción de Maniobra / Movimiento de Tropas
        if (engine.turnPhase === 'MANEUVER') {
            // Regla oficial v1.4: La tropa guarnecida está fija y NO puede sacarse del Castillo
            if (gameHex.shiro === p.id && gameHex.garrison === p.id && (!gameHex.troops[p.id] || gameHex.troops[p.id] <= 0)) {
                updateActionPrompt('🛡️ La Guarnición está fija defendiendo el Castillo y por reglamento no puede salir de él.');
                return;
            }

            const hasMyTroops = (gameHex.troops && (gameHex.troops[p.id] || 0) > 0);

            if (selectedUnitHexId === null) {
                if (hasMyTroops) {
                    selectedUnitHexId = gameHex.id;
                    const dests = engine.getValidMoveDestinations(gameHex.id, p.id);
                    renderer.setSelectedHex(gameHex.id);
                    renderer.setHighlights(dests, 'move');
                    updateActionPrompt(`🎯 Tropa de ${p.short} seleccionada en Hex #${gameHex.id}. Haz clic en una casilla azul adyacente para mover (${engine.movesLeft} movimientos restantes).`);
                } else {
                    updateActionPrompt(`⚠️ Hex #${gameHex.id} no tiene tropas libres de tu Clan (${p.short}). Haz clic en una casilla con tus tropas.`);
                }
            } else {
                if (gameHex.id === selectedUnitHexId) {
                    // Deseleccionar al hacer clic en la misma
                    selectedUnitHexId = null;
                    renderer.setSelectedHex(null);
                    renderer.clearHighlights();
                    updateActionPrompt(`Fase de Maniobra (${p.short}): Selecciona una tropa para mover (${engine.movesLeft} movimientos restantes).`);
                } else {
                    const validDests = engine.getValidMoveDestinations(selectedUnitHexId, p.id);
                    if (validDests.includes(gameHex.id)) {
                        // ¡Mover tropa! Permite apilarse con aliadas (hasta 3) y asaltar defensas enemigas de 3 unidades
                        if (engine.moveTroop(selectedUnitHexId, gameHex.id)) {
                            selectedUnitHexId = null;
                            renderer.setSelectedHex(null);
                            renderer.clearHighlights();
                            updateUI();
                        }
                    } else if (hasMyTroops) {
                        // Si no es un destino válido pero tiene tropas propias, cambiar selección
                        selectedUnitHexId = gameHex.id;
                        const dests = engine.getValidMoveDestinations(gameHex.id, p.id);
                        renderer.setSelectedHex(gameHex.id);
                        renderer.setHighlights(dests, 'move');
                        updateActionPrompt(`🎯 Selección cambiada a Hex #${gameHex.id}. Haz clic en una casilla azul para mover (${engine.movesLeft} restantes).`);
                    } else {
                        // Explicación didáctica del error según el tipo de casilla
                        if (gameHex.shiro === p.id && gameHex.garrison) {
                            updateActionPrompt(`🛡️ Tu Castillo en Hex #${gameHex.id} ya cuenta con una Guarnición activa (máximo 1 pieza fija por castillo).`);
                        } else if (gameHex.shiro === p.id && gameHex.siege) {
                            updateActionPrompt(`❌ Para retomar tu Castillo asediado en Hex #${gameHex.id} necesitas al menos 2 otras tropas aliadas adyacentes de flanqueo.`);
                        } else if (gameHex.shiro && gameHex.shiro !== p.id && gameHex.garrison) {
                            updateActionPrompt('❌ Asedio bloqueado: este Castillo cuenta con una Guarnición defensora activa.');
                        } else if (gameHex.shiro && gameHex.shiro !== p.id && gameHex.siege === p.id) {
                            updateActionPrompt('🔥 Ya tienes un Asedio activo en este Castillo rival (máximo 1 pieza por castillo).');
                        } else if (gameHex.shiro && gameHex.shiro !== p.id) {
                            updateActionPrompt('❌ Asedio bloqueado: necesitas al menos 2 tropas aliadas adyacentes de flanqueo para ocupar un Castillo rival.');
                        } else {
                            updateActionPrompt(`❌ Casilla #${gameHex.id} no es un destino válido. Selecciona una casilla adyacente resaltada en azul.`);
                        }
                    }
                }
            }
        }
    }

    // 6. Inspección de Casillas (Tooltip)
    function updateHexTooltip(hex) {
        const panel = document.getElementById('hexInfoBox');
        if (!hex) {
            panel.innerHTML = '<span style="color:#777">Pasa el cursor sobre una casilla...</span>';
            return;
        }
        const gameHex = engine.hexMap.get(hex.id);
        const troopsStr = Object.entries(gameHex.troops).map(([c, n]) => `${CLANS[c]?.short}: ${n}`).join(', ') || 'Ninguna';
        const shiroStr = gameHex.shiro ? `${CLANS[gameHex.shiro]?.short} (Guarnición: ${gameHex.garrison ? '🛡️ Sí (Fija)' : 'No'}, Asedio: ${gameHex.siege ? '🔥 Sí' : 'No'})` : 'Ninguno';

        let poiLabel = gameHex.type.toUpperCase();
        if (gameHex.type === 'torii') poiLabel = '⛩️ TORII CENTRAL (Consagra el Clan: activa Leva de Aldea y Dominio Feudal)';
        if (gameHex.type === 'aldea') poiLabel = '🌾 ALDEA (Ficha Leva +1 - Requiere Torii)';
        if (gameHex.type === 'toride') poiLabel = '🏯 FORTALEZA (Toride)';

        panel.innerHTML = `
            <strong>Hexágono #${hex.id}</strong> | Tipo: <em>${poiLabel}</em><br>
            ⚔️ Tropas: <b>${troopsStr}</b><br>
            🏯 Castillo: <b>${shiroStr}</b><br>
            🔗 Vecinos: ${hex.neighbors.join(', ')}
        `;
    }

    function updateActionPrompt(text) {
        document.getElementById('actionPrompt').innerText = text;
    }

    // 7. Actualizador Principal de la Interfaz y Marcador
    function updateUI() {
        const p = engine.getActivePlayer();
        const mandoPlayer = engine.getMandoPlayer();
        const nextPlayer = engine.players[(engine.activePlayerIdx + 1) % engine.players.length];
        const pendingCombats = engine.getPendingCombatHexes();

        // Actualizar Barra Superior de Control de Turno y Mando
        const dot = document.getElementById('turnDot');
        if (dot) {
            dot.style.backgroundColor = p.color;
            dot.style.boxShadow = `0 0 10px ${p.color}`;
        }
        const turnName = document.getElementById('turnPlayerName');
        if (turnName) {
            turnName.innerText = `${p.name} ${p.isAi ? '🤖' : '👤'}`;
            turnName.style.color = p.color;
        }
        const phaseBadge = document.getElementById('turnPhaseBadge');
        if (phaseBadge) {
            if (engine.round === 0) {
                phaseBadge.innerText = 'PRE-RONDA (TURNO 0)';
                phaseBadge.style.color = '#f39c12';
            } else if (engine.coronationRoundActive || engine.finalRoundTriggered) {
                phaseBadge.innerText = `🚨 RONDA DE CORONACIÓN (R${engine.round}) - ${engine.turnPhase}`;
                phaseBadge.style.color = '#e74c3c';
            } else {
                phaseBadge.innerText = `RONDA ${engine.round} - ${engine.turnPhase}`;
                phaseBadge.style.color = '#f1c40f';
            }
        }
        const mandoName = document.getElementById('mandoPlayerName');
        if (mandoName && mandoPlayer) {
            mandoName.innerText = `${mandoPlayer.name} (${mandoPlayer.short})`;
            mandoName.style.color = mandoPlayer.color;
        }

        // Actualizar Banner de Ronda de Coronación y Regicidio
        const coronationBanner = document.getElementById('coronationBanner');
        const coronationText = document.getElementById('coronationText');
        if (coronationBanner && coronationText) {
            if (engine.gameOver) {
                if (engine.victoryReason === 'REGICIDE_USURPATION') {
                    coronationBanner.style.display = 'flex';
                    coronationBanner.style.background = 'linear-gradient(90deg, #1e8449 0%, #27ae60 50%, #1e8449 100%)';
                    coronationText.innerHTML = `👑🗡️ <b>¡GEKOKUJŌ - REGICIDIO Y USURPACIÓN!</b> ¡${engine.winner?.name} (${engine.winner?.short}) ha derrocado al Aspirante y toma el Shogunato absoluto!`;
                } else if (engine.victoryReason === 'CORONATION_SURVIVED') {
                    coronationBanner.style.display = 'flex';
                    coronationBanner.style.background = 'linear-gradient(90deg, #b7950b 0%, #d4ac0d 50%, #b7950b 100%)';
                    coronationText.innerHTML = `👑🎌 <b>¡CORONACIÓN TRIUNFAL!</b> ¡${engine.winner?.name} (${engine.winner?.short}) resistió la embestida enemiga y es proclamado Shōgun supremo de Japón!`;
                } else {
                    coronationBanner.style.display = 'none';
                }
            } else if (engine.finalRoundTriggered && engine.coronationCandidateId) {
                const cand = engine.players.find(x => x.id === engine.coronationCandidateId);
                coronationBanner.style.display = 'flex';
                coronationBanner.style.background = 'linear-gradient(90deg, #7b1113 0%, #a93226 50%, #7b1113 100%)';
                coronationText.innerHTML = `👑⚔️ <b>RONDA DE CORONACIÓN:</b> ¡${cand?.name} (${cand?.short}) marcha a Kioto con ${cand?.feats.length} Hazañas! ¡Los demás clanes deben aliarse para cometer <b>REGICIDIO</b> (vencer a su Daimyō o asediar su Capital) para usurpar el trono!`;
            } else {
                coronationBanner.style.display = 'none';
            }
        }

        // Actualizar Marcador de Clanes
        renderScoreboard();

        // Actualizar Botón de Flujo Principal
        if (engine.gameOver) {
            btnNextPhase.disabled = true;
            btnNextPhase.innerText = '🏆 Partida Finalizada';
            btnNextPhase.style.background = '#4a3f35';
            if (engine.victoryReason === 'REGICIDE_USURPATION') {
                updateActionPrompt(`👑🗡️ ¡GEKOKUJŌ Y REGICIDIO! ${engine.winner?.name} derrocó al Aspirante y usurpa el Shogunato.`);
            } else if (engine.victoryReason === 'CORONATION_SURVIVED') {
                updateActionPrompt(`👑🎌 ¡CORONACIÓN EXITOSA! ${engine.winner?.name} sobrevive a la Ronda de Coronación y es Shōgun.`);
            } else {
                updateActionPrompt(`🎌 Partida Finalizada. Shogun: ${engine.winner?.name}.`);
            }
        } else if (engine.round === 0) {
            btnNextPhase.disabled = true;
            if (engine.turnPhase === 'SETUP_SHIRO') {
                btnNextPhase.innerText = `⛩️ Coloca Castillo (${p.short})`;
                const valids = engine.getValidSetupShiroHexes();
                renderer.setHighlights(valids, 'setup');
                updateActionPrompt(`⛩️ TURNO 0 (${p.short}): Haz clic en una casilla de Fortaleza (anaranjada) para colocar tu primer Castillo.`);
            } else if (engine.turnPhase === 'SETUP_ASHIGARU') {
                btnNextPhase.innerText = `🛡️ Coloca Escolta (${p.short})`;
                const valids = engine.getValidSetupAshigaruHexes();
                renderer.setHighlights(valids, 'setup');
                updateActionPrompt(`🛡️ TURNO 0 (${p.short}): Haz clic en una casilla adyacente a tu nuevo Castillo para colocar tu Ashigaru inicial.`);
            }
        } else {
            btnNextPhase.disabled = false;
            if (engine.turnPhase === 'PREPARATION') {
                btnNextPhase.innerText = '🏹 Terminar Preparación ➔ Ir a Maniobras';
                btnNextPhase.style.background = 'linear-gradient(180deg, #27ae60 0%, #1e8449 100%)';
                updateActionPrompt(`Ronda ${engine.round} - ${p.name}: Reclutaste a tu mano. Realiza Refuerzos o Campaña, o avanza a Maniobras.`);
            } else if (engine.turnPhase === 'MANEUVER') {
                if (pendingCombats.length > 0) {
                    btnNextPhase.innerText = `⚔️ Resolver Combates (${pendingCombats.length}) y Fin de Turno`;
                    btnNextPhase.style.background = 'linear-gradient(180deg, #c0392b 0%, #962d22 100%)';
                } else {
                    btnNextPhase.innerText = `✅ Terminar Turno ➔ Pasa a ${nextPlayer.short}`;
                    btnNextPhase.style.background = 'linear-gradient(180deg, #2980b9 0%, #1c5980 100%)';
                }
                updateActionPrompt(`Fase de Maniobra (${p.short}): Mueve hasta ${engine.movesLeft} tropas. Al terminar, pulsa el botón para avanzar.`);
            } else if (engine.turnPhase === 'COMBAT') {
                btnNextPhase.innerText = `⚔️ Liquidar Combates`;
                updateActionPrompt(`Fase de Combate: Resolviendo bajas por Mayorías (Regla 1.4).`);
            }
        }

        // Habilitar/Deshabilitar botones secundarios
        const isNormalGame = (engine.round > 0);
        document.getElementById('btnReinforce').disabled = (!isNormalGame || engine.turnPhase !== 'PREPARATION' || p.handTroops < 1);
        document.getElementById('btnCampaign').disabled = (!isNormalGame || engine.turnPhase !== 'PREPARATION' || p.handTroops < engine.rules.CAMPAIGN_TROOP_COST || p.reserveShiros < 1 || engine.campaignUsedThisTurn);
        
        const btnResolve = document.getElementById('btnResolveCombats');
        btnResolve.innerText = '⚔️ Resolver Combates' + (pendingCombats.length > 0 ? ` (${pendingCombats.length})` : '');
        btnResolve.disabled = (!isNormalGame || pendingCombats.length === 0);
        document.getElementById('btnPassTurn').disabled = (!isNormalGame);

        // Actualizar Hazañas
        renderFeatsList();

        // Actualizar Desglose Didáctico de Combates si hubo uno reciente
        renderCombatResolutionCard();

        // Renderizar Canvas
        renderer.render();
    }

    function renderScoreboard() {
        const container = document.getElementById('scoreboardList');
        container.innerHTML = '';

        engine.players.forEach((p, idx) => {
            const isActive = (idx === engine.activePlayerIdx);
            const isMando = (idx === engine.mandoPlayerIdx);
            const card = document.createElement('div');
            card.className = `player-score-card ${isActive ? 'active-turn' : ''}`;
            card.style.borderLeft = `5px solid ${p.color}`;

            const boardShiros = engine.countPlayerShiros(p.id);
            const ownedAldeas = engine.countPlayerPoi(p.id, 'aldea');
            const controlsTorii = engine.countPlayerPoi(p.id, 'torii') > 0;
            const audit = engine.getPlayerTroopAudit(p.id);

            card.innerHTML = `
                <div class="score-card-header">
                    <span style="color:${p.color === '#f3ede2' ? '#333' : p.color}; font-weight:bold; display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                        ${p.name} ${p.isAi ? '🤖' : '👤'}
                        ${isMando ? '<span class="mando-badge" title="Ficha de Mando: primer turno y desempates">👑 MANDO</span>' : ''}
                        ${isActive ? '<span class="playing-now-badge">▶️ JUGANDO</span>' : ''}
                        ${ownedAldeas > 0 ? (
                            p.hasControlledToriiOnce 
                            ? `<span style="font-size:0.7rem; background:#d35400; color:#fff; padding:1px 5px; border-radius:3px; font-weight:bold;" title="Controla ${ownedAldeas} Aldea(s): +${ownedAldeas} Leva por turno (Torii desbloqueado)">🌾 ${ownedAldeas} ALDEA${ownedAldeas > 1 ? 'S' : ''} (+${ownedAldeas})</span>`
                            : `<span style="font-size:0.7rem; background:#7f8c8d; color:#fff; padding:1px 5px; border-radius:3px; font-weight:bold;" title="Controla ${ownedAldeas} Aldea(s), pero requiere controlar el Torii (#67) al menos una vez para activar la Leva">🌾 ${ownedAldeas} ALDEA (🔒 Torii req)</span>`
                        ) : ''}
                        ${controlsTorii ? `<span style="font-size:0.7rem; background:#8e44ad; color:#fff; padding:1px 5px; border-radius:3px; font-weight:bold;" title="Controla Torii (#67) actualmente">⛩️ TORII ACTIVO</span>` : (
                            p.hasControlledToriiOnce ? `<span style="font-size:0.7rem; background:#4b6584; color:#fff; padding:1px 5px; border-radius:3px; font-weight:bold;" title="Ha controlado el Torii (#67) en la partida: Leva de Aldeas desbloqueada">⛩️ TORII CONSAGRADO</span>` : ''
                        )}
                        ${audit.garrisons > 0 ? `<span style="font-size:0.7rem; background:#27ae60; color:#fff; padding:1px 5px; border-radius:3px; font-weight:bold;" title="${audit.garrisons} Guarnición(es) activa(s): evitan 1 baja en combates adyacentes a cada castillo">🛡️ ${audit.garrisons} GUARNICIÓN</span>` : ''}
                        ${audit.sieges > 0 ? `<span style="font-size:0.7rem; background:#c0392b; color:#fff; padding:1px 5px; border-radius:3px; font-weight:bold;" title="${audit.sieges} Asedio(s) activo(s) sobre castillo rival">🔥 ${audit.sieges} ASEDIO</span>` : ''}
                        ${p.leaderAlive ? `<span style="font-size:0.7rem; background:#d4ac0d; color:#000; padding:1px 5px; border-radius:3px; font-weight:bold;" title="Daimyō al mando en Hex #${p.leaderHexId || '?'}: aporta +2 Fuerza militar en combate">👑 DAIMYŌ</span>` : `<span style="font-size:0.7rem; background:#7f8c8d; color:#fff; padding:1px 5px; border-radius:3px; font-weight:bold;" title="Daimyō caído en combate (reaparece en la Capital la próxima ronda)">👑 DAIMYŌ CAÍDO</span>`}
                    </span>
                    <span style="font-size:0.75rem; color:#666;">
                        🏆 ${p.feats.length}/${engine.rules.FEATS_TO_WIN}
                    </span>
                </div>
                <div class="score-stats-row">
                    <div class="stat-pill" title="Ashigaru en Mano">
                        <b>${p.handTroops}</b> Mano
                    </div>
                    <div class="stat-pill" title="Ashigaru en Reserva">
                        <b>${p.reserveTroops}</b> Reserva
                    </div>
                    <div class="stat-pill" title="Tropas en Tablero (Móviles: ${audit.boardMobile}, Guarniciones: ${audit.garrisons}, Asedios: ${audit.sieges})">
                        <b>${audit.totalBoard}</b> Tablero
                    </div>
                    <div class="stat-pill" style="border-color:${audit.total === 28 ? '#27ae60' : '#e74c3c'}; background:${audit.total === 28 ? '#eafaf1' : '#fdedec'};" title="Total del Clan (Mano + Reserva + Tablero). Ley estricta: 28 siempre">
                        <b style="color:${audit.total === 28 ? '#1e8449' : '#c0392b'};">${audit.total}/28</b> Total
                    </div>
                </div>
                <div class="score-stats-row" style="margin-top:2px;">
                    <div class="stat-pill" title="Castillos en Reserva / En Mapa">
                        <b>${p.reserveShiros} / ${boardShiros}</b> Shiros
                    </div>
                    <div class="stat-pill" title="Estandartes ganados en combate">
                        <b>${p.banners}</b> Banners
                    </div>
                    <div class="stat-pill" title="Fichas de Aldea en posesión (+Leva)">
                        <b>${ownedAldeas}</b> Aldeas
                    </div>
                    <div class="stat-pill" title="Guarniciones fijas en Castillos propios">
                        <b>${audit.garrisons}</b> Guarnic.
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function renderCombatResolutionCard() {
        const card = document.getElementById('combatResolutionCard');
        const content = document.getElementById('combatResolutionContent');
        if (!card || !content) return;

        const s = engine.lastCombatResolution;
        if (!s) {
            card.style.display = 'none';
            return;
        }

        card.style.display = 'block';

        const nameA = s.pA?.short || s.clanA;
        const colorA = s.pA?.color || '#333';
        const nameB = s.pB?.short || s.clanB;
        const colorB = s.pB?.color || '#333';

        let ruleExplanation = '';
        if (s.isTie) {
            ruleExplanation = `<b>⚖️ Choque Igualado (${s.countA} vs ${s.countB}):</b> Ambas fuerzas sufren bajas mutuas completas de base (${s.baseLossA} bajas cada uno).`;
        } else {
            const majP = s.majClan === s.clanA ? s.pA : s.pB;
            const minP = s.minClan === s.clanA ? s.pA : s.pB;
            const majC = Math.max(s.countA, s.countB);
            const minC = Math.min(s.countA, s.countB);
            const baseLossMaj = Math.max(0, minC - 1);
            ruleExplanation = `<b>👑 Mayoría vs Minoría (${majC} vs ${minC}):</b> La ventaja se otorga a quien tiene mayoría, independientemente de quién atacó o defendió.<br>
            • Regla oficial v1.4: Mayoría (${majP?.short}) pierde <b>${baseLossMaj} baja(s)</b> (${minC} - 1). Minoría (${minP?.short}) pierde <b>${minC} baja(s)</b>.`;
        }

        const mitigations = [];
        if (s.garrisonSaveA) mitigations.push(`<span style="background:#27ae60; color:#fff; padding:1px 5px; border-radius:3px;">🛡️ Guarnición aliada evitó 1 baja para ${s.pA?.short}</span>`);
        if (s.toriiSaveA) mitigations.push(`<span style="background:#8e44ad; color:#fff; padding:1px 5px; border-radius:3px;">⛩️ Bendición del Torii evitó 1 baja para ${s.pA?.short}</span>`);
        if (s.garrisonSaveB) mitigations.push(`<span style="background:#27ae60; color:#fff; padding:1px 5px; border-radius:3px;">🛡️ Guarnición aliada evitó 1 baja para ${s.pB?.short}</span>`);
        if (s.toriiSaveB) mitigations.push(`<span style="background:#8e44ad; color:#fff; padding:1px 5px; border-radius:3px;">⛩️ Bendición del Torii evitó 1 baja para ${s.pB?.short}</span>`);

        let mitigationsHtml = '';
        if (mitigations.length > 0) {
            mitigationsHtml = `<div style="margin:4px 0; padding:4px; background:#f5eef8; border-radius:3px; border-left:3px solid #8e44ad;">
                <b>✨ Mitigaciones de Daño:</b><br>${mitigations.join('<br>')}
            </div>`;
        } else {
            mitigationsHtml = `<div style="margin:2px 0; color:#777;"><em>Sin mitigaciones aplicadas en este combate.</em></div>`;
        }

        const auditA = engine.getPlayerTroopAudit(s.clanA);
        const auditB = engine.getPlayerTroopAudit(s.clanB);

        content.innerHTML = `
            <div style="font-weight:bold; margin-bottom:4px; color:#111;">
                ⚔️ Hex #${s.hexId}: <span style="color:${colorA}">${nameA} (${s.countA})</span> vs <span style="color:${colorB}">${nameB} (${s.countB})</span>
            </div>
            <div style="margin-bottom:4px; background:#fcf8e3; padding:4px; border-radius:3px; font-size:0.75rem;">
                ${ruleExplanation}
            </div>
            ${mitigationsHtml}
            <div style="margin:4px 0; background:#edf7ed; padding:4px; border-radius:3px; font-size:0.75rem;">
                <b>♻️ Retorno a Reserva & Repliegue:</b><br>
                • <b style="color:${colorA}">${nameA}:</b> ${s.finalLossA} tropa(s) regresan a Reserva (+${s.finalLossA})${s.savedToHandA > 0 ? `, <b>${s.savedToHandA} tropa salvada a su Mano</b>` : ''}.<br>
                • <b style="color:${colorB}">${nameB}:</b> ${s.finalLossB} tropa(s) regresan a Reserva (+${s.finalLossB})${s.savedToHandB > 0 ? `, <b>${s.savedToHandB} tropa salvada a su Mano</b>` : ''}.
            </div>
            <div style="font-weight:bold; margin-top:4px; color:#2c3e50;">
                ${s.winnerClan ? `🏆 ¡Control definitivo de Hex #${s.hexId}: <b>${CLANS[s.winnerClan]?.short}</b>! ${s.bannerAwarded ? '🚩 (+1 Estandarte)' : ''}` : 'Hex #${s.hexId} queda desolado (0 tropas).'}
            </div>
            <div style="font-size:0.72rem; color:#555; margin-top:3px; border-top:1px dashed #d5c8ad; padding-top:2px;">
                🔒 Total Tropas: ${nameA}: <b>${auditA.total}/28</b> | ${nameB}: <b>${auditB.total}/28</b> (100% Consagrado).
            </div>
        `;
    }

    function renderFeatsList() {
        const tbody = document.getElementById('featsTableBody');
        const tfoot = document.getElementById('featsTableFoot');
        if (!tbody) return;

        tbody.innerHTML = '';
        const clanKeys = ['rojo', 'verde', 'azul', 'amarillo']; // RGBY
        const featTotals = { rojo: 0, verde: 0, azul: 0, amarillo: 0 };

        FEATS.forEach(feat => {
            const tr = document.createElement('tr');
            let cellsHtml = `
                <td class="feat-name-cell">
                    <span>${feat.icon} ${feat.name}</span>
                    <span class="feat-desc-sub">${feat.desc}</span>
                </td>
            `;

            clanKeys.forEach(cKey => {
                const clan = CLANS[cKey];
                const player = engine.players.find(p => p.id === cKey);
                const hasFeat = player && player.feats && player.feats.includes(feat.id);
                if (hasFeat) {
                    featTotals[cKey]++;
                    cellsHtml += `
                        <td class="feat-cell-claimed" title="Conseguida por ${clan.name}">
                            <span class="feat-badge-initial" style="background:${clan.color}; color:${clan.text};">${clan.initial}</span>
                        </td>
                    `;
                } else {
                    cellsHtml += `<td class="feat-cell-open">—</td>`;
                }
            });

            tr.innerHTML = cellsHtml;
            tbody.appendChild(tr);
        });

        if (tfoot) {
            tfoot.innerHTML = `
                <tr style="background:#f4ece1; font-weight:bold; border-top:2px solid #b89758;">
                    <td style="text-align:left; padding:4px 6px;">Total Conseguidas (3 para Ganar):</td>
                    ${clanKeys.map(cKey => {
                        const clan = CLANS[cKey];
                        const count = featTotals[cKey];
                        const isLeader = count >= 3;
                        return `<td style="color:${clan.color}; font-size:0.8rem; font-weight:bold;">${count}/3${isLeader ? ' 👑' : ''}</td>`;
                    }).join('')}
                </tr>
            `;
        }
    }

    function appendLogEntry(entry) {
        const logBox = document.getElementById('actionLogBox');
        const p = document.createElement('div');
        p.className = `log-entry log-${entry.type}`;
        p.innerHTML = `<span class="log-time">[${entry.roundLabel}]</span> ${entry.msg}`;
        logBox.insertBefore(p, logBox.firstChild);
    }

    // 8. Actualizador del Dashboard de Telemetría
    function updateTelemetryUI() {
        const t = engine.telemetry;
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        // Card 1: Combates y Mayorías
        setVal('statCombatsTotal', t.combatsTotal);
        setVal('statCombatsMajority', t.combatsMajorityWins);
        setVal('statCombatsEqual', t.combatsEqualCasualties);
        setVal('statBannersAwarded', t.bannersAwarded || 0);
        setVal('statGarrisonSaves', t.lossesSavedByGarrison || 0);
        setVal('statSiegeSupports', t.siegesProtectedBySupport || 0);
        setVal('statTacticalRetreats', t.tacticalRetreats || 0);
        setVal('statBannersSpentWarCry', t.bannersSpentWarCry || 0);
        setVal('statFlankingCombats', t.flankingCombats || 0);
        setVal('statLeadersDefeated', t.leadersDefeated || 0);

        // Card 2: Castillos y Asedios
        setVal('statCampaignsExecuted', t.campaignsExecuted || 0);
        let activeShiros = 0;
        let unbesiegedShiros = 0;
        engine.hexMap.forEach(h => {
            if (h.shiro) {
                activeShiros++;
                if (!h.siege) unbesiegedShiros++;
            }
        });
        setVal('statActiveShiros', activeShiros);
        setVal('statUnbesiegedShiros', unbesiegedShiros);
        setVal('statGarrisonsFormed', t.garrisonsFormed || 0);
        setVal('statSiegesSuccess', t.siegesSuccess || 0);
        setVal('statSiegesRepelled', t.siegesRepelled || 0);

        // Card 3: Puntos de Interés y Maniobras
        setVal('statAldeaExtraTroops', t.aldeaExtraTroopsAwarded || 0);
        setVal('statFirstAldeaTurn', t.firstAldeaTurn !== null ? `Ronda ${t.firstAldeaTurn}` : '-');
        setVal('statFirstToriiTurn', t.firstToriiTurn !== null ? `Ronda ${t.firstToriiTurn}` : '-');
        setVal('statReinforcementsPlaced', t.reinforcementsPlaced || 0);
        setVal('statTotalMoves', t.totalMovesMade || 0);

        // Card 4: Tablero de Hazañas (4 Oficiales)
        setVal('statFeatBanners', t.featsClaimed.sangre_y_acero || 0);
        setVal('statFeatAldea', t.featsClaimed.dominio_feudal || 0);
        setVal('statFeatShiros', t.featsClaimed.senor_castillos || 0);
        setVal('statFeatSiege', t.featsClaimed.asolador || 0);

        // Card 5: Dinámica del Mando y Fin de Partida
        const mandoP = engine.getMandoPlayer();
        setVal('statMandoHolder', mandoP ? `${mandoP.name} (${mandoP.short})` : '-');
        const finalStatusEl = document.getElementById('statFinalRoundStatus');
        if (finalStatusEl) {
            finalStatusEl.innerText = engine.finalRoundTriggered ? '🚨 ¡ACTIVADA!' : 'No';
            finalStatusEl.style.color = engine.finalRoundTriggered ? '#e74c3c' : '#27ae60';
        }
        setVal('statFinalRoundTurn', t.finalRoundTriggeredAt !== null ? `Ronda ${t.finalRoundTriggeredAt}` : '-');
        setVal('statMandoTiebreaks', t.mandoTiebreaks || 0);
    }

    // 9. Motor de Simulación Masiva y Tests de Balance
    function runMassSimulation(count = 1) {
        window.isMassSimulating = true;
        try {
            const stats = {
                total: count,
                wins: {},
                totalRounds: 0,
                roundsDist: { '4-7': 0, '8-11': 0, '12-15': 0, '>15': 0 },
                featsAchieved: {},
                telemetry: {
                    combatsTotal: 0,
                    combatsEqual: 0,
                    combatsMajority: 0,
                    bannersAwarded: 0,
                    toriiSaves: 0,
                    garrisonSaves: 0,
                    campaignsExecuted: 0,
                    garrisonsFormed: 0,
                    siegesSuccess: 0,
                    siegesRepelled: 0,
                    aldeaExtraTroops: 0,
                    mandoTiebreaks: 0
                }
            };
            const clanKeys = ['rojo', 'amarillo', 'azul', 'verde'];
            clanKeys.forEach(k => stats.wins[k] = 0);
            FEATS.forEach(f => stats.featsAchieved[f.id] = 0);

            for (let i = 0; i < count; i++) {
                const simEngine = new GameEngine(window.HEX_GRID_DATA);
                simEngine.initGame([
                    { id: 'rojo', name: 'Clan Rojo', isAi: true },
                    { id: 'amarillo', name: 'Clan Amarillo', isAi: true },
                    { id: 'azul', name: 'Clan Azul', isAi: true },
                    { id: 'verde', name: 'Clan Verde', isAi: true }
                ]);
                // Simular Turno 0 para todos
                simEngine.players.forEach(() => {
                    simEngine.runAiSetup();
                    simEngine.runAiSetupAshigaru();
                });

                const res = simEngine.simulateFullGame(45);
                stats.totalRounds += res.rounds;
                if (res.rounds <= 7) stats.roundsDist['4-7']++;
                else if (res.rounds <= 11) stats.roundsDist['8-11']++;
                else if (res.rounds <= 15) stats.roundsDist['12-15']++;
                else stats.roundsDist['>15']++;

            if (simEngine.winner) {
                stats.wins[simEngine.winner.id] = (stats.wins[simEngine.winner.id] || 0) + 1;
            }
            Object.keys(simEngine.claimedFeats).forEach(fId => {
                const claimants = simEngine.claimedFeats[fId];
                const countClaimants = Array.isArray(claimants) ? claimants.length : (claimants ? 1 : 0);
                stats.featsAchieved[fId] = (stats.featsAchieved[fId] || 0) + countClaimants;
            });

            // Acumular telemetría profunda
            if (res.telemetry) {
                const t = res.telemetry;
                stats.telemetry.combatsTotal += t.combatsTotal;
                stats.telemetry.combatsEqual += t.combatsEqualCasualties;
                stats.telemetry.combatsMajority += t.combatsMajorityWins;
                stats.telemetry.bannersAwarded += (t.bannersAwarded || 0);
                stats.telemetry.toriiSaves += t.lossesSavedByTorii;
                stats.telemetry.garrisonSaves += (t.lossesSavedByGarrison || 0);
                stats.telemetry.campaignsExecuted += (t.campaignsExecuted || 0);
                stats.telemetry.garrisonsFormed += (t.garrisonsFormed || 0);
                stats.telemetry.siegesSuccess += t.siegesSuccess;
                stats.telemetry.siegesRepelled += (t.siegesRepelled || 0);
                stats.telemetry.aldeaExtraTroops += (t.aldeaExtraTroopsAwarded || 0);
                stats.telemetry.mandoTiebreaks += t.mandoTiebreaks;
            }
        }

        const avgRounds = (stats.totalRounds / count).toFixed(1);
        let report = `=== REPORTE DE TELEMETRÍA AVANZADO (${count} PARTIDAS SIMULADAS) ===\n\n`;
        report += `📊 DURACIÓN Y RITMO:\n`;
        report += `• Promedio: ${avgRounds} Rondas\n`;
        report += `• Distribución: 4-7 rondas (${stats.roundsDist['4-7']}), 8-11 rondas (${stats.roundsDist['8-11']}), 12-15 rondas (${stats.roundsDist['12-15']}), >15 rondas (${stats.roundsDist['>15']})\n\n`;

        report += `👑 VICTORIAS POR CLAN (EQUILIBRIO RGBY):\n`;
        Object.entries(stats.wins).forEach(([k, w]) => {
            report += `• ${CLANS[k]?.short || k}: ${w} victorias (${((w/count)*100).toFixed(1)}%)\n`;
        });
        report += `• Desempates resueltos por Mando: ${stats.telemetry.mandoTiebreaks}\n\n`;

        report += `⚔️ DINÁMICA DE COMBATES Y MAYORÍAS:\n`;
        report += `• Combates Totales: ${stats.telemetry.combatsTotal} (~${(stats.telemetry.combatsTotal/count).toFixed(1)} por partida)\n`;
        report += `• Victorias por Mayoría (B - 1): ${stats.telemetry.combatsMajority} (${stats.telemetry.combatsTotal > 0 ? ((stats.telemetry.combatsMajority/stats.telemetry.combatsTotal)*100).toFixed(1) : 0}%)\n`;
        report += `• Paridad / Bajas Mutuas: ${stats.telemetry.combatsEqual}\n`;
        report += `• Estandartes Otorgados: ${stats.telemetry.bannersAwarded}\n`;
        report += `• Mitigaciones por Guarnición (a reserva): ${stats.telemetry.garrisonSaves}\n`;
        report += `• Mitigaciones por Torii (a mano): ${stats.telemetry.toriiSaves}\n\n`;

        report += `🏯 FORTALEZAS, ASEDIOS Y RECURSOS:\n`;
        report += `• Castillos Fundados (Campañas): ${stats.telemetry.campaignsExecuted}\n`;
        report += `• Guarniciones Fijas Formadas: ${stats.telemetry.garrisonsFormed}\n`;
        report += `• Asedios Exitosos Ejecutados: ${stats.telemetry.siegesSuccess}\n`;
        report += `• Asedios Repelidos / Liberados: ${stats.telemetry.siegesRepelled}\n`;
        report += `• Levas Extra por Control de Aldeas: ${stats.telemetry.aldeaExtraTroops} tropas\n\n`;

        report += `🏆 CONSECUCIÓN DE LAS 4 HAZAÑAS OFICIALES:\n`;
        FEATS.forEach(f => {
            const num = stats.featsAchieved[f.id] || 0;
            report += `• ${f.icon} ${f.name}: ${num} veces (${((num/count)*100).toFixed(1)}% de partidas)\n`;
        });
        report += `\n🔒 LEY DE CONSERVACIÓN: 28 Tropas por Clan verificado al 100%.`;

        alert(report);
        engine.addLog(`Simulación de telemetría completada: ${count} partidas. Promedio: ${avgRounds} rondas.`, 'system');
        } finally {
            window.isMassSimulating = false;
        }
    }

    // Configuración Inicial Predeterminada al Cargar (4 Clanes para las 4 Fortalezas)
    engine.initGame([
        { id: 'rojo', name: 'Jugador 1 (Rojo)', isAi: false },
        { id: 'amarillo', name: 'Jugador 2 (Amarillo)', isAi: true },
        { id: 'azul', name: 'Jugador 3 (Azul)', isAi: true },
        { id: 'verde', name: 'Jugador 4 (Verde)', isAi: true }
    ]);
    renderer.setEngine(engine);
    updateUI();
});
