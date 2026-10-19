"""Construye a Kerni en Rive (scene.rml) a partir de piezas.json.

Las piezas del cuerpo (casco, carcasa, brazos, pies) son las regiones exactas de las
imágenes de referencia, vectorizadas con segmentar.py. La cara (pantalla, ojos, boca,
luces, sudor) y la lupa se dibujan nativas: son formas simples que cambian de expresión.

Misma estructura que el rig de Bitoo (strategy/personaje/bitoo-rive/fuente/construir.py),
con un `modo` (lista) en lugar de solo disparadores:

  kerni (en los pies)
  ├── pose_modo          inclina / rebota / encoge según el modo
  │   └── cuerpo_resp    respira
  │       ├── luces, casco, cara, pantalla, oreja, carcasa, brazo_der, brazo_izq
  └── pie_izq, pie_der   quedan plantados cuando el cuerpo rebota

Uso: python segmentar.py (una vez) y luego python construir.py
"""
import json, math, os
from pathlib import Path

AQUI = Path(__file__).parent
RAD = math.pi / 180
DATOS = json.loads((AQUI / "piezas.json").read_text())
PZ, LINEA = DATOS["piezas"], DATOS["linea"]

# ---------------------------------------------------------------- ayudantes
_n = [99]
def nid():
    _n[0] += 1
    return f"0:{_n[0]}"

def f(v):
    return f"{v:.3f}".rstrip("0").rstrip(".") if isinstance(v, float) else str(v)

IDS = {}
def reg(name):
    IDS[name] = nid(); return IDS[name]

def solid(c): return f'<SolidColor colorValue="{c}" name="Color"/>'
def fill(inner, extra=""): return f'<Fill{extra} name="Relleno">{inner}</Fill>'
def trazo_linea(grosor, c=None, cap="round"):
    return f'<Stroke thickness="{f(float(grosor))}" cap="{cap}" join="round" name="Linea">{solid(c or LINEA)}</Stroke>'
def lineal(x1, y1, x2, y2, stops):
    if stops and not isinstance(stops[0], (list, tuple)):
        stops = [(i / (len(stops) - 1), c) for i, c in enumerate(stops)]
    return (f'<LinearGradient startX="{f(x1)}" startY="{f(y1)}" endX="{f(x2)}" endY="{f(y2)}" name="Gradiente">'
            + "".join(f'<GradientStop colorValue="{c}" position="{f(p)}"/>' for p, c in stops) + "</LinearGradient>")
def radial(x, y, r, stops):
    if stops and not isinstance(stops[0], (list, tuple)):
        stops = [(i / (len(stops) - 1), c) for i, c in enumerate(stops)]
    return (f'<RadialGradient startX="{f(x)}" startY="{f(y)}" endX="{f(x + r)}" endY="{f(y)}" name="Gradiente">'
            + "".join(f'<GradientStop colorValue="{c}" position="{f(p)}"/>' for p, c in stops) + "</RadialGradient>")
def ellipse(w, h): return f'<Ellipse width="{f(float(w))}" height="{f(float(h))}" originX="0.5" originY="0.5" name="Trazo"/>'
def rect(w, h, r, ox=0.5, oy=0.5):
    return f'<Rectangle width="{f(float(w))}" height="{f(float(h))}" cornerRadiusTL="{f(float(r))}" originX="{f(ox)}" originY="{f(oy)}" name="Trazo"/>'

def shape(name, x, y, body, rot=0.0, extra=""):
    sid = reg(name)
    r = f' rotation="{f(rot)}"' if rot else ""
    return f'<Shape x="{f(float(x))}" y="{f(float(y))}"{r}{extra} name="{name}" id="{sid}">{body}</Shape>'

def node(name, x, y, children, rot=0.0, extra=""):
    sid = reg(name)
    r = f' rotation="{f(rot)}"' if rot else ""
    return f'<Node x="{f(float(x))}" y="{f(float(y))}"{r}{extra} name="{name}" id="{sid}">{"".join(children)}</Node>'

def camino(puntos, cerrado=False):
    """Curva suave (Catmull-Rom) por los puntos dados."""
    n = len(puntos); out = []
    for i, p in enumerate(puntos):
        a = puntos[(i - 1) % n] if cerrado or i > 0 else p
        b = puntos[(i + 1) % n] if cerrado or i < n - 1 else p
        tx, ty = (b[0] - a[0]) * 0.5, (b[1] - a[1]) * 0.5
        ang, d = math.atan2(ty, tx), math.hypot(tx, ty) / 3
        out.append(f'<CubicDetachedVertex x="{f(float(p[0]))}" y="{f(float(p[1]))}" inRotation="{f(ang + math.pi)}" inDistance="{f(d)}" outRotation="{f(ang)}" outDistance="{f(d)}"/>')
    return f'<PointsPath isClosed="{"true" if cerrado else "false"}" isClockwise="true" name="Trazo">{"".join(out)}</PointsPath>'

def contornos_xml(contornos, ax, ay):
    out = []
    for pts in contornos:
        vs = []
        for p, cin, cout in pts:
            def pol(c):
                if not c: return 0.0, 0.0
                dx, dy = c[0] - p[0], c[1] - p[1]
                return math.atan2(dy, dx), math.hypot(dx, dy)
            ir, idist = pol(cin); orr, od = pol(cout)
            vs.append(f'<CubicDetachedVertex x="{f(p[0]-ax)}" y="{f(p[1]-ay)}" inRotation="{f(ir)}" inDistance="{f(idist)}" outRotation="{f(orr)}" outDistance="{f(od)}"/>')
        out.append(f'<PointsPath isClosed="true" isClockwise="true" name="Trazo">{"".join(vs)}</PointsPath>')
    return "".join(out)

def region(clave, ax, ay, borde=5.5, nombre=None):
    """Shape con la silueta exacta de la región `clave`, anclada en (ax, ay), con degradado vertical y contorno oscuro."""
    p = PZ[clave]; b = p["bbox"]; c = p["colores"]
    grad = lineal(0, b[1] - ay, 0, b[3] - ay, [c["arriba"], c["abajo"]])
    return shape(nombre or clave.replace("/", "_"), 0, 0,
                 contornos_xml(p["contornos"], ax, ay) + fill(grad, ' fillRule="evenOdd"') + trazo_linea(borde))

