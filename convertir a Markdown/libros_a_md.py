#!/usr/bin/env python3
"""
libros_a_md.py — Convierte libros en PDF / Word (.docx) a Markdown (.md)
para que un chatbot (RAG, LM Studio, Ollama, Open WebUI, etc.) los pueda leer.

Uso:
    python libros_a_md.py libro.pdf
    python libros_a_md.py carpeta_con_libros -o salida
    python libros_a_md.py libro.pdf --dividir capitulos
    python libros_a_md.py libro.docx --dividir tamano --max-chars 4000

Dependencias (instala solo lo que necesites):
    pip install pymupdf4llm        # PDF (recomendado, conserva títulos y tablas)
    pip install pypdf              # PDF (alternativa simple)
    pip install mammoth markdownify  # Word .docx
    # Opcional: pandoc instalado en el sistema (se usa como alternativa para .docx)
    # Opcional OCR para PDF escaneados: pip install ocrmypdf  (y tesseract instalado)
"""

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

EXTENSIONES = {".pdf", ".docx"}


# --------------------------------------------------------------------------
# Conversión PDF
# --------------------------------------------------------------------------
def pdf_a_md(ruta: Path) -> str:
    # 1) pymupdf4llm: mejor opción, detecta títulos, listas y tablas
    try:
        import pymupdf4llm

        return pymupdf4llm.to_markdown(str(ruta))
    except ImportError:
        pass
    except Exception as e:
        print(f"  [aviso] pymupdf4llm falló ({e}), probando pypdf...")

    # 2) pypdf: solo texto plano
    try:
        from pypdf import PdfReader

        lector = PdfReader(str(ruta))
        paginas = []
        for i, pagina in enumerate(lector.pages, 1):
            texto = pagina.extract_text() or ""
            paginas.append(texto)
        return "\n\n".join(paginas)
    except ImportError:
        sys.exit("Falta una librería para PDF. Instala: pip install pymupdf4llm")


