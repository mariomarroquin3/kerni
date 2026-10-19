# Kerni en Rive · rig v1

Rig nativo de Kerni en Rive, construido igual que el de Bitoo (`bitoo/strategy/personaje/bitoo-rive`): las piezas salen de las imágenes de referencia, un script genera la escena y el Rive CLI la compila a `kerni.riv`. No se edita `scene.rml` a mano.

## Archivos

| Archivo | Qué es |
|---|---|
| `kerni.riv` | El archivo que carga la app (61 KB). Copia en `src/desktop/web/assets/kerni.riv` |
| `fuente/` | Todo lo necesario para regenerarlo (ver abajo) |
| `fuente/kerni_*_ref.jpg` | Las tres imágenes de referencia: saludo, sonriente, research |

## Qué hace hoy

Respira y parpadea siempre. Tiene ocho **modos** (que cruzan entre sí en 0.35 s) y un saludo:

| Modo | Cara | Cuerpo | Cuándo lo usa la app |
|---|---|---|---|
| `idle` | ojos redondos, sonrisa pequeña | brazos abajo, luces cian | Batería al **70 % o más** (la cara de siempre; también un equipo sin batería) |
| `neutro` | ojos y boca como rayitas | brazos abajo | Batería de **30 % a 69 %** |
| `aburrido` | ojos entrecerrados, boca ondulada, dos barras cian en el casco que respiran | brazos abajo, un poco caído | Batería **por debajo de 30 %** |
| `sonriente` | ojos felices `^ ^`, boca abierta | pulgares arriba con ambas manos, rebota | Reacción de 4 s tras una acción exitosa (limpieza, cierre de proceso) |
| `asustado` | ojos grandes, boca ondulada, gota de sudor | se encoge y tiembla, brazos hacia afuera, luces rojas | Modo pánico (CPU sostenida ≥ 95 %) |
| `research` | ojos redondos mirando abajo-izquierda, boca triste | inclinado, sostiene la lupa con haz de luz | Esperando al modelo, o el vigilante de RAM encontró un sospechoso |
| `dormido` | ojos cerrados, boca en línea, zZ que flotan | manos abrazadas al pecho, ladeado, luces tenues | Tras 3 minutos sin interacción con Kerni; al despertar saluda |
| `alerta` | ojos altos, cejas preocupadas, signo "!" parpadeando, boca en arco | dedo índice arriba y la otra mano abierta | Kerni propuso algo por iniciativa propia (vigilante de RAM, disco lleno, propuesta del modelo) y espera tu respuesta |
| *(saludo)* | ojos felices, boca abierta | levanta el brazo izquierdo y agita la mano abierta, 2.4 s | Al abrir la app y al hacer clic sobre Kerni (o tecla 1) |

Prioridad en la app (`modoKerni` en `web/estado.js`): `asustado` > `alerta` > `research` > `sonriente` > `dormido` > cara de la carga (`idle` / `neutro` / `aburrido`).

La carga es la **batería** (Windows `GetSystemPowerStatus`, leída en Rust cada 2 s). Tiene histéresis de 4 puntos, para que una batería que ronda 30 % o 70 % no haga parpadear la cara. En un equipo sin batería queda `idle`. `idle`, `neutro`, `aburrido` y `dormido` son los modos de **reposo**: ahí Kerni y el panel se vuelven un poco transparentes (como Bitoo) hasta que le movés el puntero o le escribís.

## Contrato con la app

Artboard `Kerni` (1024×1024), máquina de estados `kerni`, view model `Kerni`.

| Dato | Tipo | Valores |
|---|---|---|
| `modo` | lista | `idle` · `sonriente` · `asustado` · `research` · `dormido` · `alerta` · `neutro` · `aburrido` |
| `saludar` | disparador | saluda y vuelve al modo actual |
| `mirar_x`, `mirar_y` | número | −100 a 100: hacia dónde miran los ojos (0 = al frente) |

```js
const r = new Rive({
  src: kerniRiv, canvas, stateMachine: 'kerni', autoplay: true, autoBind: true,
  layout: new Layout({ fit: Fit.Contain, alignment: Alignment.BottomCenter }),
  onLoad: () => {
    const vm = r.viewModelInstance;
    vm.enum('modo').value = 'research';
    vm.trigger('saludar').trigger();
  },
});
```

La integración vive en `web/character.js` (`setModo`, `saludar`, `mirar`). Si el `.riv` no carga, queda el SVG provisional. **Mostrar el canvas antes de llamar a `resizeDrawingSurfaceToCanvas()`**; al revés queda de 0×0 y Kerni no se ve.

## Cómo está armado el rig

Las piezas del cuerpo son **regiones exactas de las imágenes** (cada zona de color encerrada por el contorno oscuro), vectorizadas con potrace y pintadas con degradado vertical y contorno. La cara y la lupa son **formas nativas**, porque cambian de expresión.