def parte(nombre, ax, ay, borde=5.5, solo=None):
    """Todas las regiones de una parte, en el orden de PARTES (la primera abajo)."""
    claves = [k for k, v in PZ.items() if v["parte"] == nombre and (solo is None or v["region"] in solo)]
    return [region(k, ax, ay, borde) for k in claves]

# ---------------------------------------------------------------- medidas (coordenadas de la imagen, 1024)
RAIZ = (500.0, 905.0)                      # los pies
def rel(x, y): return x - RAIZ[0], y - RAIZ[1]
HOMBRO_DER = (868.0, 548.0)
HOMBRO_IZQ = (262.0, 520.0)
PANTALLA = (503.0, 520.0)                  # centro de la pantalla
CIAN, CIAN_BRILLO = "FF5BFDFE", "FF37E6F2"

# ---------------------------------------------------------------- cara (nativa)
def brillo(forma, grosor=0.0, feather=14):
    """Relleno cian con un halo (Feather) detrás, como el resplandor de una pantalla."""
    return (f'<Fill name="Halo">{solid(CIAN_BRILLO)}<Feather strength="{feather}" name="Suave"/></Fill>' if not grosor else "")

def ojo_redondo(lado, dx, dy):
    forma = ellipse(60, 76)
    halo = shape(f"halo_ojo_{lado}", dx, dy, forma + f'<Fill name="Halo">{solid("AA37E6F2")}<Feather strength="16" name="Suave"/></Fill>')
    ojo = shape(f"ojo_{lado}", dx, dy, forma + fill(lineal(0, -38, 0, 38, ["FFC9FFFF", CIAN, "FF3FE8F0"])))
    brillo_ = shape(f"brillo_ojo_{lado}", dx - 12, dy - 18, ellipse(13, 17) + fill(solid("CCFFFFFF")))
    return [brillo_, ojo, halo]

def ojo_feliz(lado, dx, dy):
    arco = camino([(38 * math.cos(a * RAD), 38 * math.sin(a * RAD) + 18) for a in (192, 215, 245, 270, 295, 325, 348)])
    halo = shape(f"halo_feliz_{lado}", dx, dy, arco + f'<Stroke thickness="30" cap="butt" join="round" name="Halo">{solid("AA37E6F2")}<Feather strength="16" name="Suave"/></Stroke>')
    ojo = shape(f"feliz_{lado}", dx, dy, arco + f'<Stroke thickness="24" cap="butt" join="round" name="Linea">{solid(CIAN)}</Stroke>')
    return [ojo, halo]

def boca_sonrisa(cx, cy):
    arco = camino([(-30, -2), (-14, 12), (0, 16), (14, 12), (30, -2)])
    return [shape("boca_sonrisa", cx, cy, arco + f'<Stroke thickness="11" cap="round" join="round" name="Linea">{solid(CIAN)}</Stroke>'),
            shape("halo_boca_sonrisa", cx, cy, arco + f'<Stroke thickness="16" cap="round" join="round" name="Halo">{solid("AA37E6F2")}<Feather strength="12" name="Suave"/></Stroke>')]

def boca_abierta(cx, cy):
    # media luna llena (la boca abierta de la pose sonriente)
    v = [(-52, -20), (-26, -23), (0, -24), (26, -23), (52, -20), (47, 8), (31, 31), (0, 43), (-31, 31), (-47, 8)]
    forma = camino(v, cerrado=True)
    return [shape("boca_abierta", cx, cy, forma + fill(lineal(0, -22, 0, 44, ["FFA6FFFF", CIAN, "FF3FE8F0"]))),
            shape("halo_boca_abierta", cx, cy, forma + f'<Fill name="Halo">{solid("AA37E6F2")}<Feather strength="14" name="Suave"/></Fill>')]

def boca_triste(cx, cy):
    arco = camino([(-22, 6), (-8, -6), (8, -6), (22, 6)])
    return [shape("boca_triste", cx, cy, arco + f'<Stroke thickness="10" cap="round" join="round" name="Linea">{solid(CIAN)}</Stroke>'),
            shape("halo_boca_triste", cx, cy, arco + f'<Stroke thickness="15" cap="round" join="round" name="Halo">{solid("AA37E6F2")}<Feather strength="10" name="Suave"/></Stroke>')]

def boca_ondulada(cx, cy):
    onda = camino([(-44, 2), (-30, -10), (-15, 10), (0, -10), (15, 10), (30, -10), (44, 2)])
    return [shape("boca_ondulada", cx, cy, onda + f'<Stroke thickness="10" cap="round" join="round" name="Linea">{solid(CIAN)}</Stroke>'),
            shape("halo_boca_ondulada", cx, cy, onda + f'<Stroke thickness="15" cap="round" join="round" name="Halo">{solid("AA37E6F2")}<Feather strength="10" name="Suave"/></Stroke>')]

def gota_sudor(x, y):
    gota = camino([(0, -32), (9, -12), (15, 6), (8, 19), (0, 22), (-8, 19), (-15, 6), (-9, -12)], cerrado=True)
    return shape("sudor", x, y, gota + fill(lineal(0, -32, 0, 22, ["FFD7F4FF", "FF7DD3FC"])) + trazo_linea(3.5, "FF3B82B4"))

def halo_trazo(nombre, x, y, camino_xml, grosor, cap="round"):
    """Línea cian con halo: la forma base de varias expresiones."""
    return [shape(nombre, x, y, camino_xml + f'<Stroke thickness="{grosor}" cap="{cap}" join="round" name="Linea">{solid(CIAN)}</Stroke>'),
            shape("halo_" + nombre, x, y, camino_xml + f'<Stroke thickness="{grosor + 6}" cap="{cap}" join="round" name="Halo">{solid("AA37E6F2")}<Feather strength="12" name="Suave"/></Stroke>')]

def ojo_dormido(lado, dx, dy):
    """Ojo cerrado: media luna hacia abajo."""
    arco = camino([(46 * math.cos(a * RAD), 32 * math.sin(a * RAD) - 14) for a in (8, 35, 65, 90, 115, 145, 172)])
    return halo_trazo(f"dormido_{lado}", dx, dy, arco, 22, cap="butt")

def ojo_alerta(lado, dx, dy, ancho=58, alto=100):
    forma = ellipse(ancho, alto)
    halo = shape(f"halo_alerta_{lado}", dx, dy, forma + f'<Fill name="Halo">{solid("AA37E6F2")}<Feather strength="16" name="Suave"/></Fill>')
    ojo = shape(f"alerta_{lado}", dx, dy, forma + fill(lineal(0, -alto / 2, 0, alto / 2, ["FFC9FFFF", CIAN, "FF3FE8F0"])))
    brillo_ = shape(f"brillo_alerta_{lado}", dx - 12, dy - 28, ellipse(12, 18) + fill(solid("CCFFFFFF")))
    return [brillo_, ojo, halo]

