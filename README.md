# Firefly Ledger PWA
## Aplicación Web Progresiva para Registro de Transacciones Offline

Una herramienta web progresiva (PWA) diseñada para resolver la dependencia de conexión a internet al registrar transacciones financieras en Firefly III. Ofrece una experiencia de usuario fluida y robusta, garantizando que los datos se capturen y se sincronicen automáticamente en el momento adecuado.

## 🎯 Objetivo del Proyecto

El objetivo principal es eliminar la fricción del usuario causada por la inestabilidad de la conexión a internet. Al implementar un sistema de cola de sincronización y la persistencia local, la aplicación garantiza que cada transacción quede guardada en el dispositivo, sin importar el estado de la red.

## ✨ Características Clave

*   **Offline:** Permite registrar, editar y gestionar todas las transacciones en modo sin conexión, utilizando la caché local del navegador.
*   **Sincronización:** Cuando la conexión se restablece, la aplicación detecta automáticamente el evento `online` y procesa la cola de transacciones pendientes en segundo plano.
*   **Filtrado por Contexto:** El autocompletado es contextual. Al seleccionar la Cuenta Origen, solo se mostrarán cuentas tipo `Asset`. Al seleccionar la Cuenta Destino, solo se mostrarán cuentas tipo `Expense`.
*   **Experiencia de Usuario (UX):** Interfaz minimalista y optimizada para dispositivos móviles, con un autocompletado de alta precisión que maneja la creación de cuentas nuevas.

## 🛠️ Cómo Ejecutar la Aplicación

Dado que es una PWA, debe ser servida a través de un servidor web local (ej: `http-server` o Live Server).

**Pasos de Ejecución:**

1.  Asegúrate de que todos los archivos (`.html`, `.js`, `.json`) estén en la raíz del proyecto.
2.  Ejecuta el servidor web local. (Si usas VS Code, haz clic derecho y selecciona "Open with Live Server").
3.  Accede a la URL `http://localhost:[puerto]`.

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.
