# ⛩️ Sengoku Conquerors - Simulador Oficial de Juego de Mesa (v1.4)

Simulador interactivo web y motor de juego para el juego de mesa táctico **Sengoku Conquerors**, basado estrictamente en el reglamento oficial v1.4 con mecánicas tácticas avanzadas y Ronda de Coronación con Regicidio (*Gekokujō*).

---

## 🎮 Características del Juego

* **Equilibrio Estricto y Clanes Simétricos:** 4 Casas feudales (Rojo, Amarillo, Azul, Verde) con reserva exacta de **28 tropas** y **6 castillos** por jugador. La ley de conservación de 28 piezas es estricta e inviolable.
* **👑 Líder del Clan (Daimyō):**
  * Desplegado desde el Turno 0 junto al Castillo inicial.
  * Aporta **+2 de Fuerza militar** efectiva en combates (+1 adicional sobre una tropa normal).
  * Otorga +1 Estandarte adicional al enemigo si es derrotado en batalla.
  * Reaparece la siguiente ronda en la Capital o castillo libre del clan.
* **⚔️ Combate Táctico por Mayorías (Sin dados ni cartas):**
  * **Empate:** Bajas mutuas completas de base.
  * **Mayoría:** La mayoría sufre $(B - 1)$ bajas, donde $B$ son las bajas de la minoría.
  * **🛡️ Retirada Táctica Voluntaria ("Repliegue con Honor"):** Un bando en desventaja puede retirarse a un hexágono de campo libre adyacente sin sufrir bajas; el rival captura la posición y obtiene 1 Estandarte.
  * **⚔️ Flanqueo Posicional (+1 Fuerza):** Si tienes tropas en $\ge 2$ hexágonos adyacentes distintos al combate.
  * **🚩 Empeño de Estandartes ("Grito de Guerra"):** Gasta 1 Estandarte para infligir +1 baja adicional al ejército enemigo.
  * **🛡️ Guarnición Fija:** Gasta la guarnición de un castillo propio adyacente para evitar 1 baja (1 vez por ronda).
* **🌾 Puntos de Interés Centrales:**
  * **⛩️ Torii Central (#67):** Consagración religiosa que desbloquea el derecho a recibir levas adicionales en las Aldeas.
  * **🌾 Aldeas Campesinas (#18, #116):** Otorgan +1 tropa de leva por turno (requiere consagración previa del Torii).
* **🏆 Las 4 Hazañas del Shōgun:**
  1. **⚔️ Sangre y Acero:** Acumular 6 Estandartes en combates ganados por mayoría.
  2. **⛩️ Dominio Feudal:** Controlar simultáneamente el Torii y al menos 1 Aldea sin disputa al final de una ronda.
  3. **🏯 Señor de Castillos:** Mantener los 6 Castillos en el tablero libres de asedio al final de una ronda.
  4. **🔥 Asolador:** Lograr al menos 2 asedios exitosos y mantener 1 asedio activo sobre un castillo rival al final de una ronda.
* **👑 Clímax: Ronda de Coronación y Regicidio (*Gekokujō*):**
  * Al alcanzar 3 Hazañas, un clan es proclamado **Aspirante a Shōgun** e inicia la **Ronda de Coronación**.
  * **🗡️ El Regicidio:** Si cualquier clan rival abate al Daimyō del Aspirante en combate campal o penetra y asedia su Castillo Capital, ¡la coronación se detiene al instante y ese rival **usurpa el trono y gana la partida automáticamente**!
  * **🎌 Coronación Triunfal:** Si el Aspirante resiste la ronda con su Daimyō con vida y su Capital libre de asedio, es coronado Shōgun supremo de Japón.

---

## 🚀 Cómo Ejecutar Localmente

### Opción 1: Acceso Directo (Recomendado en Windows)
Haz doble clic sobre el archivo:
```bash
Iniciar_Simulador.bat
```
Esto iniciará un servidor HTTP local ultraligero y abrirá automáticamente tu navegador predeterminado en `http://localhost:8080`.

### Opción 2: PowerShell
```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```

### Opción 3: Cualquier Servidor Web (Node / Python / Nginx)
```bash
# Con Python 3:
python -m http.server 8080

# Con Node.js (npx serve):
npx serve .
```

---

## 🧪 Pruebas Automatizadas y Balance

El repositorio incluye un conjunto de pruebas automatizadas en `test_simulation.html` que ejecutan partidas completas y verifican en tiempo de ejecución:
- La conservación matemática exacta de las 28 fichas por clan en cada turno y fase.
- La inexistencia de tropas sueltas dentro de fortalezas/castillos.
- La no rotación de la Ficha de Mando en modo 1v1 (2 jugadores) para evitar turnos dobles.
- El balance de victorias y activación de Regicidios en partidas de 2, 3 y 4 jugadores.

---

## 📁 Estructura del Proyecto

```text
├── index.html                 # Interfaz principal, canvas y paneles de control
├── style.css                  # Estilos visuales con estética feudal Sengoku
├── Iniciar_Simulador.bat      # Lanzador con un clic para Windows
├── server.ps1                 # Servidor HTTP local en PowerShell
├── hex_grid_data.json         # Topología de 132 hexágonos y coordenadas axiales
├── test_simulation.html       # Suite de tests automáticos e invariantes
├── js/
│   ├── app.js                 # Controlador de UI, eventos del usuario y modales
│   ├── game_engine.js         # Motor autoritativo de reglas, IA táctica y combates
│   ├── hex_grid_data.js       # Definición de celdas y conexiones vecinas
│   └── renderer.js            # Motor de renderizado en HTML5 Canvas con zoom/pan
├── assets/                    # Ilustraciones de edificios, terrenos y figuras
└── sfx/                       # Efectos de sonido (choque de espadas, tambor taiko)
```