def ceja_alerta(lado, cx, cy, ang):
    arco = camino([(-20, 4), (0, -3), (20, 4)])
    return shape(f"ceja_{lado}", cx, cy, arco + f'<Stroke thickness="9" cap="round" join="round" name="Linea">{solid(CIAN)}</Stroke>', rot=ang * RAD)

def signo_exclamacion(x, y):
    barra = shape("signo_barra", 0, -22, rect(17, 58, 8) + fill(lineal(0, -29, 0, 29, ["FFC9FFFF", CIAN])))
    punto = shape("signo_punto", 0, 24, ellipse(18, 18) + fill(solid(CIAN)))
    halo = shape("signo_halo", 0, 0, rect(17, 58, 8) + f'<Fill name="Halo">{solid("AA37E6F2")}<Feather strength="12" name="Suave"/></Fill>')
    return node("signo_pos", x, y, [punto, barra, halo])

def boca_alerta_xml(cx, cy):
    forma = camino([(-44, 12), (-32, -4), (0, -15), (32, -4), (44, 12), (0, 17)], cerrado=True)
    return [shape("boca_alerta", cx, cy, forma + fill(lineal(0, -15, 0, 17, ["FFA6FFFF", CIAN, "FF3FE8F0"]))),
            shape("halo_boca_alerta", cx, cy, forma + f'<Fill name="Halo">{solid("AA37E6F2")}<Feather strength="12" name="Suave"/></Fill>')]

def boca_dormido_xml(cx, cy):
    return [shape("boca_dormido", cx, cy, rect(46, 12, 6) + fill(solid(CIAN))),
            shape("halo_boca_dormido", cx, cy, rect(46, 12, 6) + f'<Fill name="Halo">{solid("AA37E6F2")}<Feather strength="10" name="Suave"/></Fill>')]

def zeta(nombre, x, y, tam, grosor):
    """Una Z de las que flotan cuando duerme."""
    z = camino([(-tam, -tam), (tam, -tam), (-tam, tam), (tam, tam)])
    return node(nombre, x, y, [shape(nombre + "_forma", 0, 0, z + f'<Stroke thickness="{grosor}" cap="round" join="round" name="Linea">{solid("FF7DF4FA")}</Stroke>'),
                               shape(nombre + "_halo", 0, 0, z + f'<Stroke thickness="{grosor + 6}" cap="round" join="round" name="Halo">{solid("AA37E6F2")}<Feather strength="10" name="Suave"/></Stroke>')])

def zzz():
    """Tres Z (grande, chica, mediana) a la izquierda del casco. Flotan solas; el modo las muestra."""
    zs = [zeta("zeta1", *rel(154, 345), 28, 15), zeta("zeta2", *rel(232, 338), 16, 10), zeta("zeta3", *rel(212, 412), 21, 12)]
    return node("zzz_g", 0, 0, [node("zzz_flota", 0, 0, zs)], extra=' opacity="0"')

def ojo_neutro(lado, dx, dy):
    """Ojo serio: una rayita horizontal (referencia: kerni_neutro_ref.jpg)."""
    forma = rect(76, 16, 8)
    halo = shape(f"halo_neutro_{lado}", dx, dy, forma + f'<Fill name="Halo">{solid("AA37E6F2")}<Feather strength="12" name="Suave"/></Fill>')
    ojo = shape(f"neutro_{lado}", dx, dy, forma + fill(lineal(0, -8, 0, 8, ["FF8FF4FF", CIAN, "FF2BC8D8"])))
    return [ojo, halo]

def boca_neutro_xml(cx, cy):
    forma = rect(86, 8, 4)
    return [shape("boca_neutro", cx, cy, forma + fill(solid("FF4FD8EA"))),
            shape("halo_boca_neutro", cx, cy, forma + f'<Fill name="Halo">{solid("88 37E6F2".replace(" ", ""))}<Feather strength="9" name="Suave"/></Fill>')]

def ojo_aburrido(lado, dx, dy, ang):
    """Ojo entrecerrado: medio disco con el borde de arriba plano (referencia: kerni_aburrido_ref.jpg)."""
    forma = camino([(-34, -3), (-18, -5), (0, -5), (18, -5), (34, -3), (39, 6), (31, 19), (15, 30), (0, 34), (-15, 30), (-31, 19), (-39, 6)], cerrado=True)
    halo = shape(f"halo_aburrido_{lado}", dx, dy, forma + f'<Fill name="Halo">{solid("AA37E6F2")}<Feather strength="14" name="Suave"/></Fill>', rot=ang * RAD)
    ojo = shape(f"aburrido_{lado}", dx, dy, forma + fill(lineal(0, -5, 0, 34, ["FF7EF0FA", CIAN, "FF3FD6E6"])), rot=ang * RAD)
    return [ojo, halo]

def boca_aburrida_xml(cx, cy):
    onda = camino([(-36, 3), (-24, -4), (-10, 5), (4, -4), (18, 5), (30, -2), (36, 1)])
    return halo_trazo("boca_aburrida", cx, cy, onda, 7)

def barras_casco():
    """Las dos barras cian del casco que se ven en la cara aburrida."""
    out = []
    for lado, (x, y, largo, ang) in {"izq": (346, 192, 160, -8), "der": (716, 203, 172, 9)}.items():
        forma = rect(largo, 20, 10)
        halo = shape(f"halo_barra_{lado}", 0, 0, forma + f'<Fill name="Halo">{solid("AA37E6F2")}<Feather strength="12" name="Suave"/></Fill>')
        barra = shape(f"barra_{lado}", 0, 0, forma + fill(lineal(0, -10, 0, 10, ["FF9AF6FF", CIAN, "FF2FC4D6"])))
        out.append(node(f"pos_barra_{lado}", x - CASCO_ANCLA[0], y - CASCO_ANCLA[1], [barra, halo], rot=ang * RAD))
    return node("barras_cap", 0, 0, out, extra=' opacity="0"')

