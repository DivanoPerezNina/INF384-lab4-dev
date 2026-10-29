# Respuestas · Laboratorio 4
Alumno: 20221481
Presupuesto: 8 min  Métrica DORA: time to restore

## Parte 1 · Diagnóstico

### Defecto 1
- Job y etapa: `smoke`, etapa deploy (tenía `needs: build-push`, o sea quedaba al mismo nivel que `deploy`).
- Problema que causa en el pipeline: smoke arrancaba en paralelo con deploy. Como la función y su URL ya existían de un run anterior, smoke le pegaba a la versión que todavía estaba desplegada y salía en verde aunque la nueva no hubiera arrancado. Lo mismo pasaba con e2e y load, que dependen de smoke: probaban una versión que no era la de este commit. Además `smoke.sh` ya sabe comparar `/version` contra `EXPECTED_COMMIT`, pero el workflow nunca le pasaba esa variable, así que esa verificación no corría.
- Link al commit: https://github.com/DivanoPerezNina/INF384-lab4-dev/commit/8e42b5139859813ce123f219b09ca0f581c4f25b
- Corrección: mover de etapa (`needs: deploy`, pasa a post-deploy) y ajustar configuración (`EXPECTED_COMMIT: ${{ github.sha }}`).
- Evidencia: en el run base sin correcciones (https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40955859003, commit `49ba49e`), smoke empezó a las 21:14:33 UTC y deploy a las 21:14:34 UTC; deploy terminó a las 21:14:57, o sea smoke arrancó antes de que deploy empezara. Con la corrección, en el run de main https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40958068569 (commit `a22a0c0`), deploy terminó a las 21:29:51 y smoke empezó a las 21:29:54, después. Smoke pasó con `EXPECTED_COMMIT` igual al sha del run; `smoke.sh` solo pasa ese bloque si `/version` devuelve ese mismo commit. Antes, `EXPECTED_COMMIT` venía vacío y el bloque se saltaba.

### Defecto 2
- Job y etapa: `sca`, etapa pre-build.
- Problema que causa en el pipeline: con `--include-dev-deps`, Trivy evaluaba también Playwright, c8, esbuild y todo lo que traen, que no viajan en la imagen (el Dockerfile hace `npm prune --omit=dev`). Una vulnerabilidad HIGH en una herramienta de pruebas detenía el pipeline sin que exista ese riesgo en lo desplegado. Es un gate que bloquea por algo que no es parte del artefacto.
- Link al commit: https://github.com/DivanoPerezNina/INF384-lab4-dev/commit/217a7c1b8982a433f5f4fb5ba57927838bf86313
- Corrección: ajustar configuración (se quita `--include-dev-deps`).
- Evidencia: de los 122 paquetes del lock, 84 son de desarrollo y solo 38 llegan a la imagen:
  ```
  $ node -e "const p=require('./package-lock.json').packages;const k=Object.keys(p).filter(x=>x);console.log('total',k.length,'prod',k.filter(x=>!p[x].dev).length)"
  total 122 prod 38
  ```

### Defecto 3
- Job y etapa: `integration`, etapa pre-build (`test/integration/transferir.test.js`).
- Problema que causa en el pipeline: las pruebas estaban encadenadas. Cada una dependía de los saldos que dejaba la anterior ("ana transfiere 100", luego "el saldo de ana refleja el débito", etc.). Solo pasan con una base vacía y en ese orden exacto. Si se filtra una prueba, se cambia el orden o se repite la corrida sobre la misma base, fallan aunque la aplicación esté bien. No son repetibles ni aisladas, y un rojo no indica dónde está el error.
- Link al commit: https://github.com/DivanoPerezNina/INF384-lab4-dev/commit/cd5988e713aad2a39a485c2d037cf4457486a74c
- Corrección: modificar tests (cada prueba crea su propia base SQLite en un directorio temporal y prepara sus datos).
- Evidencia: misma base, dos corridas seguidas, antes de la corrección:
  ```
  corrida 1: # pass 12  # fail 0
  corrida 2: # pass 6   # fail 6
  ```
  Después de la corrección, tres corridas seguidas sobre la misma `DB_PATH`: `# pass 7 # fail 0` en las tres.

### Defecto 4
- Job y etapa: `e2e`, etapa post-deploy (`test/e2e/api.spec.ts` y el paso "Navegador" de `ci.yml`).
- Problema que causa en el pipeline: todas las pruebas son llamadas HTTP a la API, pero usaban el fixture `page`, que obliga a levantar un navegador. Por eso el job instalaba chromium con todas sus dependencias del sistema (`--with-deps`) en cada run. Es tiempo de pipeline gastado en algo que la prueba no necesita.
- Link al commit: https://github.com/DivanoPerezNina/INF384-lab4-dev/commit/4f349eeca3937572b826e5c76c7f8a95af90c525
- Corrección: modificar tests (fixture `request` en lugar de `page`) y eliminar (paso "Navegador").
- Evidencia: en el run base https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40955859003, el paso "Navegador" del job e2e tardó 0:25 (21:15:15 a 21:15:40) de un job de 0:40, mientras que el paso Playwright, que corre las pruebas, tardó 0:03. En el run de main con la corrección https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40958068569, e2e tardó 0:15 sin ese paso (Playwright 0:02) y salió en verde: 25 segundos menos por run.

