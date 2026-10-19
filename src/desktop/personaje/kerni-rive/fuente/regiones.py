"""Divide una imagen de Kerni en regiones: cada zona de color encerrada por el contorno
oscuro del dibujo es una región. Sirve para revisar la imagen y como base de segmentar.py.

Uso: python regiones.py saludo     -> build/regiones_saludo.png y una tabla de regiones
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

AQUI = Path(__file__).parent
OSCURO = 95          # canal máximo por debajo de esto = línea de contorno / pantalla
MIN_AREA = 40


def cargar(nombre):
    im = Image.open(AQUI / f"kerni_{nombre}_ref.jpg").convert("RGB")
    return im, np.asarray(im).astype(np.int16)


def etiquetar(mask):
    """Componentes conectadas (4 vecinos) de `mask`. Devuelve (etiquetas, cantidad)."""
    h, w = mask.shape
    et = np.zeros((h, w), dtype=np.int32)
    plano = mask.ravel(); sal = et.ravel()
    n = 0
    for ini in np.flatnonzero(plano):
        if sal[ini]:
            continue
        n += 1
        pila = [ini]; sal[ini] = n
        while pila:
            p = pila.pop()
            y, x = divmod(p, w)
            for q, ok in ((p - w, y > 0), (p + w, y < h - 1), (p - 1, x > 0), (p + 1, x < w - 1)):
                if ok and plano[q] and not sal[q]:
                    sal[q] = n; pila.append(q)
    return et, n


def fondo_y_figura(rgb):
    claro = (rgb.min(axis=2) > 236)
    et, _ = etiquetar(claro)
    borde = set(np.unique(np.concatenate([et[0], et[-1], et[:, 0], et[:, -1]]))) - {0}
    fondo = np.isin(et, list(borde))
    return fondo, ~fondo


def regiones(rgb):
    fondo, figura = fondo_y_figura(rgb)
    oscuro = rgb.max(axis=2) < OSCURO
    interior = figura & ~oscuro
    et, n = etiquetar(interior)
    return et, n, fondo, figura, oscuro


if __name__ == "__main__":
    nombre = sys.argv[1]
    im, rgb = cargar(nombre)
    et, n, fondo, figura, oscuro = regiones(rgb)
    areas = np.bincount(et.ravel(), minlength=n + 1)
    lista = [i for i in range(1, n + 1) if areas[i] >= MIN_AREA]
    vis = Image.fromarray(np.where(fondo[..., None], 255, (rgb * 0.45 + 140).clip(0, 255)).astype(np.uint8))
    d = ImageDraw.Draw(vis)
    print(f"{nombre}: {len(lista)} regiones (de {n})")
    for i in sorted(lista, key=lambda i: -areas[i]):
        ys, xs = np.nonzero(et == i)
        col = rgb[et == i].mean(axis=0).astype(int)
        print(f"  r{i:<4} área {areas[i]:6d}  bbox x {xs.min():4d}-{xs.max():4d}  y {ys.min():4d}-{ys.max():4d}  color #{col[0]:02x}{col[1]:02x}{col[2]:02x}")
        if areas[i] > 150:
            d.text((xs.mean() - 8, ys.mean() - 5), str(i), fill=(255, 0, 0))
    vis.save(AQUI / "build" / f"regiones_{nombre}.png")