def pantalla():
    """Pantalla oscura con brillo de vidrio."""
    r = 172.0
    base = shape("pantalla", 0, 0, ellipse(2 * r, 2 * r + 12) + fill(lineal(0, -r, 0, r, ["FF2B3858", "FF22324F", "FF1B2744"])) + trazo_linea(6))
    vidrio = shape("pantalla_brillo", -62, -112, ellipse(66, 30) + fill(solid("55FFFFFF")), rot=-28 * RAD)
    vidrio2 = shape("pantalla_brillo_chico", -92, -92, ellipse(16, 10) + fill(solid("44FFFFFF")), rot=-28 * RAD)
    return node("pos_pantalla", 0, 0, [vidrio2, vidrio, base])

def cara():
    px, py = PANTALLA
    ojos_y = -26.0
    redondos = node("ojos_redondos", 0, 0, ojo_redondo("izq", -82, ojos_y) + ojo_redondo("der", 80, ojos_y))
    felices = node("ojos_felices", 0, 0, ojo_feliz("izq", -82, ojos_y + 4) + ojo_feliz("der", 80, ojos_y + 6), extra=' opacity="0"')
    # `mirada_modo` lo mueve la animación del modo; `mirada_app` lo mueve la app (mirar_x / mirar_y)
    dormidos = node("ojos_dormido", 0, 0, ojo_dormido("izq", -88, -4) + ojo_dormido("der", 72, 0), extra=' opacity="0"')
    alertas = node("ojos_alerta", 0, 0, ojo_alerta("izq", -88, -5) + ojo_alerta("der", 64, -10), extra=' opacity="0"')
    cejas = node("cejas_alerta", 0, 0, [ceja_alerta("izq", -92, -93, -16), ceja_alerta("der", 81, -91, 20)], extra=' opacity="0"')
    neutros = node("ojos_neutro", 0, 0, ojo_neutro("izq", -84, -28) + ojo_neutro("der", 80, -28), extra=' opacity="0"')
    aburridos = node("ojos_aburrido", 0, 0, ojo_aburrido("izq", -83, -7, 3) + ojo_aburrido("der", 82, 0, -4), extra=' opacity="0"')
    ojos = node("mirada_modo", 0, 0, [node("mirada_app", 0, 0, [node("parpadeo", 0, 0, [redondos]), felices, dormidos, alertas, cejas, neutros, aburridos])])
    bocas = node("bocas", 0, 62, [node("boca_neutro_g", -2, 0, boca_neutro_xml(0, 0), extra=' opacity="0"'),
                                  node("boca_aburrida_g", -16, 1, boca_aburrida_xml(0, 0), extra=' opacity="0"'),
                                  node("boca_dormido_g", -15, -5, boca_dormido_xml(0, 0), extra=' opacity="0"'),
                                  node("boca_alerta_g", -16, 25, boca_alerta_xml(0, 0), extra=' opacity="0"'),
                                  node("boca_triste_g", 0, 0, boca_triste(0, 0), extra=' opacity="0"'),
                                  node("boca_ondulada_g", 0, 0, boca_ondulada(0, 0), extra=' opacity="0"'),
                                  node("boca_abierta_g", 0, 0, boca_abierta(0, -14), extra=' opacity="0"'),
                                  node("boca_sonrisa_g", 0, 0, boca_sonrisa(0, 0))])
    sudor = node("sudor_g", 0, 0, [gota_sudor(118, -96)], extra=' opacity="0"')
    signo = node("signo_g", 0, 0, [signo_exclamacion(133, -8)], extra=' opacity="0"')
    return node("cara", *rel(px, py), [signo, sudor, bocas, ojos, pantalla()])

def luces():
    """Dos píldoras de luz sobre la carcasa (estado de ánimo): cian y rojo."""
    out = []
    for color, nombre, op in (("FF5BFDFE", "cian", 1), ("FFFF5A5A", "roja", 0)):
        pil = []
        for lado, (x, y, ang) in {"izq": (349, 315, -17), "der": (716, 327, 11)}.items():
            halo = shape(f"halo_luz_{nombre}_{lado}", 0, 0, rect(46, 14, 7) + f'<Fill name="Halo">{solid(color[:2] + "FFFFFF"[:0] + color[2:])}<Feather strength="12" name="Suave"/></Fill>')
            luz = shape(f"luz_{nombre}_{lado}", 0, 0, rect(44, 12, 6) + fill(solid(color)))
            pil.append(node(f"pos_luz_{nombre}_{lado}", *rel(x, y), [luz, halo], rot=ang * RAD))
        out.append(node(f"luces_{nombre}", 0, 0, pil, extra=f' opacity="{op}"'))
    return node("luces", 0, 0, out)

# ---------------------------------------------------------------- brazos
def brazo_colgando(ax, ay):
    return parte("brazo_colgando", ax, ay)

def variante_der_colgando():
    return node("der_colgando", 0, 0, brazo_colgando(*HOMBRO_DER))

def variante_der_pulgar():
    return node("der_pulgar", 0, 0, parte("pulgar_der", *HOMBRO_DER), extra=' opacity="0"')

def variante_izq_colgando():
    """Brazo izquierdo colgando, el dibujado en la imagen base."""
    return node("izq_colgando", 0, 0, parte("base_izq", *HOMBRO_IZQ))

def variante_izq_dedo():
    return node("izq_dedo", 0, 0, parte("alerta_izq", *HOMBRO_IZQ), extra=' opacity="0"')

def variante_der_alerta():
    return node("der_alerta", 0, 0, parte("alerta_der", *HOMBRO_DER), extra=' opacity="0"')

def dormido_frente():
    """Las dos manos abrazadas al pecho: van delante del cuerpo y de la pantalla."""
    izq = node("dormido_izq", *rel(*HOMBRO_IZQ), parte("dormido_izq", *HOMBRO_IZQ))
    der = node("dormido_der", *rel(*HOMBRO_DER), parte("dormido_der", *HOMBRO_DER))
    return node("dormido_frente", 0, 0, [izq, der], extra=' opacity="0"')

def variante_izq_saludo():
    """El brazo levantado del saludo: manga y mano abierta (la mano gira aparte, desde la muñeca)."""
    muneca = (150.0, 412.0)
    mano = node("mano_saludo", muneca[0] - HOMBRO_IZQ[0], muneca[1] - HOMBRO_IZQ[1], parte("brazo_saludo", *muneca, solo={223, 297}))
    resto = parte("brazo_saludo", *HOMBRO_IZQ, solo={574, 571, 389})
    return node("izq_saludo", 0, 0, [mano] + resto, extra=' opacity="0"')