### Defecto 5
- Job y etapa: `load`, etapa post-deploy.
- Problema que causa en el pipeline: load tenía `needs: smoke`, igual que e2e, así que los dos corrían a la vez contra la misma función. La carga cambia saldos mientras e2e los verifica, y el tráfico de e2e se mezcla con la latencia que mide k6, así que ninguno de los dos mide limpio. Además load corría también en cada pull request: unos 12 minutos por PR.
- Link al commit: https://github.com/DivanoPerezNina/INF384-lab4-dev/commit/a22a0c02eb90f17b847f95a94cdb253380218d20
- Corrección: mover de etapa (`needs: e2e`) y ajustar configuración (`if: github.event_name != 'pull_request'`; sigue corriendo en cada run de main).
- Evidencia: en el run base https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40955859003, e2e y load empezaron los dos a las 21:15:06 UTC, en paralelo contra la misma función. Con la corrección, en el run de main https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40958068569, e2e terminó a las 21:30:23 y load empezó a las 21:30:25, después. En el run del pull request de la Parte 2 https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40960687323, load aparece como skipped.

## Parte 2 · Implementación
- Link al run en verde en main: https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40958068569
- Link al pull request: https://github.com/DivanoPerezNina/INF384-lab4-dev/pull/1
- Defecto de la aplicación introducido (archivo y descripción): `src/wallet.js`, en `transferir` la condición de saldo pasa de `cuentaOrigen.saldo < centimos` a `<=`. Un usuario ya no puede transferir exactamente todo su saldo: la API responde 400 "saldo insuficiente" cuando sí le alcanza.
- Job que debería detenerlo: `unit` (prueba "transferir todo el saldo deja el origen en cero"). integration también falla ("transferir todo el saldo deja el origen en cero y ya no puede transferir"). Al fallar, build-push no corre y nada se despliega.
- Link al run fallido: https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40960687323 (unit e integration en rojo; build-push, deploy, smoke, e2e y load en skipped, nada se desplegó)

## Parte 3 · Decisión bajo restricción
Link al run medido: https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40958068569

| Job | Duración (min:seg) |
|---|---|
| unit | 0:13 |
| integration | 0:12 |
| sast | 0:22 |
| sca | 0:22 |
| build-push | 0:41 |
| deploy | 0:20 |
| smoke | 0:12 |
| e2e | 0:15 |
| load | 12:08 |
| **Total** | **14:45** |

Resultado de load en ese run:
| Métrica | Valor |
|---|---|
| p90 | 20,92 ms |
| p95 | 23,15 ms |
| Máximo | 458,29 ms |
| Tasa de error | 0,00 % (0 de 38326) |
| Requests por segundo | 53,2 (38326 en 12 min) |

Conclusión sobre el comportamiento bajo carga: Con 30 usuarios virtuales sostenidos durante 10 minutos, Monedero Andino respondió con p95 de 23,15 ms, p90 de 20,92 ms y mediana de 17,01 ms, con 0 % de errores (0 de 38326 solicitudes) y unas 53 solicitudes por segundo. La distribución es muy estrecha: entre la mediana y el p95 hay solo 6 ms, así que bajo esta carga la API es rápida y estable. El máximo, 458,29 ms, es unas 20 veces el p95: son pocas solicitudes aisladas, lo más probable arranques en frío de instancias nuevas de Lambda al subir los usuarios en la rampa. No representan el comportamiento normal, por eso el SLO se define sobre un percentil y no sobre el máximo ni el promedio.

SLO propuesto (percentil, valor, ventana) y justificación: El 95 % de las solicitudes a la API (`/transferir` y `/saldo`) responde en menos de 50 ms, medido en una ventana móvil de 28 días. En `ci.yml` queda `SLO_P95: 50` (antes 500). El p95 medido fue 23,15 ms; 50 ms es algo más de 2 veces ese valor. Ese margen absorbe la variación normal entre runs (otra instancia de Lambda, otro runner, más arranques en frío en proporción porque la carga ahora dura 4 minutos y no 10) sin que load falle por ruido. Un valor pegado a lo medido, como 25 ms, haría fallar load en runs normales; el 500 anterior era más de 20 veces lo medido y no habría detectado una regresión que multiplique la latencia por 10.

SLA propuesto y diferencia con el SLO: Monedero Andino se compromete con sus clientes a 99,5 % de disponibilidad mensual de la API y a que el 95 % de las transferencias del mes responda en menos de 100 ms; si se incumple, el cliente recibe un crédito sobre la comisión del mes. El SLA es un compromiso externo y contractual, con consecuencias para la empresa; el SLO es la meta interna con la que el equipo opera y decide (por ejemplo, frenar cambios cuando se acerca al límite). No tienen el mismo valor a propósito: el SLA es más holgado (100 ms frente a 50 ms) para que el equipo vea que se aleja del SLO y reaccione antes de llegar a incumplir lo que se prometió al cliente.