```
kerni (raíz, en los pies)
├── pose_modo                 inclina, rebota, encoge (lo mueve el modo)
│   └── cuerpo_resp           respira (capa propia)
│       ├── lupa_frente       lupa + haz de luz (delante de todo; solo en research)
│       ├── luces             dos píldoras: cian y roja
│       ├── casco
│       ├── cara              pantalla, ojos (redondos / felices), bocas, sudor
│       ├── oreja
│       ├── carcasa           cuerpo blanco + marco de la pantalla
│       ├── brazo_der         variantes: colgando | pulgar
│       └── brazo_izq         variantes: colgando (espejo del derecho) | saludo | pulgar
└── pie_izq, pie_der          quedan plantados cuando el cuerpo rebota
```

Las caras `neutro` y `aburrido` se dibujan nativas a partir de `kerni_neutro_ref.jpg` y `kerni_aburrido_ref.jpg` (el cuerpo es el del idle). Las imágenes de referencia son nueve: saludo, sonriente, research, dormido, alerta e idle (`base`), más un segundo saludo que no se usa (es el mismo diseño). Cada variante de brazo es una pose completa dibujada en las imágenes y se cambia con opacidad (el cruce de 0.35 s la suaviza). El brazo izquierdo colgando es el de la imagen `base` (idle).

Reglas para no romperlo:

- **El saludo toma el control de todas las propiedades de modo** (`DEF` en `construir.py`) con sus valores base y solo cambia las del saludo. Si no, la cara del modo (ojos entrecerrados, barras del casco, zZ, pulgares…) se dibuja encima de la del saludo. `test/integracion.test.js` lo comprueba leyendo `scene.rml`: toda propiedad que toque un modo debe estar cubierta por el saludo. Si agregás un modo o una propiedad nueva, el test te avisa.
- Los cruces entre modos duran 200 ms: más largos dejan ver las dos caras a medias.

- `construir.py` toca **todas** las propiedades de modo en cada animación de modo (`DEF`), para que el cruce siempre vuelva a los valores base.
- Capas separadas por propiedad, así no se pisan: `Respirar` (escala del cuerpo), `Parpadeo`, `Modo` (pose), `Saludo` (un disparo).
- `mirada_app` (datos de la app) y `mirada_modo` (animación) son nodos distintos para no pelear por la misma propiedad.
- Los brazos giran desde el hombro: **positivo = hacia afuera** en el izquierdo y **negativo** en el derecho. Más de ~15° en asustado se sale del lienzo.

## Regenerar el `.riv`

Requiere el [Rive CLI](https://rive.app/docs/cli/getting-started) (Windows: `irm https://releases.rive.app/cli/install.ps1 | iex`, luego `rive doctor`), Python 3 con `numpy`, `pillow` y `potracer` (`pip install --user potracer`).

```bash
cd src/desktop/personaje/kerni-rive/fuente
python segmentar.py     # solo si cambiaron las imágenes: regiones -> piezas.json
python construir.py     # piezas.json -> scene.rml
python fotografiar.py   # una captura de cada modo -> build/hoja_modos.png
python fotografiar_saludo.py   # el saludo disparado desde cada modo -> build/hoja_saludo.png (no debe haber caras apiladas)
rive . --verify         # comprueba la escena
rive inspect . --summary
rive . --screenshot=build/x.png --advance=40     # un cuadro
rive . --once           # build/kerni-rive.riv  -> copiar como kerni.riv y a web/assets/
```

Para fotografiar cada modo sin la app: `KERNI_MODO=research python construir.py` cambia el modo con el que arranca el archivo (solo para revisar; el `.riv` que se entrega se genera sin esa variable). El saludo se prueba con `--pointer=click@500,700 --advance=800ms`.

`regiones.py <imagen>` numera las regiones de una imagen (`build/regiones_<imagen>.png`). `segmentar.py` elige las piezas por número y **falla si una región cambió de lugar**: si cambiás una imagen, revisá la tabla `PARTES`.

## Pendiente

- [ ] Los ojos todavía no siguen el cursor: la ventana es click-through y no recibe el movimiento. Hay que mandar `mirar_x/y` desde Rust (posición del cursor).
- [ ] Modo `cansado` (CPU/RAM altas pero sin pánico): hoy cae en `idle`.
- [ ] Brillos en las manos. La cinta cian del casco ya está (visible en sonriente, dormido y alerta).
- [ ] Sonidos y gestos extra (celebrar, señalar, dormir) con el mismo mecanismo: un valor del `modo` o un disparador.
- [ ] Un `.riv` sin marca de agua exige una cuenta de Rive (plan Cadet o superior) vinculada al proyecto; en local no hace falta iniciar sesión.
- [ ] Probar el rig dentro de la ventana real de Tauri (hoy se probó en el navegador con datos de demostración y con capturas del CLI).
