/**
 * Sengoku Conquerors 1.4 - Board Renderer
 * Renders the 1234x1014 board, calibrated hex grid, units, castles, garrisons, sieges, combat indicators,
 * with permanent token visibility and smooth pan/zoom.
 */

class BoardRenderer {
    constructor(canvas, hexGridData, engine = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.grid = hexGridData;
        this.engine = engine;

        // Viewport Pan & Zoom (Default centered on 1234x1014 board)
        this.scale = 0.85;
        this.panX = 80;
        this.panY = 20;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;

        // Visual interaction states
        this.hoveredHexId = null;
        this.selectedHexId = null;
        this.highlightHexIds = new Set();
        this.highlightType = 'move'; // 'reinforce', 'campaign', 'move', 'setup'

        // Assets
        this.images = {};
        this.assetsLoaded = false;
        this.loadAssets();

        this.setupEvents();
    }

    setEngine(engine) {
        this.engine = engine;
        this.render();
    }

    loadAssets() {
        const toLoad = {
            board: 'assets/board_full.png',
            shiroBlack: 'assets/Shiro BLACK.png',
            shiroWhite: 'assets/Shiro WHITE.png',
            ashigaru: 'assets/Ashigaru Final.png',
            sashimono: 'assets/sashimono.png',
            torii: 'assets/01_Figura_Puerta_Torii.png',
            pagoda: 'assets/02_Figura_Pagoda_Templo.png',
            aldea: 'assets/03_Figura_Aldea_Campesina.png',
            puerto: 'assets/04_Figura_Puerto_Embarcadero.png',
            santuario: 'assets/05_Figura_Santuario_Risco.png',
            bosque: 'assets/06_Figura_Bosque_Pinos.png',
            rio: 'assets/07_Figura_Rio_Vado.png',
            lago: 'assets/08_Figura_Lago_Lotos.png',
            puente: 'assets/09_Figura_Puente_Arqueado.png',
            mina: 'assets/10_Figura_Mina_Montana.png'
        };

        let loadedCount = 0;
        const total = Object.keys(toLoad).length;

        for (const [key, src] of Object.entries(toLoad)) {
            const img = new Image();
            img.src = src;
            img.onload = () => {
                loadedCount++;
                if (loadedCount >= total) {
                    this.assetsLoaded = true;
                    this.generateTintedSprites();
                    this.render();
                }
            };
            this.images[key] = img;
        }
    }

    generateTintedSprites() {
        this.tintedAshigaru = {};
        this.tintedShiro = {};

        const clans = ['rojo', 'amarillo', 'azul', 'verde'];
        const clanPalette = {
            rojo:     { overlay: 'rgba(197, 40, 40, 0.45)' },
            amarillo: { overlay: 'rgba(229, 183, 0, 0.50)' },
            azul:     { overlay: 'rgba(29, 94, 168, 0.45)' },
            verde:    { overlay: 'rgba(35, 122, 59, 0.45)' }
        };

        // 1. Tint Ashigaru
        if (this.images.ashigaru && this.images.ashigaru.complete) {
            const src = this.images.ashigaru;
            clans.forEach(cid => {
                const off = document.createElement('canvas');
                off.width = src.naturalWidth || src.width || 80;
                off.height = src.naturalHeight || src.height || 90;
                const oCtx = off.getContext('2d');
                oCtx.drawImage(src, 0, 0, off.width, off.height);
                oCtx.globalCompositeOperation = 'source-atop';
                oCtx.fillStyle = clanPalette[cid].overlay;
                oCtx.fillRect(0, 0, off.width, off.height);
                this.tintedAshigaru[cid] = off;
            });
        }

        // 2. Tint Shiro Castles
        const baseShiro = (this.images.shiroWhite && this.images.shiroWhite.complete) ? this.images.shiroWhite : this.images.shiroBlack;
        if (baseShiro && baseShiro.complete) {
            clans.forEach(cid => {
                const off = document.createElement('canvas');
                off.width = baseShiro.naturalWidth || baseShiro.width || 100;
                off.height = baseShiro.naturalHeight || baseShiro.height || 100;
                const oCtx = off.getContext('2d');
                oCtx.drawImage(baseShiro, 0, 0, off.width, off.height);
                oCtx.globalCompositeOperation = 'source-atop';
                oCtx.fillStyle = clanPalette[cid].overlay;
                oCtx.fillRect(0, 0, off.width, off.height);
                this.tintedShiro[cid] = off;
            });
        }
    }