def variante_izq_pulgar():
    return node("izq_pulgar", 0, 0, parte("pulgar_izq", *HOMBRO_IZQ), extra=' opacity="0"')

def lupa_frente():
    """Brazo que sostiene la lupa (nativo), delante del cuerpo: antebrazo, puño, lupa y el haz de luz.
    Coordenadas relativas al hombro izquierdo."""
    antebrazo = shape("antebrazo_lupa", 0, 0, camino([(0, 10), (-12, 90), (-28, 168)])
                      + f'<Stroke thickness="54" cap="round" join="round" name="Contorno">{solid(LINEA)}</Stroke>'
                      + f'<Stroke thickness="43" cap="round" join="round" name="Brazo">{solid("FF63779B")}</Stroke>')
    mango = shape("mango_lupa", -34, 140, rect(20, 104, 9) + fill(lineal(-10, 0, 10, 0, ["FF9ADCE8", "FF5BBBCE"])) + trazo_linea(5), rot=12 * RAD)
    puno = shape("puno_lupa", -30, 178, rect(60, 50, 22) + fill(lineal(0, -25, 0, 25, ["FF7385A6", "FF566A8E"])) + trazo_linea(5.5), rot=-6 * RAD)
    dedos = [shape(f"dedo_lupa_{i}", -62, 162 + i * 15, rect(36, 15, 7) + fill(solid("FF6F82A3")) + trazo_linea(4)) for i in range(3)]
    aro = shape("aro_lupa", -56, 36, ellipse(188, 160) + fill(lineal(0, -80, 0, 80, ["FFB9F0F7", "FF6FD0E0"])) + trazo_linea(6), rot=-20 * RAD)
    cristal = shape("cristal_lupa", -56, 36, ellipse(146, 118) + fill(lineal(0, -59, 0, 59, ["BBE1FCFF", "88B8F1F8"])) + trazo_linea(4, "FF5BA8BA"), rot=-20 * RAD)
    destello = shape("destello_lupa", -86, 4, ellipse(50, 13) + fill(solid("BBFFFFFF")), rot=-32 * RAD)
    haz = ('<PointsPath isClosed="true" isClockwise="true" name="Trazo">'
           '<StraightVertex x="-108" y="100"/><StraightVertex x="-10" y="100"/><StraightVertex x="74" y="372"/><StraightVertex x="-190" y="372"/></PointsPath>')
    cono = shape("haz_lupa", 0, 0, haz + fill(lineal(0, 100, 0, 372, ["99C9F7FB", "22C9F7FB"])))
    piso = shape("piso_haz", -58, 372, ellipse(262, 42) + fill(solid("44C9F7FB")))
    return node("izq_lupa", 0, 0, [destello, cristal, aro, mango] + dedos + [puno, antebrazo, node("haz", 0, 0, [cono, piso])], extra=' opacity="0"')

def brazo(lado):
    if lado == "der":
        return node("brazo_der", *rel(*HOMBRO_DER), [variante_der_alerta(), variante_der_pulgar(), variante_der_colgando()])
    return node("brazo_izq", *rel(*HOMBRO_IZQ), [variante_izq_dedo(), variante_izq_pulgar(), variante_izq_saludo(), variante_izq_colgando()])

# ---------------------------------------------------------------- árbol (en Rive el primer hermano va ENCIMA)
def pie(lado):
    ax, ay = (440.0, 805.0) if lado == "izq" else (660.0, 819.0)
    return node(f"pie_{lado}", *rel(ax, ay), parte(f"pie_{lado}", ax, ay))

CASCO_ANCLA = (580.0, 280.0)
cinta = node("cinta", 0, 0, parte("cinta", *CASCO_ANCLA, borde=3.5), extra=' opacity="0"')
casco = node("casco", *rel(*CASCO_ANCLA), [barras_casco(), cinta] + parte("casco", *CASCO_ANCLA))
oreja = node("oreja", *rel(825.0, 555.0), parte("oreja", 825.0, 555.0))
carcasa_clave = "carcasa/r343"
carcasa = node("carcasa", *rel(560.0, 590.0), parte("carcasa", 560.0, 590.0))

lupa = node("lupa_frente", *rel(*HOMBRO_IZQ), [lupa_frente()])
cuerpo_resp = node("cuerpo_resp", 0, 0, [lupa, dormido_frente(), zzz(), luces(), casco, cara(), oreja, carcasa, brazo("der"), brazo("izq")])
pose_modo = node("pose_modo", 0, 0, [cuerpo_resp])
kerni = node("kerni", *RAIZ, [pose_modo, pie("izq"), pie("der")])

fondo_id = reg("fondo")
fondo = (f'<Shape x="512" y="512" name="fondo" id="{fondo_id}"><FocusData/>'
         f'<Rectangle width="1024" height="1024" name="Trazo"/>{fill(solid("00FFFFFF"))}</Shape>')

# ---------------------------------------------------------------- datos que manda la app
VM, VMI = "0:40", "0:41"
P_NUM = {"mirar_x": "0:50", "mirar_y": "0:51"}
P_MODO = "0:53"
ENUM = "0:70"
MODOS = ["idle", "sonriente", "asustado", "research", "dormido", "alerta", "neutro", "aburrido"]
MODO_ID = {m: f"0:{71 + i}" for i, m in enumerate(MODOS)}
TRIG = {"saludar": "0:52"}
vm = (f'<ViewModel defaultInstanceId="{VMI}" name="Kerni" id="{VM}">'
      + "".join(f'<ViewModelPropertyNumber name="{k}" id="{v}"/>' for k, v in P_NUM.items())
      + "".join(f'<ViewModelPropertyTrigger name="{k}" id="{v}"/>' for k, v in TRIG.items())
      + f'<ViewModelPropertyEnumCustom enumId="{ENUM}" name="modo" id="{P_MODO}"/>'
      + f'<ViewModelInstance exports="true" name="Default" id="{VMI}">'
      + "".join(f'<ViewModelInstanceNumber propertyValue="0" viewModelPropertyId="{v}"/>' for v in P_NUM.values())
      + "".join(f'<ViewModelInstanceTrigger viewModelPropertyId="{v}"/>' for v in TRIG.values())
      + f'<ViewModelInstanceEnum propertyValue="{MODO_ID[os.environ.get("KERNI_MODO", "idle")]}" viewModelPropertyId="{P_MODO}"/>'
      + "</ViewModelInstance></ViewModel>")
