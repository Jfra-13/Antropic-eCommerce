// Floating note that tells whoever opens the link what they are looking at: the real
// storefront build, running against captured data instead of a live backend.
//
// Collapsed to a small pill by default so it never sits on top of the page it is
// describing; click to expand, click the × to dismiss for the session. Rendered outside
// React with its own styles so it cannot interact with the app's layout.

const NOTE_ID = "antropic-demo-note";

export function mountDemoBadge(): void {
  if (document.getElementById(NOTE_ID)) return;

  const style = document.createElement("style");
  style.textContent = `
    #${NOTE_ID} {
      position: fixed; inset-block-end: 14px; inset-inline-end: 14px; z-index: 9999;
      background: #2b1721; color: #fbeef3;
      border: 1px solid rgba(234, 76, 117, .45); border-radius: 999px;
      box-shadow: 0 8px 24px rgba(0,0,0,.25);
      font: 400 12.5px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
      max-width: min(330px, calc(100vw - 28px));
    }
    #${NOTE_ID} summary {
      list-style: none; cursor: pointer; padding: 7px 14px; white-space: nowrap;
      font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: #f5a3bd;
    }
    #${NOTE_ID} summary::-webkit-details-marker { display: none; }
    #${NOTE_ID}[open] { border-radius: 12px; }
    #${NOTE_ID}[open] summary { border-block-end: 1px solid rgba(234,76,117,.28); }
    #${NOTE_ID} .body { padding: 10px 14px 12px; }
    #${NOTE_ID} p { margin: 0; }
    #${NOTE_ID} ul { margin: 8px 0 0; padding-inline-start: 16px; }
    #${NOTE_ID} li { margin: 2px 0; }
    #${NOTE_ID} .close {
      background: none; border: 0; color: #f5a3bd; cursor: pointer;
      margin-block-start: 10px; padding: 0; font: inherit; text-decoration: underline;
    }
  `;

  const note = document.createElement("details");
  note.id = NOTE_ID;
  note.innerHTML = `
    <summary>Demo estática · qué es esto</summary>
    <div class="body">
      <p>El storefront real, servido sin backend: los datos son una captura del API
      con el catálogo de ejemplo.</p>
      <ul>
        <li>Iniciar sesión entra directo, sin correo.</li>
        <li>Carrito, favoritos y pedidos viven en esta pestaña.</li>
        <li>Subir la constancia de pago no está disponible.</li>
      </ul>
      <button class="close" type="button">Ocultar aviso</button>
    </div>
  `;
  note.querySelector(".close")?.addEventListener("click", () => note.remove());

  document.head.append(style);
  document.body.append(note);
}
