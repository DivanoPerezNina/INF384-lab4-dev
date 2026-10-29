# Respuestas · Laboratorio 4
Alumno: [COMPLETAR: código PUCP]
Presupuesto: [COMPLETAR] min  Métrica DORA: [COMPLETAR]

## Parte 1 · Diagnóstico

### Defecto 1
- Job y etapa: `smoke`, etapa deploy (tenía `needs: build-push`, o sea quedaba al mismo nivel que `deploy`).
- Problema que causa en el pipeline: smoke arrancaba en paralelo con deploy. Como la función y su URL ya existían de un run anterior, smoke le pegaba a la versión que todavía estaba desplegada y salía en verde aunque la nueva no hubiera arrancado. Lo mismo pasaba con e2e y load, que dependen de smoke: probaban una versión que no era la de este commit. Además `smoke.sh` ya sabe comparar `/version` contra `EXPECTED_COMMIT`, pero el workflow nunca le pasaba esa variable, así que esa verificación no corría.
- Link al commit: https://github.com/DivanoPerezNina/INF384-lab4-dev/commit/8e42b5139859813ce123f219b09ca0f581c4f25b
- Corrección: mover de etapa (`needs: deploy`, pasa a post-deploy) y ajustar configuración (`EXPECTED_COMMIT: ${{ github.sha }}`).
- Evidencia: en el run base sin correcciones (https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40955859003, commit `49ba49e`), smoke empezó a las 21:14:33 UTC y deploy a las 21:14:34 UTC; deploy terminó a las 21:14:57, o sea smoke arrancó antes de que deploy empezara. [COMPLETAR con el run en verde de main] En el run <link>, deploy terminó a las [hh:mm:ss] y smoke empezó a las [hh:mm:ss], después. El log de smoke muestra `commit: [sha]`, que coincide con el commit del run. Antes de la corrección, smoke no imprimía la línea `commit:` porque `EXPECTED_COMMIT` venía vacío.

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
  [COMPLETAR si aplica: líneas del log de sca del run, por ejemplo cuántos paquetes analizó o algún hallazgo en un paquete dev.]

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
- Evidencia: en el run base https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40955859003, el paso "Navegador" del job e2e tardó 0:25 (21:15:15 a 21:15:40) de un job de 0:40, mientras que el paso Playwright, que corre las pruebas, tardó 0:03. [COMPLETAR] En el run de main con la corrección <link>, e2e tardó [m:ss], sin ese paso, y las 10 pruebas pasaron (`10 passed`).

### Defecto 5
- Job y etapa: `load`, etapa post-deploy.
- Problema que causa en el pipeline: load tenía `needs: smoke`, igual que e2e, así que los dos corrían a la vez contra la misma función. La carga cambia saldos mientras e2e los verifica, y el tráfico de e2e se mezcla con la latencia que mide k6, así que ninguno de los dos mide limpio. Además load corría también en cada pull request: unos 12 minutos por PR.
- Link al commit: https://github.com/DivanoPerezNina/INF384-lab4-dev/commit/a22a0c02eb90f17b847f95a94cdb253380218d20
- Corrección: mover de etapa (`needs: e2e`) y ajustar configuración (`if: github.event_name != 'pull_request'`; sigue corriendo en cada run de main).
- Evidencia: en el run base https://github.com/DivanoPerezNina/INF384-lab4-dev/actions/runs/40955859003, e2e y load empezaron los dos a las 21:15:06 UTC, en paralelo contra la misma función. [COMPLETAR] En el run de main <link>, e2e terminó a las [hh:mm:ss] y load empezó a las [hh:mm:ss]. En el run del pull request de la Parte 2 <link>, load aparece como skipped.

## Parte 2 · Implementación
- Link al run en verde en main: [COMPLETAR]
- Link al pull request: [COMPLETAR]
- Defecto de la aplicación introducido (archivo y descripción): `src/wallet.js`, en `transferir` la condición de saldo pasa de `cuentaOrigen.saldo < centimos` a `<=`. Un usuario ya no puede transferir exactamente todo su saldo: la API responde 400 "saldo insuficiente" cuando sí le alcanza.
- Job que debería detenerlo: `unit` (prueba "transferir todo el saldo deja el origen en cero"). integration también falla ("transferir todo el saldo deja el origen en cero y ya no puede transferir"). Al fallar, build-push no corre y nada se despliega.
- Link al run fallido: [COMPLETAR]

## Parte 3 · Decisión bajo restricción
Link al run medido: [COMPLETAR: el mismo run en verde de main de la Parte 2]

| Job | Duración (min:seg) |
|---|---|
| unit | |
| integration | |
| sast | |
| sca | |
| build-push | |
| deploy | |
| smoke | |
| e2e | |
| load | |
| **Total** | |

Resultado de load en ese run:
| Métrica | Valor |
|---|---|
| p90 | |
| p95 | |
| Máximo | |
| Tasa de error | |
| Requests por segundo | |

