-- Conversaciones persistentes del Asistente de datos (lib/agente). El servidor reconstruye el contexto desde acá
-- (resumen + últimos mensajes) en vez de que el navegador reenvíe todo el historial en cada pregunta.
-- Aplicada en producción el 1-oct-2026 (más agente_lector_solo_lectura y agente_log_tokens_cacheados).
create table agente_conversaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  titulo text,
  resumen text,
  mensajes_resumidos integer not null default 0,
  tokens_entrada bigint not null default 0,
  tokens_salida bigint not null default 0,
  archivada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agente_conversaciones_usuario_idx on agente_conversaciones (usuario_id, archivada, updated_at desc);

create table agente_mensajes (
  id bigint generated always as identity primary key,
  conversacion_id uuid not null references agente_conversaciones(id) on delete cascade,
  rol text not null check (rol in ('usuario','agente')),
  texto text not null,
  herramientas text[] not null default '{}',
  error boolean not null default false,
  created_at timestamptz not null default now()
);
create index agente_mensajes_conv_idx on agente_mensajes (conversacion_id, id);

-- Memoria de largo plazo: lo que el agente aprende y vale para futuras conversaciones (de cualquier usuario si es
-- global, sólo del usuario si es personal). Lo que propone el propio agente queda 'pendiente' hasta que un admin lo
-- aprueba: los datos de la base (notas, nombres) son texto escrito por terceros y no deben poder "enseñarle" reglas solos.
create table agente_memoria (
  id bigint generated always as identity primary key,
  ambito text not null check (ambito in ('global','usuario')),
  usuario_id uuid,
  tipo text not null check (tipo in ('regla','alias','esquema','preferencia','dato')),
  contenido text not null check (char_length(contenido) between 5 and 500),
  estado text not null default 'pendiente' check (estado in ('pendiente','activa','rechazada')),
  fuente text not null check (fuente in ('admin','agente','semilla')),
  propuesta_por uuid,
  veces_usada integer not null default 0,
  ultimo_uso timestamptz,
  created_at timestamptz not null default now(),
  busqueda tsvector generated always as (to_tsvector('spanish', contenido)) stored,
  constraint agente_memoria_ambito_chk check ((ambito = 'usuario') = (usuario_id is not null))
);
create index agente_memoria_busqueda_idx on agente_memoria using gin (busqueda);
create index agente_memoria_estado_idx on agente_memoria (estado, ambito);

-- Sin policies a propósito: sólo el servidor (service-role) las lee y escribe.
alter table agente_conversaciones enable row level security;
alter table agente_mensajes enable row level security;
alter table agente_memoria enable row level security;

-- Uso de tokens por pregunta, para medir y optimizar.
alter table agente_consultas_log
  add column conversacion_id uuid,
  add column tokens_entrada integer,
  add column tokens_salida integer,
  add column modelo text,
  add column rondas integer;

comment on table agente_conversaciones is 'Conversaciones del Asistente de datos. `resumen` condensa los mensajes viejos (hasta `mensajes_resumidos`) para no reenviarlos al modelo en cada turno.';
comment on table agente_memoria is 'Memoria de largo plazo del Asistente de datos. estado=pendiente: propuesta del agente esperando aprobación de un admin; sólo las activas entran al contexto.';

-- Conocimiento inicial (semilla): lo que ya sabemos y evita que cada conversación parta de cero.
-- Las "regla" se inyectan SIEMPRE (son pocas); las demás sólo si coinciden con la pregunta.
insert into agente_memoria (ambito, tipo, contenido, estado, fuente) values
 ('global','regla','Ventas reales en SQL (criterio de Administración/Finanzas): "not _excluir_cliente_finanzas(nombre_fantasia) and not _excluir_producto(producto)". Quita mermas, muestras, tours, degustaciones y cuentas internas (Cliente Feria/Marketing/Calidad/Ventas) pero INCLUYE Cliente PDV y BaseCamp. El criterio de Comercial (_excluir_cliente) también quita PDV y da otra cifra: avisar cuál se usó.','activa','semilla'),
 ('global','esquema','Tabla ventas (~150 mil filas): una fila por línea de producto de cada pedido. total_sin_impuesto es el NETO en CLP; litros en L; fecha_pedido es la fecha del pedido (fecha_entrega puede ser nula). Siempre filtrar por rango de fecha_pedido y agregar en SQL (sum, count distinct pedido).','activa','semilla'),
 ('global','esquema','Tabla deudores: foto ACTUAL de la deuda por cliente (se reemplaza en cada sync del ERP). deuda_vencida y los tramos deuda_* están en CLP. Para evolución en el tiempo usar deudores_historial (foto diaria desde que existe).','activa','semilla'),
 ('global','esquema','clientes.dias_pago es el plazo de pago PACTADO en la ficha; dias_pago_real_mediana es lo que de verdad se demora (medido). cobros_erp tiene los pagos reales (fecha, cliente, monto, metodo, guia, factura).','activa','semilla'),
 ('global','alias','El mismo cliente puede escribirse distinto según la tabla: ej. "Café Black Mamba" en la ficha de clientes aparece como "Mamba" en ventas. Buscar con ilike por una parte corta del nombre.','activa','semilla'),
 ('global','regla','En deudores, vendedor = "Incobrable" significa deuda marcada incobrable. Los vendedores aparecen a veces como correo (ej. nicol.delgado@...) y a veces como nombre; filtrar con ilike por el apellido.','activa','semilla'),
 ('global','regla','SQL, columnas de ventas: fecha_pedido, fecha_entrega, nombre_fantasia (cliente), vendedor_actual, categoria_producto, categoria_negocio, producto, envase, litros, total_sin_impuesto (neto CLP), pedido (n° pedido), tipo_venta, localidad, provincia, numero_factura, entregado. Cerveza = categoria_producto ilike ''%cerveza%''; kombucha = ilike ''%kombucha%''. Localidad, vendedor y producto se agrupan directo en ventas.','activa','semilla'),
 ('global','esquema','SQL, columnas de clientes: nombre_fantasia, razon_social, vendedor, localidad, provincia, categoria, tipo, giro, condicion_venta, dias_pago, limite_cta_cte, dias_pago_real_mediana, dias_pago_real_muestras, created_at. Se une con ventas por nombre_fantasia (a veces escrito distinto: unir con ilike o por parte del nombre).','activa','semilla'),
 ('global','esquema','SQL, columnas de deudores: nombre_fantasia, vendedor, saldo_total, deuda_vencida, deuda_menor_14_dias, deuda_entre_15_29_dias, deuda_entre_30_44_dias, deuda_entre_45_59_dias, deuda_entre_60_89_dias, deuda_mas_90_dias, ultimo_pago, fecha_ultima_compra, categoria_cliente, limite_cta_cte, dias_pago. cobros_erp: fecha, cliente, monto, metodo, guia, factura, fecha_guia, dias_pago. client_scores es una vista con frecuencia y ciclo de compra por cliente.','activa','semilla');

-- Tokens de entrada que Gemini reutilizó de su caché implícita (mide el ahorro del prefijo estable).
alter table agente_consultas_log add column tokens_cacheados integer;
