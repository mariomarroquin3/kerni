"""Fotografía cada modo del rig con el Rive CLI y arma una hoja de contacto en build/hoja_modos.png.

Uso: python fotografiar.py [modo ...]     (sin argumentos: todos)
El `.riv` que se entrega se genera siempre sin KERNI_MODO; esto es solo para revisar.
"""
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).parent
MODOS = ["idle", "sonriente", "asustado", "research", "dormido", "alerta", "neutro", "aburrido"]
ELEGIDOS = sys.argv[1:] or MODOS
RIVE = str(Path.home() / ".rive" / "bin" / "rive.exe")

fotos = []
for m in ELEGIDOS:
    env = {**os.environ, "KERNI_MODO": m}
    subprocess.run([sys.executable, "construir.py"], cwd=AQUI, env=env, check=True, capture_output=True)
    r = subprocess.run([RIVE, ".", f"--screenshot=build/modo_{m}.png", "--advance=60"], cwd=AQUI, capture_output=True, text=True)
    if "wrote" not in r.stdout + r.stderr:
        sys.exit(f"{m}: {r.stdout}{r.stderr}")
    im = Image.open(AQUI / "build" / f"modo_{m}.png").convert("RGBA")
    fondo = Image.new("RGBA", im.size, (246, 248, 252, 255))
    fondo.alpha_composite(im)
    fotos.append(fondo.convert("RGB").resize((480, 480)))

cols = 4
filas = (len(fotos) + cols - 1) // cols
hoja = Image.new("RGB", (480 * cols, 480 * filas), (246, 248, 252))
for i, im in enumerate(fotos):
    hoja.paste(im, ((i % cols) * 480, (i // cols) * 480))
hoja.save(AQUI / "build" / "hoja_modos.png")
subprocess.run([sys.executable, "construir.py"], cwd=AQUI, check=True, capture_output=True)  # deja la escena sin KERNI_MODO
print("hoja lista:", ", ".join(ELEGIDOS))