Cambios para cumplir el presupuesto:
| Cambio | Job | Minutos recuperados |
|---|---|---|
| Etapa constante de 10 a 4 min y rampas de 1 min a 30 s y 15 s (commit https://github.com/DivanoPerezNina/INF384-lab4-dev/commit/58b4a4c6413ee87bef24dbb3f719b5f5ce699c4f) | load | 7:15 (las etapas de k6 pasan de 12:00 a 4:45) |
| Rampas de 30 s y 15 s a 10 s y 5 s; la carga constante sigue en 4 min (commit https://github.com/DivanoPerezNina/INF384-lab4-dev/commit/0b2e467) | load | 0:30 (las etapas de k6 pasan de 4:45 a 4:15) |
| `SLO_P95` de 500 a 50 ms, sin efecto en la duración (commit https://github.com/DivanoPerezNina/INF384-lab4-dev/commit/1b8fbc4) | load | 0:00 |

Los dos recortes se midieron juntos en un mismo run: load pasó de 12:08 en el run medido a 4:25 en el run nuevo, 7:43 menos. La separación entre los dos commits sale de la duración de las etapas de k6. El resto de los jobs varió unos segundos entre runs (de 2:37 a 2:22 sin contar load).

| Job | Antes (run medido) | Después |
|---|---|---|
| unit | 0:13 | 0:11 |
| integration | 0:12 | 0:11 |
| sast | 0:22 | 0:19 |
| sca | 0:22 | 0:18 |
| build-push | 0:41 | 0:43 |
| deploy | 0:20 | 0:15 |
| smoke | 0:12 | 0:11 |
| e2e | 0:15 | 0:14 |
| load | 12:08 | 4:25 |
| **Total** | **14:45** | **6:47** |

Total resultante: 6:47 min (presupuesto 8 min), con load en verde contra el nuevo `SLO_P95: 50`.
Link al run en main con los cambios: https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40960182987

Riesgo aceptado (defecto de la aplicación concreto y efecto en la métrica DORA asignada): Con la carga constante de 4 minutos (antes 10) y sin load en los pull requests, el pipeline detecta más tarde, o deja de detectar, defectos de rendimiento que solo aparecen con carga sostenida o con la base más llena. Ejemplo concreto: un cambio en `src/db.js` que calcule el saldo sumando la tabla `movimientos` en vez de leer `usuarios.saldo`. La latencia crece con cada transferencia acumulada; en 4 minutos se acumulan menos de la mitad de las filas que en 10, así que el p95 puede quedar bajo los 50 ms y el cambio llega a main desplegado. Efecto en **time to restore: sube**. La degradación se descubre en producción y no en el pipeline, cuando la base ya tiene más movimientos y la latencia es peor; hay que notar el problema, encontrar la causa en `src/db.js` y pasar la corrección por todo el pipeline otra vez. Además, como el PR no corre load, la regresión se ve recién después del merge, con la versión mala ya en la función.


Decisión sobre sast (se queda / se mueve a otra etapa o evento / informativo) y razón: Se queda en pre-build, bloqueante, en pull request y en main. Cuesta 0:22 en el run medido (0:16 instalando semgrep, 0:03 el escaneo), unos 22 segundos de los 8 minutos del presupuesto, y corre en paralelo con unit, integration y sca, así que no alarga el camino crítico: build-push espera igual a sca, que también tarda 0:22. Es el único control que mira el código de `src/` antes de construir. Efecto en time to restore: mantenerlo no lo sube, porque una corrección urgente no espera más por sast (corre en paralelo). Moverlo a post-deploy o dejarlo informativo ahorraría esos 22 segundos de suma, pero dejaría llegar a la función un patrón inseguro (por ejemplo una inyección SQL en `src/db.js`), que se descubriría en producción y obligaría a un ciclo completo de detección, corrección y redespliegue: el time to restore subiría. El tiempo se recupera mejor recortando load.

## Declaración de uso de IA
Herramientas usadas y para qué:
- Claude (Anthropic): revisión del repositorio y del enunciado para identificar los defectos del pipeline, propuesta de las correcciones en `ci.yml`, `test/integration` y `test/e2e`, ejecución local de las pruebas para obtener evidencia (corridas repetidas de integración, e2e sin navegador), propuesta del defecto de la aplicación y borrador de la redacción de este archivo. Los runs, las mediciones de duración y de k6, el SLO elegido y las decisiones finales son míos.
- Claude Code (Anthropic), en una sesión en la nube conectada a mi fork: aplicar las ramas con los commits, hacer los push a main y de las ramas, consultar en la API de GitHub los tiempos de los jobs y pasos de cada run para la evidencia y la tabla de duraciones, preparar el recorte adicional de las rampas de load y el cambio de `SLO_P95`, y completar este archivo con los datos medidos. El resumen de k6 lo copié yo del log del job load.