enum = (f'<DataEnumCustom name="Modo" id="{ENUM}">'
        + "".join(f'<DataEnumValue key="{m}" value="{m.capitalize()}" id="{MODO_ID[m]}"/>' for m in MODOS) + "</DataEnumCustom>")
CONV_X, CONV_Y = "0:60", "0:61"
conv = (f'<DataConverterRangeMapper minInput="-100" maxInput="100" minOutput="-18" maxOutput="18" clampLower="true" clampUpper="true" name="mirada x" id="{CONV_X}"/>'
        f'<DataConverterRangeMapper minInput="-100" maxInput="100" minOutput="-12" maxOutput="12" clampLower="true" clampUpper="true" name="mirada y" id="{CONV_Y}"/>')
kerni = kerni.replace(f'name="mirada_app" id="{IDS["mirada_app"]}">',
                      f'name="mirada_app" id="{IDS["mirada_app"]}">'
                      f'<DataBindContext sourcePathIds="{VM}-{P_NUM["mirar_x"]}" propertyKey="13" converterId="{CONV_X}"/>'
                      f'<DataBindContext sourcePathIds="{VM}-{P_NUM["mirar_y"]}" propertyKey="14" converterId="{CONV_Y}"/>')

# ---------------------------------------------------------------- animaciones
X, Y, ROT, SX, SY, OP = 13, 14, 15, 16, 17, 18
def kf(frame, value, ease=(0.42, 0, 0.58, 1)):
    return (f'<KeyFrameDouble value="{f(float(value))}" frame="{frame}" interpolationType="cubic">'
            f'<CubicEaseInterpolator x1="{ease[0]}" y1="{ease[1]}" x2="{ease[2]}" y2="{ease[3]}"/></KeyFrameDouble>')
def kid(fr, v): return f'<KeyFrameId value="{v}" frame="{fr}"/>'

A = {}
def anim(name, dur, tracks, loop="loop"):
    aid = nid(); by_obj = {}
    for (o, p), kfs in tracks.items():
        by_obj.setdefault(o, []).append(f'<KeyedProperty propertyKey="{p}">{"".join(kfs)}</KeyedProperty>')
    body = "".join(f'<KeyedObject objectId="{o}">{"".join(ps)}</KeyedObject>' for o, ps in by_obj.items())
    return aid, f'<LinearAnimation duration="{dur}" loopValue="{loop}" name="{name}" id="{aid}">{body}</LinearAnimation>'

# respirar: 4 s por ciclo; el cuerpo se estira un poco desde los pies
A["respirar"] = anim("respirar", 240, {
    (IDS["cuerpo_resp"], SY): [kf(0, 1), kf(120, 1.022), kf(240, 1)],
    (IDS["cuerpo_resp"], SX): [kf(0, 1), kf(120, 0.992), kf(240, 1)],
    (IDS["cara"], Y): [kf(0, rel(*PANTALLA)[1]), kf(130, rel(*PANTALLA)[1] - 4), kf(240, rel(*PANTALLA)[1])],
})
# parpadeo: cada 5 s, rápido
A["parpadeo"] = anim("parpadeo", 300, {
    (IDS["parpadeo"], SY): [kf(0, 1), kf(280, 1), kf(286, 0.08), kf(293, 1), kf(300, 1)],
})

# ---- modos: cada uno es una pose completa (todas las propiedades que algún modo toca),
# así el cruce entre modos (duration en la transición) mezcla bien y vuelve a los valores base.
def opac(nombre, valor): return {(IDS[nombre], OP): [kf(0, valor)]}
DEF = {  # valor base de cada propiedad de modo
    (IDS["pose_modo"], ROT): 0.0, (IDS["pose_modo"], X): 0.0, (IDS["pose_modo"], Y): 0.0,
    (IDS["pose_modo"], SX): 1.0, (IDS["pose_modo"], SY): 1.0,
    (IDS["ojos_redondos"], OP): 1.0, (IDS["ojos_felices"], OP): 0.0,
    (IDS["ojos_redondos"], SX): 1.0, (IDS["ojos_redondos"], SY): 1.0,
    (IDS["mirada_modo"], X): 0.0, (IDS["mirada_modo"], Y): 0.0,
    (IDS["boca_sonrisa_g"], OP): 1.0, (IDS["boca_abierta_g"], OP): 0.0, (IDS["boca_triste_g"], OP): 0.0, (IDS["boca_ondulada_g"], OP): 0.0,
    (IDS["sudor_g"], OP): 0.0,
    (IDS["luces_cian"], OP): 1.0, (IDS["luces_roja"], OP): 0.0,
    (IDS["izq_colgando"], OP): 1.0, (IDS["izq_pulgar"], OP): 0.0, (IDS["izq_lupa"], OP): 0.0,
    (IDS["der_colgando"], OP): 1.0, (IDS["der_pulgar"], OP): 0.0,
    (IDS["brazo_izq"], ROT): 0.0, (IDS["brazo_der"], ROT): 0.0,
    (IDS["cinta"], OP): 0.0,
    (IDS["ojos_dormido"], OP): 0.0, (IDS["boca_dormido_g"], OP): 0.0, (IDS["dormido_frente"], OP): 0.0, (IDS["zzz_g"], OP): 0.0,
    (IDS["ojos_alerta"], OP): 0.0, (IDS["cejas_alerta"], OP): 0.0, (IDS["signo_g"], OP): 0.0, (IDS["boca_alerta_g"], OP): 0.0,
    (IDS["izq_dedo"], OP): 0.0, (IDS["der_alerta"], OP): 0.0,
    (IDS["ojos_neutro"], OP): 0.0, (IDS["boca_neutro_g"], OP): 0.0,
    (IDS["ojos_aburrido"], OP): 0.0, (IDS["boca_aburrida_g"], OP): 0.0, (IDS["barras_cap"], OP): 0.0,
}
def modo_anim(nombre, dur, cambios, loop="loop"):
    pistas = {}
    for key, v0 in DEF.items():
        v = cambios.get(key, v0)
        pistas[key] = v if isinstance(v, list) else [kf(0, v)]
    return anim(nombre, dur, pistas, loop)

def ciclo(vals, dur, cierre=True):
    """Keyframes uniformes a lo largo de `dur` cuadros con los valores dados (y vuelve al primero)."""
    n = len(vals) - (0 if cierre is False else 0)
    pasos = len(vals)
    kfs = [kf(round(i * dur / pasos), v) for i, v in enumerate(vals)]
    kfs.append(kf(dur, vals[0]))
    return kfs

