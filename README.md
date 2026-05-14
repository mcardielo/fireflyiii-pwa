# Firefly Ledger PWA

Aplicación Web Progresiva para el registro de transacciones en Firefly III, con soporte offline y multi-moneda.

## Características

- **Registro de transacciones** — Soporta los tres tipos de transacciones de Firefly III: retiros (withdrawal), depósitos (deposit) y transferencias (transfer).
- **Offline primero** — Las transacciones se almacenan localmente y se sincronizan automáticamente al recuperar la conexión. Utiliza Background Sync cuando el navegador lo soporta.
- **Selección contextual de cuentas** — Autocompletado inteligente que filtra cuentas según el tipo de transacción: Asset para retiros y transferencias, Revenue para depósitos, Expense para retiros.
- **Multi-moneda** — Conversión automática de divisas usando la API de Frankfurter. En transferencias entre cuentas con distinta moneda, calcula automáticamente el monto en la moneda de destino.
- **Cuenta origen por defecto** — Configuración inicial de una cuenta Asset predeterminada que se usa automáticamente en el campo correspondiente según el tipo de transacción.
- **Health check** — Monitoreo periódico de disponibilidad del servidor Firefly III. Reintenta la sincronización automáticamente cuando el servidor se recupera.

## Requisitos

- Instancia de Firefly III con acceso a la API REST.
- Token de Acceso Personal (PAT) generado desde el perfil de usuario en Firefly III.

## Instalación

1. Clona el repositorio o descarga los archivos.
2. Sirve el directorio raíz con cualquier servidor web estático:

```bash
npx http-server -o
```

O desde VS Code, abre el proyecto y usa "Open with Live Server".

3. Abre la URL en tu navegador. La primera vez solicitará la URL de tu instancia de Firefly III y el PAT.
4. Selecciona la cuenta Asset que se usará por defecto.

## Uso

1. Selecciona el tipo de transacción: Retiro, Depósito o Transferencia.
2. Completa los campos de cuenta. El autocompletado filtra las cuentas disponibles según el tipo seleccionado.
3. Si el tipo de cuenta lo permite, puedes escribir un nombre nuevo para crear una cuenta sobre la marcha (no aplica para cuentas tipo Asset).
4. Ingresa el concepto y el monto. Si seleccionas una moneda distinta a la predeterminada, el sistema muestra la conversión en tiempo real.
5. Envía la transacción. Si no hay conexión o el servidor no responde, la transacción se encola y se sincroniza automáticamente cuando sea posible.

## Licencia

MIT