    setupEvents() {
        // Drag to pan (Shift + Left Click OR Middle Click)
        this.canvas.addEventListener('mousedown', (e) => {
            if ((e.button === 0 && e.shiftKey) || e.button === 1) {
                this.isDragging = true;
                this.dragStartX = e.clientX - this.panX;
                this.dragStartY = e.clientY - this.panY;
                e.preventDefault();
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.panX = e.clientX - this.dragStartX;
                this.panY = e.clientY - this.dragStartY;
                this.render();
                return;
            }

            const mousePos = this.getCanvasCoords(e);
            const found = this.findHexAt(mousePos.x, mousePos.y);
            const newHover = found ? found.id : null;
            if (newHover !== this.hoveredHexId) {
                this.hoveredHexId = newHover;
                this.render();
                if (this.onHexHover) this.onHexHover(found);
            }
        });

        // Mouse wheel to zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
            const newScale = Math.max(0.35, Math.min(2.5, this.scale * zoomFactor));
            this.panX = e.offsetX - (e.offsetX - this.panX) * (newScale / this.scale);
            this.panY = e.offsetY - (e.offsetY - this.panY) * (newScale / this.scale);
            this.scale = newScale;
            this.render();
        }, { passive: false });

        // Click to select
        this.canvas.addEventListener('click', (e) => {
            if (this.isDragging) return;
            const mousePos = this.getCanvasCoords(e);
            const hex = this.findHexAt(mousePos.x, mousePos.y);
            if (this.onHexClick) this.onHexClick(hex);
        });
    }

    getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        const worldX = (clientX - this.panX) / this.scale;
        const worldY = (clientY - this.panY) / this.scale;
        return { x: worldX, y: worldY };
    }

    findHexAt(worldX, worldY) {
        const R = 39.0; // Hex radius in 1234x1014 board pixels
        for (const h of this.grid) {
            const dx = h.x - worldX;
            const dy = h.y - worldY;
            if (Math.sqrt(dx * dx + dy * dy) <= R * 0.95) {
                return h;
            }
        }
        return null;
    }

    getHexVertices(cx, cy, R = 39.0) {
        const verts = [];
        // Flat-topped hexagon (angles: 0, 60, 120, 180, 240, 300 deg)
        for (let i = 0; i < 6; i++) {
            const rad = (i * 60) * Math.PI / 180;
            verts.push({
                x: cx + R * Math.cos(rad),
                y: cy + R * Math.sin(rad)
            });
        }
        return verts;
    }

    setHighlights(hexIds, type = 'move') {
        this.highlightHexIds = new Set(hexIds);
        this.highlightType = type;
        this.render();
    }

    clearHighlights() {
        this.highlightHexIds.clear();
        this.render();
    }

    setSelectedHex(hexId) {
        this.selectedHexId = hexId;
        this.render();
    }

    hexToRgba(hex, alpha) {
        if (!hex || hex[0] !== '#') return `rgba(184, 151, 88, ${alpha})`;
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    render() {
        const ctx = this.ctx;
        const engine = this.engine;
        const activeP = engine ? engine.getActivePlayer() : null;
        const activeColor = activeP ? activeP.color : '#b89758';
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.save();
        ctx.translate(this.panX, this.panY);
        ctx.scale(this.scale, this.scale);

        // 1. Draw Board Image (Exact 1234 x 1014)
        if (this.images.board && this.images.board.complete) {
            ctx.drawImage(this.images.board, 0, 0, 1234, 1014);
        } else {
            ctx.fillStyle = '#dfcca4';
            ctx.fillRect(0, 0, 1234, 1014);
        }

        // 2. Draw Hexagons & Highlights
        this.grid.forEach(h => {
            const verts = this.getHexVertices(h.x, h.y);
            const isHovered = (h.id === this.hoveredHexId);
            const isSelected = (h.id === this.selectedHexId);
            const isHighlighted = this.highlightHexIds.has(h.id);

            ctx.beginPath();
            ctx.moveTo(verts[0].x, verts[0].y);
            for (let i = 1; i < 6; i++) {
                ctx.lineTo(verts[i].x, verts[i].y);
            }
            ctx.closePath();

            // Subtle cell wireframe
            ctx.strokeStyle = 'rgba(180, 150, 100, 0.25)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Highlight fills con el color oficial del clan del jugador activo
            if (isSelected) {
                ctx.fillStyle = this.hexToRgba(activeColor, 0.45);
                ctx.fill();
                ctx.strokeStyle = activeColor;
                ctx.lineWidth = 3.5;
                ctx.stroke();
            } else if (isHighlighted) {
                ctx.fillStyle = this.hexToRgba(activeColor, 0.38);
                ctx.fill();
                ctx.strokeStyle = activeColor;
                ctx.lineWidth = 3;
                ctx.stroke();
            } else if (isHovered) {
                ctx.fillStyle = 'rgba(230, 126, 34, 0.3)';
                ctx.fill();
                ctx.strokeStyle = '#d35400';
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }

            // Hex ID label
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(h.id, h.x, h.y + 28);
        });

        // 3. Draw Game Pieces & Units from Engine (ALWAYS rendered!)
        if (engine && engine.hexMap) {
            this.renderUnits(engine);
        }

        ctx.restore();
    }

    renderUnits(engine) {
        const ctx = this.ctx;

        // Auto-generate tinted sprites if not already created
        if (!this.tintedAshigaru && this.assetsLoaded) {
            this.generateTintedSprites();
        }

        engine.hexMap.forEach(hex => {
            const cx = hex.x;
            const cy = hex.y;

            // --- 0. Draw Points of Interest (Torii & Aldea) ---
            if (!hex.shiro) {
                if (hex.type === 'torii') {
                    if (this.images.torii && this.images.torii.complete) {
                        ctx.drawImage(this.images.torii, cx - 22, cy - 24, 44, 44);
                    }
                    ctx.fillStyle = '#8e44ad';
                    ctx.beginPath();
                    ctx.arc(cx - 16, cy - 14, 8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('⛩️', cx - 16, cy - 14);
                } else if (hex.type === 'aldea') {
                    if (this.images.aldea && this.images.aldea.complete) {
                        ctx.drawImage(this.images.aldea, cx - 24, cy - 24, 48, 48);
                    }
                    ctx.fillStyle = '#d35400';
                    ctx.beginPath();
                    ctx.arc(cx - 16, cy - 14, 8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🌾', cx - 16, cy - 14);
                } else if (hex.type === 'toride') {
                    if (this.images.pagoda && this.images.pagoda.complete) {
                        ctx.drawImage(this.images.pagoda, cx - 22, cy - 24, 44, 44);
                    }
                    ctx.fillStyle = '#2c3e50';
                    ctx.beginPath();
                    ctx.arc(cx - 16, cy - 14, 8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#ffd700';
                    ctx.font = 'bold 9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🏯', cx - 16, cy - 14);
                }
            }

            // --- 1. Draw Shiro (Castle) ---
            if (hex.shiro) {
                const clan = CLANS[hex.shiro] || { color: '#c52828', accent: '#ffd700', text: '#fff', short: 'Shiro' };

                // A. Castle Colored 3D Pedestal Base (Fortress Platform)
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetY = 4;
                ctx.fillStyle = clan.color;
                ctx.beginPath();
                ctx.ellipse(cx, cy + 12, 26, 11, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                // Pedestal gold/silver rim
                ctx.strokeStyle = clan.accent || '#ffd700';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.ellipse(cx, cy + 12, 26, 11, 0, 0, Math.PI * 2);
                ctx.stroke();

                // B. Castle Sprite (Tinted in Clan Color or Shiro Sprite)
                const castleImg = this.tintedShiro?.[hex.shiro] || this.images.shiroWhite || this.images.shiroBlack;
                const hasStationedTroop = (hex.garrison || hex.siege);
                const castleY = hasStationedTroop ? cy - 10 : cy - 5;
                if (castleImg) {
                    const w = 54;
                    const h = 54;
                    ctx.drawImage(castleImg, cx - w / 2, castleY - h / 2, w, h);
                } else {
                    ctx.fillStyle = clan.color;
                    ctx.fillRect(cx - 16, cy - 16, 32, 32);
                }

                // C. Castle Clan Crest Badge
                this.drawClanBadge(cx, cy - 27, hex.shiro, '🏯 ' + (clan.initial || clan.short.substring(0, 1)));

                // D. Garrison: Tropa Ashigaru guarnecida visible en el Castillo
                if (hex.garrison) {
                    const gClan = CLANS[hex.garrison] || clan;
                    const troopX = cx + 11;
                    const troopY = cy + 4;

                    // 1. Pedestal de la tropa guarnecida
                    ctx.save();
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
                    ctx.shadowBlur = 5;
                    ctx.shadowOffsetY = 2;
                    ctx.fillStyle = gClan.color;
                    ctx.beginPath();
                    ctx.ellipse(troopX, troopY + 12, 13, 5.5, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    ctx.strokeStyle = '#27ae60';
                    ctx.lineWidth = 2.0;
                    ctx.beginPath();
                    ctx.ellipse(troopX, troopY + 12, 13, 5.5, 0, 0, Math.PI * 2);
                    ctx.stroke();

                    // 2. Ficha de tropa Ashigaru visible
                    const gImg = this.tintedAshigaru?.[hex.garrison] || this.images.ashigaru;
                    if (gImg) {
                        ctx.drawImage(gImg, troopX - 13, troopY - 14, 26, 29);
                    }

                    // 3. Insignia de Guarnición Protectora (Escudo verde)
                    ctx.fillStyle = '#27ae60';
                    ctx.beginPath();
                    ctx.arc(troopX + 11, troopY - 9, 9, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🛡️', troopX + 11, troopY - 9);
                }

                // E. Asedio: Tropa Ashigaru invasora ocupando el Castillo
                if (hex.siege) {
                    const sClan = CLANS[hex.siege] || { color: '#c0392b', accent: '#fff', text: '#fff' };
                    const troopX = cx + 11;
                    const troopY = cy + 4;

                    // 1. Pedestal de la tropa asediadora
                    ctx.save();
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
                    ctx.shadowBlur = 6;
                    ctx.shadowOffsetY = 2;
                    ctx.fillStyle = sClan.color;
                    ctx.beginPath();
                    ctx.ellipse(troopX, troopY + 12, 13, 5.5, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    ctx.strokeStyle = '#c0392b';
                    ctx.lineWidth = 2.0;
                    ctx.beginPath();
                    ctx.ellipse(troopX, troopY + 12, 13, 5.5, 0, 0, Math.PI * 2);
                    ctx.stroke();

                    // 2. Ficha de tropa Ashigaru enemiga visible
                    const sImg = this.tintedAshigaru?.[hex.siege] || this.images.ashigaru;
                    if (sImg) {
                        ctx.drawImage(sImg, troopX - 13, troopY - 14, 26, 29);
                    }

                    // 3. Insignia de Asedio (Llama roja)
                    ctx.fillStyle = '#c0392b';
                    ctx.beginPath();
                    ctx.arc(troopX + 11, troopY - 9, 9, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🔥', troopX + 11, troopY - 9);
                }
            }

            // --- 2. Draw Ashigaru Troops ---
            const clans = Object.keys(hex.troops || {});
            if (clans.length > 0 && !hex.shiro) {
                const isCombat = clans.length > 1;

                if (isCombat) {
                    // Pulsing combat ring
                    ctx.strokeStyle = 'rgba(231, 76, 60, 0.9)';
                    ctx.lineWidth = 3.5;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
                    ctx.stroke();

                    ctx.fillStyle = '#c0392b';
                    ctx.font = 'bold 11px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('⚔️ COMBATE', cx, cy - 24);
                }

                // Draw troops per clan
                let offsetIdx = 0;
                clans.forEach(clanId => {
                    const count = hex.troops[clanId];
                    const clan = CLANS[clanId];
                    if (!clan || count <= 0) return;

                    const offsetX = (offsetIdx === 0 && clans.length > 1) ? -13 : (clans.length > 1 ? 13 : 0);
                    const troopCx = cx + offsetX;
                    const troopCy = cy + (clans.length > 1 ? 4 : 0);

                    // A. Glowing Clan Aura Backlight
                    const auraGrad = ctx.createRadialGradient(troopCx, troopCy, 4, troopCx, troopCy, 24);
                    auraGrad.addColorStop(0, clan.color + 'aa');
                    auraGrad.addColorStop(1, clan.color + '00');
                    ctx.fillStyle = auraGrad;
                    ctx.beginPath();
                    ctx.arc(troopCx, troopCy, 24, 0, Math.PI * 2);
                    ctx.fill();

                    // B. 3D Miniature Stand / Base Pedestal in Clan Color
                    ctx.save();
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    ctx.shadowBlur = 6;
                    ctx.shadowOffsetY = 3;
                    ctx.fillStyle = clan.color;
                    ctx.beginPath();
                    ctx.ellipse(troopCx, troopCy + 13, 17, 7, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    // Base accent rim
                    ctx.strokeStyle = clan.accent || '#ffd700';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.ellipse(troopCx, troopCy + 13, 17, 7, 0, 0, Math.PI * 2);
                    ctx.stroke();

                    // C. Ashigaru Token Miniature (Tinted in Clan Color!)
                    const troopImg = this.tintedAshigaru?.[clanId] || this.images.ashigaru;
                    if (troopImg) {
                        ctx.drawImage(troopImg, troopCx - 17, troopCy - 19, 34, 38);
                    }

                    // D. Troop Count Badge with High Contrast
                    ctx.fillStyle = clan.color;
                    ctx.beginPath();
                    ctx.arc(troopCx + 12, troopCy - 12, 10, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = clan.accent || '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    ctx.fillStyle = clan.text || '#ffffff';
                    ctx.font = 'bold 11px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(count, troopCx + 12, troopCy - 12);

                    // E. Daimyō (Líder) Crown Badge
                    if (hex.leader === clanId) {
                        ctx.fillStyle = '#ffd700';
                        ctx.beginPath();
                        ctx.arc(troopCx - 10, troopCy - 12, 9, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = '#b8860b';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();

                        ctx.font = '10px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('👑', troopCx - 10, troopCy - 12);
                    }

                    offsetIdx++;
                });
            }
        });
    }

    drawClanBadge(x, y, clanId, label) {
        const ctx = this.ctx;
        const clan = CLANS[clanId] || { color: '#c52828', accent: '#ffd700', text: '#fff' };

        ctx.fillStyle = clan.color;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = clan.accent || '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = clan.text || '#ffffff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
    }

    resetView() {
        this.scale = 0.85;
        this.panX = 80;
        this.panY = 20;
        this.render();
    }
}

window.BoardRenderer = BoardRenderer;