A["m_idle"] = modo_anim("idle", 60, {})
A["m_sonriente"] = modo_anim("sonriente", 72, {
    (IDS["ojos_redondos"], OP): 0.0, (IDS["ojos_felices"], OP): 1.0,
    (IDS["boca_sonrisa_g"], OP): 0.0, (IDS["boca_abierta_g"], OP): 1.0,
    (IDS["izq_colgando"], OP): 0.0, (IDS["izq_pulgar"], OP): 1.0,
    (IDS["der_colgando"], OP): 0.0, (IDS["der_pulgar"], OP): 1.0,
    (IDS["cinta"], OP): 1.0,
    (IDS["pose_modo"], Y): ciclo([0, -9, 0, -5], 72),
    (IDS["pose_modo"], ROT): ciclo([0, 1.5 * RAD, 0, -1.5 * RAD], 72),
})
A["m_asustado"] = modo_anim("asustado", 14, {
    (IDS["ojos_redondos"], SX): 1.28, (IDS["ojos_redondos"], SY): 1.22,
    (IDS["boca_sonrisa_g"], OP): 0.0, (IDS["boca_ondulada_g"], OP): 1.0, (IDS["sudor_g"], OP): 1.0,
    (IDS["luces_cian"], OP): 0.0, (IDS["luces_roja"], OP): 1.0,
    (IDS["pose_modo"], SX): 1.04, (IDS["pose_modo"], SY): 0.93,
    (IDS["pose_modo"], X): ciclo([0, 4, -4, 3, -3], 14),
    (IDS["brazo_izq"], ROT): ciclo([14 * RAD, 11 * RAD, 14 * RAD, 12 * RAD], 14), (IDS["brazo_der"], ROT): ciclo([-14 * RAD, -11 * RAD, -14 * RAD, -12 * RAD], 14),
})
A["m_research"] = modo_anim("research", 120, {
    (IDS["boca_sonrisa_g"], OP): 0.0, (IDS["boca_triste_g"], OP): 1.0,
    (IDS["izq_colgando"], OP): 0.0, (IDS["izq_lupa"], OP): 1.0,
    (IDS["mirada_modo"], X): ciclo([-16, -10, -16, -22], 120), (IDS["mirada_modo"], Y): 8.0,
    (IDS["pose_modo"], ROT): -6 * RAD, (IDS["pose_modo"], X): -10.0,
})

# ---- caras por carga de la PC: neutro (30-69 %) y aburrido (< 30 %). El idle es la cara de >= 70 %.
A["m_neutro"] = modo_anim("neutro", 240, {
    (IDS["ojos_redondos"], OP): 0.0, (IDS["ojos_neutro"], OP): 1.0,
    (IDS["boca_sonrisa_g"], OP): 0.0, (IDS["boca_neutro_g"], OP): 1.0,
})
A["m_aburrido"] = modo_anim("aburrido", 300, {
    (IDS["ojos_redondos"], OP): 0.0, (IDS["ojos_aburrido"], OP): 1.0,
    (IDS["boca_sonrisa_g"], OP): 0.0, (IDS["boca_aburrida_g"], OP): 1.0,
    (IDS["barras_cap"], OP): ciclo([1.0, 0.65], 300),   # las barras "respiran" despacio
    (IDS["luces_cian"], OP): 0.5,
    (IDS["pose_modo"], Y): ciclo([3, 6], 300),           # un poco caído
})

A["m_dormido"] = modo_anim("dormido", 240, {
    (IDS["ojos_redondos"], OP): 0.0, (IDS["ojos_dormido"], OP): 1.0,
    (IDS["boca_sonrisa_g"], OP): 0.0, (IDS["boca_dormido_g"], OP): 1.0,
    (IDS["izq_colgando"], OP): 0.0, (IDS["der_colgando"], OP): 0.0, (IDS["dormido_frente"], OP): 1.0,
    (IDS["zzz_g"], OP): 1.0, (IDS["cinta"], OP): 0.55, (IDS["luces_cian"], OP): 0.35,
    (IDS["pose_modo"], ROT): ciclo([2.5 * RAD, 3.2 * RAD], 240), (IDS["pose_modo"], Y): ciclo([6, 10], 240),
})
A["m_alerta"] = modo_anim("alerta", 60, {
    (IDS["ojos_redondos"], OP): 0.0, (IDS["ojos_alerta"], OP): 1.0, (IDS["cejas_alerta"], OP): 1.0,
    (IDS["boca_sonrisa_g"], OP): 0.0, (IDS["boca_alerta_g"], OP): 1.0,
    (IDS["signo_g"], OP): ciclo([1.0, 0.45], 60),
    (IDS["izq_colgando"], OP): 0.0, (IDS["izq_dedo"], OP): 1.0, (IDS["der_colgando"], OP): 0.0, (IDS["der_alerta"], OP): 1.0,
    (IDS["cinta"], OP): 1.0,
    (IDS["brazo_izq"], ROT): ciclo([0, -3 * RAD, 0, 2 * RAD], 60),
    (IDS["pose_modo"], ROT): 1.5 * RAD,
})

# ---- zZ: flotan en bucle siempre; el modo `dormido` decide si se ven
A["zzz"] = anim("zzz", 180, {
    (IDS["zzz_flota"], Y): [kf(0, 0), kf(90, -9), kf(180, 0)],
    (IDS["zeta1"], OP): [kf(0, 0.5), kf(60, 1), kf(180, 0.5)],
    (IDS["zeta2"], OP): [kf(0, 1), kf(60, 0.4), kf(180, 1)],
    (IDS["zeta3"], OP): [kf(0, 0.7), kf(110, 1), kf(180, 0.7)],
})

