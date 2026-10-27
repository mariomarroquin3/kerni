python -m pip install pymupdf4llm pypdf mammoth markdownify #librerias para ejecutar el script

python -c "import pymupdf4llm; print('OK')"        #para comprobar si la libreria pymupdf4llm se instalo correctamente ya que puede presentar errores de versiones si da error porfavor usar el siguiente comando:

(python -m pip uninstall -y pymupdf4llm pymupdf
python -m pip install "pymupdf4llm<2") 

python libros_a_md.py .              #comando par ejecutar el script 