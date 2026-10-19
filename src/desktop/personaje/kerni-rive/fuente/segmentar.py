"""Vectoriza las piezas de Kerni a partir de sus tres imágenes de referencia.

Cada pieza es una región de color encerrada por el contorno oscuro del dibujo (ver
regiones.py). Aquí se eligen las regiones de cada parte del cuerpo por su número, se
verifica que sigan siendo las esperadas (caja y área) y se vectorizan con potrace.
Escribe piezas.json con, por región: contornos (puntos y asas cúbicas, en coordenadas
de la imagen de 1024), caja, centro y colores muestreados (arriba y abajo).

Uso: python segmentar.py     -> piezas.json + build/segmentos.png (para revisar)
"""
import json
from pathlib import Path
import numpy as np
import potrace
from PIL import Image

import regiones as R

AQUI = Path(__file__).parent

# parte -> (imagen, [(región, x_min, y_min, x_max, y_max)])  La caja esperada protege de
# que un cambio en las imágenes reasigne los números de región sin que nadie se entere.
PARTES = {
    # ---- imagen del saludo: cuerpo base
    "casco": ("saludo", [(13, 278, 118, 924, 276), (94, 259, 158, 925, 417), (235, 283, 273, 882, 426), (375, 281, 346, 295, 375), (477, 862, 419, 874, 452)]),
    "carcasa": ("saludo", [(343, 269, 331, 855, 849), (325, 302, 319, 744, 738), (509, 257, 437, 274, 577)]),
    "oreja": ("saludo", [(539, 794, 455, 856, 661), (599, 820, 494, 855, 621)]),
    "brazo_colgando": ("saludo", [(633, 840, 526, 925, 657), (792, 866, 637, 925, 680), (789, 845, 636, 965, 780), (1017, 862, 782, 949, 849),
                                  (1069, 846, 803, 879, 839), (1130, 873, 841, 904, 885), (1163, 888, 852, 924, 890)]),
    "brazo_saludo": ("saludo", [(574, 178, 471, 254, 559), (571, 167, 470, 210, 527), (389, 75, 360, 212, 531), (223, 59, 270, 175, 405), (297, 157, 307, 184, 348)]),
    "pie_izq": ("saludo", [(1071, 390, 805, 479, 888)]),
    "pie_der": ("saludo", [(1097, 612, 819, 707, 905)]),
    # ---- imagen sonriente: manos con pulgar arriba
    "pulgar_izq": ("sonriente", [(501, 183, 476, 255, 560), (349, 72, 384, 208, 547), (518, 183, 488, 212, 540), (307, 64, 370, 157, 467),
                                 (255, 119, 329, 145, 376), (310, 78, 371, 122, 400), (368, 68, 395, 117, 428), (407, 64, 424, 106, 450)]),
    "pulgar_der": ("sonriente", [(576, 841, 518, 966, 651), (537, 861, 501, 949, 610), (456, 892, 454, 917, 496),
                                 (540, 858, 502, 902, 524), (593, 849, 525, 897, 554), (651, 850, 557, 890, 582)]),
    # ---- imagen base (idle): el brazo izquierdo colgando de verdad (ya no se espeja el derecho)
    "base_izq": ("base", [(295, 191, 493, 262, 612), (431, 193, 600, 248, 632), (430, 160, 600, 269, 723), (581, 172, 723, 256, 777),
                          (608, 239, 732, 269, 764), (748, 216, 770, 248, 806), (809, 196, 781, 234, 810)]),
    # ---- imagen dormido: manos abrazadas al pecho (van delante del cuerpo)
    "dormido_izq": ("dormido", [(424, 235, 572, 271, 644), (462, 238, 628, 264, 658), (463, 240, 628, 358, 752), (492, 305, 673, 365, 752),
                                (499, 365, 680, 393, 707), (528, 362, 705, 397, 737), (561, 350, 728, 389, 755), (587, 331, 746, 371, 766)]),
    "dormido_der": ("dormido", [(446, 746, 601, 802, 712), (496, 751, 677, 771, 718), (490, 631, 670, 763, 785), (519, 613, 698, 669, 781),
                                (523, 587, 701, 620, 722), (555, 575, 725, 610, 750), (593, 580, 749, 618, 772), (631, 595, 771, 635, 787)]),
    # ---- imagen alerta: dedo índice arriba (izquierda) y mano abierta (derecha)
    "alerta_izq": ("alerta", [(699, 184, 490, 255, 563), (707, 187, 502, 217, 546), (575, 91, 403, 215, 548), (586, 90, 410, 179, 463),
                              (385, 103, 312, 133, 351), (455, 113, 347, 146, 378), (500, 120, 371, 165, 391), (504, 90, 372, 117, 393),
                              (545, 92, 389, 125, 426), (546, 120, 389, 157, 416), (547, 154, 389, 174, 419), (554, 69, 392, 86, 413),
                              (583, 72, 408, 104, 441)]),
    "alerta_der": ("alerta", [(727, 831, 526, 918, 630), (842, 867, 604, 914, 623), (852, 842, 615, 952, 743), (971, 851, 708, 939, 769),
                              (1002, 837, 730, 860, 761), (1043, 818, 746, 846, 771), (1083, 871, 762, 894, 789), (1090, 930, 764, 947, 782),
                              (1107, 903, 768, 928, 791), (1156, 936, 781, 953, 803), (1175, 870, 790, 893, 821), (1179, 909, 792, 930, 822)]),
    # ---- cinta cian del casco (aparece en los modos "encendidos")
    "cinta": ("sonriente", [(66, 265, 169, 883, 276), (181, 852, 222, 871, 239)]),
}


