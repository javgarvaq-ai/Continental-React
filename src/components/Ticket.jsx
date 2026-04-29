import React from 'react';

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatFecha(fechaBase) {
  return new Date(fechaBase || new Date().toISOString()).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildTicketHtml({
  tipo = 'pagado',
  comanda,
  items = [],
  unit,
  payment = null,
}) {
  const folioDisplay = comanda?.folio
    ? `C-${String(comanda.folio).padStart(6, '0')}`
    : '';

  const fechaBase =
    tipo === 'pagado'
      ? comanda?.cobrado_at || new Date().toISOString()
      : comanda?.cuenta_at || new Date().toISOString();

  const fecha = formatFecha(fechaBase);
  const subtotal = Number(comanda?.final_total || 0);
  const totalPagado = payment ? Number(payment.total_paid || 0) : 0;
  const propina = Number(comanda?.tip_total || 0);
  const personas = Number(comanda?.personas || 0);
  const cambio = payment ? Number(payment.change_given || 0) : 0;

  const visibleItems = (items || []).filter((item) => !item.is_free_mixer);

  const sortedItems = [...visibleItems].sort((a, b) => {
    const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;

    if (aCreated !== bCreated) return aCreated - bCreated;
    return String(a.id).localeCompare(String(b.id));
  });

  let itemsHtml = '';
  sortedItems.forEach((item) => {
    const qty = Number(item.quantity || 0);
    const lineTotal = qty * Number(item.unit_price || 0);
    const productName = escapeHtml(item.products?.name || 'Producto');

    itemsHtml += `
          <div class="item">
            <div class="item-name">${productName}</div>
            <div class="item-line">
              <span>${qty} x ${money(item.unit_price)} | </span>
              <span>${money(lineTotal)}</span>
            </div>
          </div>
        `;
  });

  let ticketLabelHtml = '';
  let totalsHtml = '';
  let paymentHtml = '';
  let footerHtml = '';

  if (tipo === 'cuenta') {
    ticketLabelHtml = `
          <div class="ticket-badge">TICKET DE CONSUMO</div>
        `;

    totalsHtml = `
          <div class="divider">--------------------------------</div>
          <div class="row total-row">
            <span>TOTAL</span>
            <span>${money(subtotal)}</span>
          </div>
        `;

    footerHtml = `
          <div class="divider">--------------------------------</div>
          <div class="center footer">Gracias por su visita</div>
          <div class="center footer small">Si requiere factura</div>
          <div class="center footer small">solicítela al momento.</div>
        `;
  }

  if (tipo === 'pagado') {
    ticketLabelHtml = `
          <div class="ticket-badge strong">PAGADO</div>
          <div class="center small">Para uso interno</div>
        `;

    totalsHtml = `
          <div class="divider">--------------------------------</div>
          <div class="row">
            <span>Subtotal</span>
            <span>${money(subtotal)}</span>
          </div>
          <div class="row">
            <span>Propina</span>
            <span>${money(propina)}</span>
          </div>
          <div class="row total-row">
            <span>Total pagado</span>
            <span>${money(totalPagado)}</span>
          </div>
        `;

    paymentHtml = `
  <div class="divider">--------------------------------</div>
  <div class="row">
    <span>Efectivo</span>
    <span>${money(payment?.efectivo || 0)}</span>
  </div>
  <div class="row">
    <span>Tarjeta</span>
    <span>${money(payment?.tarjeta || 0)}</span>
  </div>
  <div class="row">
    <span>Transferencia</span>
    <span>${money(payment?.transferencia || 0)}</span>
  </div>
  <div class="row">
    <span>Cambio</span>
    <span>${money(cambio)}</span>
  </div>
`;

    footerHtml = `
          <div class="divider">--------------------------------</div>
          <div class="center footer">Gracias por su visita</div>
        `;
  }

  return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Ticket ${escapeHtml(folioDisplay)}</title>
          <style>
            @page {
              size: 58mm auto;
              margin: 0;
            }

            * {
              box-sizing: border-box;
            }

            html, body {
              margin: 0;
              padding: 0;
              background: #fff;
              color: #000;
              font-family: "Courier New", Courier, monospace;
              width: 58mm;
            }

            body {
              padding: 0;
            }

            .ticket {
              width: 58mm;
              padding: 3mm 2.5mm 10mm 2.5mm;
              font-size: 11px;
              line-height: 1.4;
            }

            .center {
              text-align: center;
            }

            .title {
              text-align: center;
              font-size: 16px;
              font-weight: bold;
              margin: 0;
            }

            .subtitle {
              text-align: center;
              font-size: 11px;
              margin-top: 2px;
            }

            .ticket-badge {
              text-align: center;
              margin-top: 6px;
              font-size: 11px;
            }

            .ticket-badge.strong {
              font-weight: bold;
            }

            .small {
              font-size: 10px;
            }

            .meta {
              margin-top: 8px;
            }

            .meta div {
              text-align: center;
              margin: 2px 0;
            }

            .divider {
              text-align: center;
              margin: 8px 0;
              white-space: pre;
              overflow: hidden;
            }

            .item {
              margin-bottom: 8px;
            }

            .item-name {
              font-weight: bold;
              word-break: break-word;
              margin-bottom: 2px;
            }

            .item-line,
            .row {
              display: flex;
              justify-content: space-between;
              gap: 8px;
              align-items: flex-start;
            }

            .item-line span:first-child,
            .row span:first-child {
              flex: 1;
            }

            .item-line span:last-child,
            .row span:last-child {
              white-space: nowrap;
              text-align: right;
            }

            .total-row {
              font-weight: bold;
              font-size: 12px;
            }

            .footer {
              margin-top: 4px;
            }

            .feed div {
              height: 6mm;
            }

            @media print {
              html, body {
                width: 58mm;
                margin: 0 !important;
                padding: 0 !important;
              }

              .ticket {
                width: 58mm;
                margin: 0;
                padding: 3mm 2.5mm 10mm 2.5mm;
              }
            }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="title">Continental</div>
            <div class="subtitle">Cantina • Bar</div>

            ${ticketLabelHtml}

            <div class="meta">
              <div>Folio: ${escapeHtml(folioDisplay)}</div>
              <div>Mesa: ${escapeHtml(unit?.name || '')}</div>
              <div>Fecha: ${escapeHtml(fecha)}</div>
              <div>Personas: ${personas}</div>
            </div>

            <div class="divider">--------------------------------</div>

            ${itemsHtml}

            ${totalsHtml}

            ${paymentHtml}

            ${footerHtml}

            <div class="feed">
              <div>&nbsp;</div>
              <div>&nbsp;</div>
              <div>&nbsp;</div>
              <div>&nbsp;</div>
              <div>&nbsp;</div>
              <div>&nbsp;</div>
            </div>
          </div>
        </body>
      </html>
    `;
}

export function printTicket({ tipo = 'pagado', comanda, items, unit, payment = null }) {
  const html = buildTicketHtml({
    tipo,
    comanda,
    items,
    unit,
    payment,
  });

  const printWindow = window.open('', '_blank', 'width=420,height=800');

  if (!printWindow) {
    alert('El navegador bloqueó la ventana de impresión.');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = function () {
    setTimeout(function () {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        console.error('Error printing ticket:', error);
      }
    }, 250);
  };
}

export default function Ticket() {
  return null;
}