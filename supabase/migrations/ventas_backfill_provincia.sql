-- El informe del ERP deja `provincia` vacia en muchas filas. Como el scope
-- regional (p_provincias en las RPC del dashboard) filtra por provincia, un
-- usuario con `region` asignada NO VE esas ventas. Caso real detectado en la
-- auditoria del 27-jul: Marcelo Diaz (region La Araucania) tenia sus 390 L del
-- periodo con provincia NULL => veia CERO de sus propias ventas. Yadro veia
-- solo ~25% de las suyas.
--
-- Se rellena desde el maestro `clientes`, que si tiene la provincia. Solo
-- toca filas donde ventas.provincia IS NULL (no pisa datos buenos del ERP).
UPDATE ventas v
SET provincia = c.provincia
FROM clientes c
WHERE c.nombre_fantasia = v.nombre_fantasia
  AND v.provincia IS NULL
  AND c.provincia IS NOT NULL;

UPDATE ventas v
SET localidad = c.localidad
FROM clientes c
WHERE c.nombre_fantasia = v.nombre_fantasia
  AND v.localidad IS NULL
  AND c.localidad IS NOT NULL;

-- Evita que se repita: si el ERP no trae provincia/localidad, se toma del
-- maestro `clientes` al insertar/actualizar. Va como trigger (no en el
-- endpoint de carga) para cubrir TODAS las vias de ingesta.
CREATE OR REPLACE FUNCTION public._ventas_completar_geo()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.provincia IS NULL OR NEW.localidad IS NULL THEN
    SELECT COALESCE(NEW.provincia, c.provincia), COALESCE(NEW.localidad, c.localidad)
      INTO NEW.provincia, NEW.localidad
    FROM clientes c
    WHERE c.nombre_fantasia = NEW.nombre_fantasia
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ventas_completar_geo ON ventas;
CREATE TRIGGER trg_ventas_completar_geo
  BEFORE INSERT OR UPDATE OF nombre_fantasia, provincia, localidad ON ventas
  FOR EACH ROW EXECUTE FUNCTION public._ventas_completar_geo();