def cargar_imagenes():
    ims = {}
    for n in {p[0] for p in PARTES.values()}:
        _, rgb = R.cargar(n)
        et, k, fondo, figura, oscuro = R.regiones(rgb)
        ims[n] = (rgb, et)
    return ims


def contornos(mask):
    """Contornos cerrados (lista de [(punto, asa_entrada, asa_salida)]) de una máscara booleana."""
    h, w = mask.shape
    pad = np.zeros((h + 2, w + 2), dtype=bool)
    pad[1:-1, 1:-1] = mask
    # potracer traza lo que NO está marcado: se invierte (y se compensa el relleno de 1 px)
    arboles = potrace.Bitmap(~pad).trace(turdsize=6, alphamax=1.0, opticurve=True, opttolerance=0.5)
    out = []
    for curva in arboles:
        pts = []
        inicio = (curva.start_point.x - 1, curva.start_point.y - 1)
        previo = inicio
        for s in curva.segments:
            fin = (s.end_point.x - 1, s.end_point.y - 1)
            if s.is_corner:
                c = (s.c.x - 1, s.c.y - 1)
                pts.append([previo, None, None]) if not pts else None
                pts.append([c, None, None])
                previo = fin
                pts.append([fin, None, None])
            else:
                c1 = (s.c1.x - 1, s.c1.y - 1); c2 = (s.c2.x - 1, s.c2.y - 1)
                if not pts:
                    pts.append([previo, None, c1])
                else:
                    pts[-1][2] = c1
                pts.append([fin, c2, None])
                previo = fin
        # el último punto coincide con el inicial: se fusionan
        if len(pts) > 1 and abs(pts[-1][0][0] - pts[0][0][0]) < 1e-6 and abs(pts[-1][0][1] - pts[0][0][1]) < 1e-6:
            pts[0][1] = pts[-1][1] or pts[0][1]
            pts.pop()
        out.append([(tuple(p), tuple(a) if a else None, tuple(b) if b else None) for p, a, b in pts])
    return out


def hex_(c):
    return "FF%02X%02X%02X" % tuple(int(v) for v in c)


def muestrear(rgb, mask):
    """Color mediano del tercio de arriba y del tercio de abajo de la región (para un degradado vertical)."""
    ys, xs = np.nonzero(mask)
    y0, y1 = ys.min(), ys.max()
    tercio = max(1, (y1 - y0) // 3)
    arriba = mask & (np.arange(mask.shape[0])[:, None] <= y0 + tercio)
    abajo = mask & (np.arange(mask.shape[0])[:, None] >= y1 - tercio)
    med = lambda m: np.median(rgb[m], axis=0) if m.any() else np.median(rgb[mask], axis=0)
    return {"arriba": hex_(med(arriba)), "abajo": hex_(med(abajo)), "medio": hex_(np.median(rgb[mask], axis=0))}


def main():
    ims = cargar_imagenes()
    piezas = {}
    for parte, (img, regs) in PARTES.items():
        rgb, et = ims[img]
        for rid, x0, y0, x1, y1 in regs:
            mask = et == rid
            if not mask.any():
                raise SystemExit(f"{parte}: la región {rid} de {img} ya no existe")
            ys, xs = np.nonzero(mask)
            caja = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
            if max(abs(caja[0] - x0), abs(caja[1] - y0), abs(caja[2] - x1), abs(caja[3] - y1)) > 6:
                raise SystemExit(f"{parte}: la región {rid} de {img} cambió de lugar: {caja} vs esperado {(x0, y0, x1, y1)}")
            piezas[f"{parte}/r{rid}"] = {
                "parte": parte, "imagen": img, "region": rid, "bbox": caja,
                "centro": (float(xs.mean()), float(ys.mean())), "area": int(mask.sum()),
                "contornos": contornos(mask), "colores": muestrear(rgb, mask),
            }
    # color del contorno oscuro del dibujo (mediana de los píxeles de línea, sin la pantalla)
    rgb, et = ims["saludo"]
    linea = (rgb.max(axis=2) < R.OSCURO) & (rgb.max(axis=2) > 25)
    nombre_linea = hex_(np.median(rgb[linea], axis=0))
    out = {"linea": nombre_linea, "piezas": piezas}
    (AQUI / "piezas.json").write_text(json.dumps(out))
    print(f"{len(piezas)} piezas, contorno {nombre_linea} -> piezas.json")
    # revisión visual: todas las piezas pintadas con su color medio
    lienzo = np.full((1024, 1024, 3), 255, dtype=np.uint8)
    for parte, (img, regs) in PARTES.items():
        if img != "saludo":
            continue
        rgb, et = ims[img]
        for rid, *_ in regs:
            lienzo[et == rid] = rgb[et == rid].mean(axis=0).astype(np.uint8)
    Image.fromarray(lienzo).save(AQUI / "build" / "segmentos.png")


if __name__ == "__main__":
    main()