# ---- saludo: 2.4 s, un solo disparo. Cruza al brazo levantado y lo agita desde la muñeca.
D = 144
SUAVE = (0.45, 0, 0.55, 1)
def k(fr, v, e=SUAVE): return kf(fr, v, e)
A["reposo"] = anim("reposo", 1, {}, loop="oneShot")
# El saludo toma el control de TODAS las propiedades de modo (caras, bocas, brazos, luces...) con sus
# valores base y solo cambia las del saludo. Si no, lo que dejó el modo (por ejemplo los ojos
# entrecerrados del `aburrido` o los pulgares del `sonriente`) se dibuja encima de la cara del saludo.
A["saludo"] = anim("saludo", D, {
    **{clave: [kf(0, valor)] for clave, valor in DEF.items()},
    (IDS["izq_colgando"], OP): [k(0, 1), k(10, 0), k(130, 0), k(D, 1)],
    (IDS["izq_saludo"], OP): [k(0, 0), k(10, 1), k(130, 1), k(D, 0)],
    (IDS["mano_saludo"], ROT): [k(0, 0), k(24, 0), k(36, 18 * RAD), k(50, -16 * RAD), k(64, 15 * RAD), k(78, -13 * RAD), k(92, 10 * RAD), k(106, -6 * RAD), k(120, 0), k(D, 0)],
    (IDS["brazo_izq"], ROT): [k(0, 0), k(30, -3 * RAD), k(60, 2 * RAD), k(90, -2 * RAD), k(120, 0), k(D, 0)],
    (IDS["ojos_redondos"], OP): [k(0, 1), k(14, 0), k(126, 0), k(D, 1)],
    (IDS["ojos_felices"], OP): [k(0, 0), k(14, 1), k(126, 1), k(D, 0)],
    (IDS["boca_sonrisa_g"], OP): [k(0, 1), k(14, 0), k(126, 0), k(D, 1)],
    (IDS["boca_abierta_g"], OP): [k(0, 0), k(14, 1), k(126, 1), k(D, 0)],
}, loop="oneShot")

# ---------------------------------------------------------------- máquina de estados
def cond_modo(m):
    return (f'<TransitionViewModelCondition><TransitionPropertyViewModelComparator><BindablePropertyEnum>'
            f'<DataBindContext sourcePathIds="{VM}-{P_MODO}" propertyKey="637"/></BindablePropertyEnum>'
            f'</TransitionPropertyViewModelComparator><TransitionValueEnumComparator value="{MODO_ID[m]}"/></TransitionViewModelCondition>')
def cond_trigger(t):
    return (f'<TransitionViewModelCondition><TransitionPropertyViewModelComparator><BindablePropertyTrigger>'
            f'<DataBindContext sourcePathIds="{VM}-{TRIG[t]}" propertyKey="686"/></BindablePropertyTrigger>'
            f'</TransitionPropertyViewModelComparator><TransitionValueTriggerComparator/></TransitionViewModelCondition>')
def dispara(t):
    return (f'<ListenerViewModelChange><BindablePropertyTrigger propertyValue="1"><DataBindContext sourcePathIds="{VM}-{TRIG[t]}" propertyKey="686" direction="true"/>'
            f'</BindablePropertyTrigger></ListenerViewModelChange>')

def capa_modos():
    est = {m: nid() for m in MODOS}
    # 200 ms: el cruce mezcla las dos caras, y a mitad de camino se ven las dos a medias; mejor corto.
    any_ = "".join(f'<StateTransition stateToId="{est[m]}" duration="200">{cond_modo(m)}</StateTransition>' for m in MODOS)
    estados = "".join(f'<AnimationState x="{200 + 220 * i}" y="0" animationId="{A["m_" + m][0]}" id="{est[m]}"/>' for i, m in enumerate(MODOS))
    return (f'<StateMachineLayer name="Modo" id="{nid()}"><AnyState x="0" y="-150">{any_}</AnyState><ExitState x="900" y="-150"/>'
            f'<EntryState x="0" y="0"><StateTransition stateToId="{est["idle"]}"/></EntryState>{estados}</StateMachineLayer>')

def capa(nombre, aid, foco=False):
    s = nid()
    foco_xml = f'<FocusActionTarget targetId="{fondo_id}"/>' if foco else ""
    return (f'<StateMachineLayer name="{nombre}" id="{nid()}"><AnyState x="0" y="-150"/><ExitState x="400" y="-150"/>'
            f'<EntryState x="0" y="0"><StateTransition stateToId="{s}"/></EntryState>'
            f'<AnimationState x="200" y="0" animationId="{aid}" id="{s}">{foco_xml}</AnimationState></StateMachineLayer>')

def capa_saludo():
    s_rep, s_sal = nid(), nid()
    return (f'<StateMachineLayer name="Saludo" id="{nid()}">'
            f'<AnyState x="0" y="-150" id="{nid()}"><StateTransition stateToId="{s_sal}" duration="150">{cond_trigger("saludar")}</StateTransition></AnyState>'
            f'<ExitState x="600" y="-150" id="{nid()}"/><EntryState x="0" y="0" id="{nid()}"><StateTransition stateToId="{s_rep}"/></EntryState>'
            f'<AnimationState x="200" y="0" animationId="{A["reposo"][0]}" id="{s_rep}"><FocusActionTarget targetId="{fondo_id}"/></AnimationState>'
            f'<AnimationState x="400" y="0" animationId="{A["saludo"][0]}" id="{s_sal}">'
            f'<StateTransition stateToId="{s_rep}" duration="200" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100"/></AnimationState>'
            f'</StateMachineLayer>')

sm = ('<StateMachine name="kerni" id="0:7">'
      f'<StateMachineListenerSingle targetId="{IDS["carcasa"]}" listenerTypeValue="click" name="clic saluda" id="{nid()}">{dispara("saludar")}</StateMachineListenerSingle>'
      f'<StateMachineListener targetId="{fondo_id}" name="tecla 1 saluda" id="{nid()}"><ListenerInputTypeKeyboard listenerTypeValue="keyboard"><KeyboardInput keyType="key1" keyPhase="1"/></ListenerInputTypeKeyboard>{dispara("saludar")}</StateMachineListener>'
      + capa("Respirar", A["respirar"][0]) + capa("Parpadeo", A["parpadeo"][0]) + capa("Zzz", A["zzz"][0]) + capa_modos() + capa_saludo() + "</StateMachine>")

rml = (f'<Rive version="1" kind="fragment">\n'
       f'<Artboard defaultStateMachineId="0:7" viewModelId="{VM}" viewModelInstanceId="{VMI}" styleId="0:5" width="1024" height="1024" name="Kerni" id="0:2">\n'
       f'<LayoutComponentStyle name="Artboard Style" id="0:5"/>\n'
       + kerni + "\n" + fondo + "\n" + sm + "\n" + "\n".join(a[1] for a in A.values())
       + "\n</Artboard>\n" + enum + "\n" + conv + "\n" + vm + "\n</Rive>\n")
(AQUI / "scene.rml").write_text(rml, encoding="utf-8")
print("scene.rml:", len(rml), "caracteres")
