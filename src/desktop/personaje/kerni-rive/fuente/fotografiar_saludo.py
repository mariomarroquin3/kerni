"""Fotografía el saludo disparado desde cada modo (clic sobre Kerni) para comprobar que no se
apilen caras ni brazos del modo anterior encima del saludo. Arma build/hoja_saludo.png.

Uso: python fotografiar_saludo.py [modo ...]     (sin argumentos: todos los modos con cara o brazos propios)
"""
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).parent
MODOS = ["aburrido", "neutro", "sonriente", "dormido", "alerta", "asustado", "research"]
ELEGIDOS = sys.argv[1:] or MODOS
RIVE = str(Path.home() / ".rive" / "bin" / "rive.exe")

fotos = []
for m in ELEGIDOS:
    env = {**os.environ, "KERNI_MODO": m}
    subprocess.run([sys.executable, "construir.py"], cwd=AQUI, env=env, check=True, capture_output=True)
    r = subprocess.run([RIVE, ".", f"--screenshot=build/saludo_en_{m}.png", "--pointer=click@500,700", "--advance=900ms"],
                       cwd=AQUI, capture_output=True, text=True)
    if "wrote" not in r.stdout + r.stderr:
        sys.exit(f"{m}: {r.stdout}{r.stderr}")
    im = Image.open(AQUI / "build" / f"saludo_en_{m}.png").convert("RGBA")
    fondo = Image.new("RGBA", im.size, (246, 248, 252, 255))
    fondo.alpha_composite(im)
    fotos.append(fondo.convert("RGB").resize((420, 420)))

cols = 4
filas = (len(fotos) + cols - 1) // cols
hoja = Image.new("RGB", (420 * cols, 420 * filas), (246, 248, 252))
for i, im in enumerate(fotos):
    hoja.paste(im, ((i % cols) * 420, (i // cols) * 420))
hoja.save(AQUI / "build" / "hoja_saludo.png")
subprocess.run([sys.executable, "construir.py"], cwd=AQUI, check=True, capture_output=True)  # deja la escena sin KERNI_MODO
print("hoja lista:", ", ".join(ELEGIDOS))