# --------------------------------------------------------------------------
# Conversión Word
# --------------------------------------------------------------------------
def docx_a_md(ruta: Path) -> str:
    # 1) pandoc (si está instalado): muy buena calidad
    if shutil.which("pandoc"):
        try:
            res = subprocess.run(
                ["pandoc", str(ruta), "-t", "gfm", "--wrap=none"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                check=True,
            )
            return res.stdout
        except Exception as e:
            print(f"  [aviso] pandoc falló ({e}), probando mammoth...")

    # 2) mammoth + markdownify
    try:
        import mammoth
        from markdownify import markdownify

        with open(ruta, "rb") as f:
            html = mammoth.convert_to_html(f).value
        return markdownify(html, heading_style="ATX")
    except ImportError:
        pass

    # 3) python-docx: texto básico con títulos
    try:
        from docx import Document

        doc = Document(str(ruta))
        lineas = []
        for p in doc.paragraphs:
            estilo = (p.style.name or "").lower()
            texto = p.text.strip()
            if not texto:
                lineas.append("")
            elif estilo.startswith("heading") or estilo.startswith("título"):
                m = re.search(r"(\d)", estilo)
                nivel = int(m.group(1)) if m else 1
                lineas.append("#" * min(nivel, 6) + " " + texto)
            else:
                lineas.append(texto)
        return "\n\n".join(lineas)
    except ImportError:
        sys.exit(
            "Falta una librería para Word. Instala: pip install mammoth markdownify"
        )


# --------------------------------------------------------------------------
# Limpieza del texto
# --------------------------------------------------------------------------
def limpiar(md: str) -> str:
    md = md.replace("\r\n", "\n").replace("\r", "\n")
    md = md.replace("\u00ad", "")  # guion blando invisible
    md = md.replace("\u00a0", " ")  # espacio duro

    # Une palabras partidas por guion al final de línea: "informa-\nción" -> "información"
    md = re.sub(r"(\w)-\n(\w)", r"\1\2", md)

    # Quita espacios al final de las líneas
    md = re.sub(r"[ \t]+\n", "\n", md)

    # Quita números de página sueltos (líneas con solo un número)
    md = re.sub(r"^[ \t]*\d{1,4}[ \t]*$", "", md, flags=re.MULTILINE)

    # Máximo una línea en blanco seguida
    md = re.sub(r"\n{3,}", "\n\n", md)

    return md.strip() + "\n"


# --------------------------------------------------------------------------
# División en partes (útil para libros largos)
# --------------------------------------------------------------------------
def dividir_por_capitulos(md: str, nivel: int = 1):
    """Divide en un archivo por cada título de nivel `nivel` (# o ##)."""
    patron = re.compile(rf"^({'#' * nivel})\s+(.+)$", re.MULTILINE)
    coincidencias = list(patron.finditer(md))
    if not coincidencias:
        return None  # no hay títulos, no se puede dividir así

    partes = []
    inicio_previo = md[: coincidencias[0].start()].strip()
    if inicio_previo:
        partes.append(("introduccion", inicio_previo))
    for i, m in enumerate(coincidencias):
        fin = coincidencias[i + 1].start() if i + 1 < len(coincidencias) else len(md)
        titulo = m.group(2).strip()
        partes.append((titulo, md[m.start():fin].strip()))
    return partes


def dividir_por_tamano(md: str, max_chars: int):
    """Divide en bloques de ~max_chars cortando en límites de párrafo."""
    parrafos = md.split("\n\n")
    partes, actual = [], ""
    for p in parrafos:
        if actual and len(actual) + len(p) + 2 > max_chars:
            partes.append(actual.strip())
            actual = ""
        actual += p + "\n\n"
    if actual.strip():
        partes.append(actual.strip())
    return [(f"parte {i}", t) for i, t in enumerate(partes, 1)]


def nombre_seguro(texto: str, maximo: int = 60) -> str:
    texto = re.sub(r"[^\w\s-]", "", texto, flags=re.UNICODE).strip()
    texto = re.sub(r"\s+", "_", texto)
    return (texto[:maximo] or "sin_titulo").lower()


# --------------------------------------------------------------------------
# Programa principal
# --------------------------------------------------------------------------
def convertir(ruta: Path, salida: Path, modo: str, max_chars: int, nivel: int):
    print(f"→ {ruta.name}")
    ext = ruta.suffix.lower()
    bruto = pdf_a_md(ruta) if ext == ".pdf" else docx_a_md(ruta)
    md = limpiar(bruto)

    if len(md.strip()) < 200 and ext == ".pdf":
        print(
            "  [aviso] Casi no se extrajo texto: el PDF probablemente es un escaneo.\n"
            "          Hazle OCR primero:  ocrmypdf entrada.pdf salida.pdf"
        )

    base = nombre_seguro(ruta.stem, 80)
    frontmatter = f'---\nfuente: "{ruta.name}"\n---\n\n'

    salida.mkdir(parents=True, exist_ok=True)

    partes = None
    if modo == "capitulos":
        partes = dividir_por_capitulos(md, nivel)
        if partes is None:
            print("  [aviso] No encontré títulos; divido por tamaño.")
            partes = dividir_por_tamano(md, max_chars)
    elif modo == "tamano":
        partes = dividir_por_tamano(md, max_chars)

    if partes is None:
        destino = salida / f"{base}.md"
        destino.write_text(frontmatter + md, encoding="utf-8")
        print(f"  ✓ {destino}  ({len(md):,} caracteres)")
        return

    carpeta = salida / base
    carpeta.mkdir(parents=True, exist_ok=True)
    for i, (titulo, texto) in enumerate(partes, 1):
        fm = (
            f'---\nfuente: "{ruta.name}"\nparte: {i}\ntitulo: "{titulo}"\n---\n\n'
        )
        destino = carpeta / f"{i:03d}_{nombre_seguro(titulo)}.md"
        destino.write_text(fm + texto + "\n", encoding="utf-8")
    print(f"  ✓ {len(partes)} archivos en {carpeta}")


def main():
    ap = argparse.ArgumentParser(
        description="Convierte libros PDF/Word a Markdown para chatbots."
    )
    ap.add_argument("entrada", help="Archivo .pdf/.docx o carpeta con libros")
    ap.add_argument("-o", "--salida", default="libros_md", help="Carpeta de salida")
    ap.add_argument(
        "--dividir",
        choices=["no", "capitulos", "tamano"],
        default="no",
        help="Dividir el libro en varios .md (útil para libros muy largos)",
    )
    ap.add_argument(
        "--max-chars",
        type=int,
        default=4000,
        help="Tamaño aproximado por parte si --dividir tamano (default 4000)",
    )
    ap.add_argument(
        "--nivel",
        type=int,
        default=1,
        help="Nivel de título para dividir por capítulos: 1 = #, 2 = ## (default 1)",
    )
    args = ap.parse_args()

    entrada = Path(args.entrada)
    salida = Path(args.salida)

    if entrada.is_dir():
        archivos = sorted(
            p for p in entrada.rglob("*") if p.suffix.lower() in EXTENSIONES
        )
    elif entrada.suffix.lower() in EXTENSIONES:
        archivos = [entrada]
    else:
        sys.exit("La entrada debe ser un .pdf, un .docx o una carpeta.")

    if not archivos:
        sys.exit("No encontré archivos .pdf ni .docx.")

    for archivo in archivos:
        try:
            convertir(archivo, salida, args.dividir, args.max_chars, args.nivel)
        except Exception as e:
            print(f"  ✗ Error con {archivo.name}: {e}")

    print("\nListo.")


if __name__ == "__main__":
    main()