Conclusión sobre el comportamiento bajo carga: [COMPLETAR con los números. Plantilla: Con 30 usuarios virtuales sostenidos, Monedero Andino respondió con p95 de X ms y p90 de Y ms, con Z % de errores y unas R solicitudes por segundo. La mayor parte de las solicitudes es rápida y estable. El máximo de M ms está muy por encima del p95: son pocas solicitudes lentas, probablemente arranques en frío de nuevas instancias de Lambda cuando sube la carga. Por eso el SLO se define sobre un percentil y no sobre el máximo ni el promedio.]

SLO propuesto (percentil, valor, ventana) y justificación: [COMPLETAR. Plantilla: El 95 % de las solicitudes a la API responde en menos de N ms, medido en una ventana móvil de 28 días. Se configura `SLO_P95: N`. El p95 medido fue X ms; N deja un margen de aproximadamente 1,5 a 2 veces lo medido para absorber la variación normal entre runs y los arranques en frío, sin que load falle por ruido. Ponerlo pegado a X haría que load falle en runs normales; ponerlo muy alto lo volvería inútil como gate.]

SLA propuesto y diferencia con el SLO: [COMPLETAR. Plantilla: Monedero Andino se compromete con sus clientes a 99,5 % de disponibilidad mensual de la API y a que el 95 % de las transferencias responda en menos de 2× N ms; si se incumple, se compensa (por ejemplo, con un crédito en la comisión del mes). El SLA es un compromiso contractual externo con consecuencias; el SLO es la meta interna con la que el equipo opera y decide. El SLA es más holgado que el SLO a propósito: el equipo reacciona cuando se acerca al SLO, antes de llegar a incumplir el SLA.]

Cambios para cumplir el presupuesto:
| Cambio | Job | Minutos recuperados |
|---|---|---|
| Etapa constante de 10 a 4 min y rampas de 1 min a 30 s y 15 s (commit https://github.com/DivanoPerezNina/INF384-lab4-dev/commit/58b4a4c6413ee87bef24dbb3f719b5f5ce699c4f) | load | [COMPLETAR: duración antes menos después, aprox. 7] |
| [COMPLETAR si hace falta] | | |

Total resultante: [COMPLETAR] min
Link al run en main con los cambios: [COMPLETAR]

Riesgo aceptado (defecto de la aplicación concreto y efecto en la métrica DORA asignada): [COMPLETAR según la métrica asignada; ver el texto base abajo]

Texto base: Con la carga constante de 4 minutos (antes 10) y sin load en los pull requests, el pipeline deja pasar defectos de rendimiento que solo aparecen con carga sostenida o con la base más llena. Ejemplo concreto: un cambio en `src/db.js` que haga que `transferir` o `saldo` recorra la tabla `movimientos` completa (por ejemplo, calcular el saldo sumando movimientos en lugar de leer `usuarios.saldo`). La latencia crece a medida que se acumulan movimientos; en 4 minutos de carga se acumulan menos de la mitad de las filas que en 10, así que el p95 puede quedar bajo el SLO y el cambio llega a producción. Además, al no correr load en el PR, cualquier regresión de latencia se ve recién después del merge, cuando main ya desplegó.
- Si la métrica es change failure rate: sube, porque más despliegues a main terminan requiriendo una corrección.
- Si es lead time for changes: baja, porque el pipeline dura menos; el riesgo no la empeora, empeora la tasa de fallos.
- Si es deployment frequency: no cambia o sube (pipeline más corto); el riesgo se paga en fallos, no en frecuencia.
- Si es time to restore: sube, porque la degradación se detecta en producción y más tarde, cuando ya hay más datos acumulados.

Decisión sobre sast (se queda / se mueve a otra etapa o evento / informativo) y razón: Se queda en pre-build, bloqueante, en pull request y en main. Cuesta [COMPLETAR: duración del job sast] en el run medido, casi todo en instalar semgrep, y corre en paralelo con unit, integration y sca. Es el único control que mira el código de `src/` antes de construir, y un hallazgo detectado aquí no llega a desplegarse en la función compartida. Moverlo a post-deploy o dejarlo informativo ahorraría ese minuto pero dejaría llegar a producción un patrón inseguro, lo que en [métrica asignada] [COMPLETAR: sube el change failure rate / alarga el time to restore / etc.]. El minuto se recupera mejor recortando load.

## Declaración de uso de IA
Herramientas usadas y para qué:
- Claude (Anthropic): revisión del repositorio y del enunciado para identificar los defectos del pipeline, propuesta de las correcciones en `ci.yml`, `test/integration` y `test/e2e`, ejecución local de las pruebas para obtener evidencia (corridas repetidas de integración, e2e sin navegador), propuesta del defecto de la aplicación y borrador de la redacción de este archivo. Los runs, las mediciones de duración y de k6, el SLO elegido y las decisiones finales son míos.
